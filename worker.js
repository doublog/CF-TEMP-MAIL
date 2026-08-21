/*
====================================================
 Temp Mail v3.1 Stable

 Cloudflare Worker + KV + Email Routing

 Part 1/3

 修复：
 - create is not defined
 - copyEmailBtn SyntaxError
 - mail token 校验
 - 前端脚本加载问题
====================================================
*/


/*
====================================================
 CONFIG
====================================================
*/

const CONFIG = {

    DOMAINS:[

        "mail.example.com",

        "tmp.example.com"

    ],

    EXPIRE:3600,

    MAX_MAIL:20,

    MAX_SIZE:200000,

    NAME_MIN:3,

    NAME_MAX:20

};



const RESERVED=[

"admin",
"root",
"support",
"postmaster",
"abuse",
"security",
"webmaster"

];




/*
====================================================
 Worker
====================================================
*/


export default {


async fetch(request,env){


const url=new URL(request.url);



/*
 首页
*/

if(url.pathname==="/"){


return new Response(

html(),

{

headers:{

"content-type":
"text/html;charset=UTF-8"

}

}

);


}




/*
 创建邮箱
*/

if(url.pathname==="/api/new"){


const captcha=url.searchParams.get("token");



if(env.TURNSTILE_SECRET){


let ok=await verifyTurnstile(

captcha,

env

);


if(!ok){

return Response.json(

{

error:"captcha failed"

},

{

status:403

}

);

}


}




let name=url.searchParams.get("name");



let id;



if(name){


name=name.toLowerCase();



if(!validMailbox(name)){


return Response.json(

{

error:"invalid mailbox"

},

{

status:400

}

);


}



if(RESERVED.includes(name)){


return Response.json(

{

error:"name forbidden"

},

{

status:400

}

);


}



id=name;



}

else{


id=randomID();


}





let token=crypto.randomUUID();


let domain=randomDomain();




await env.MAIL_KV.put(

"box:"+id,


JSON.stringify(

{

id,

domain,

token,

created:Date.now()

}

),


{

expirationTtl:CONFIG.EXPIRE

}

);





return Response.json(

{

email:id+"@"+domain,

box:id,

token

}

);



}





/*
读取邮件
*/


if(url.pathname==="/api/mail"){


let box=url.searchParams.get("box");


let token=url.searchParams.get("token");



let info=await env.MAIL_KV.get(

"box:"+box,

"json"

);



if(

!info ||

info.token!==token

){


return Response.json(

{

error:"invalid token"

},

{

status:403

}

);


}




let mails=

await env.MAIL_KV.get(

"mail:"+box,

"json"

)

||

[];





return Response.json(

mails

);


}






return new Response(

"Not Found",

{

status:404

}

);


},



/*
====================================================
 Email Routing
====================================================
*/


async email(message,env){


const mailbox=

message.to

.split("@")[0];




let box=

await env.MAIL_KV.get(

"box:"+mailbox,

"json"

);



if(!box){

return;

}





let raw=

await streamToText(

message.raw

);



if(raw.length>CONFIG.MAX_SIZE){

return;

}




let mail=parseMail(raw);



let mails=

await env.MAIL_KV.get(

"mail:"+mailbox,

"json"

)

||

[];





mails.unshift(

{

id:randomID(),

from:decodeHeader(

message.from

),

subject:decodeHeader(

message.headers.get("subject")||""

),

body:mail.body,

html:mail.html,

code:extractCode(

mail.body

),

time:Date.now()

}

);






if(mails.length>CONFIG.MAX_MAIL){


mails=mails.slice(

0,

CONFIG.MAX_MAIL

);


}




await env.MAIL_KV.put(

"mail:"+mailbox,

JSON.stringify(mails),

{

expirationTtl:CONFIG.EXPIRE

}

);



}


};
/*
====================================================
 MIME Parser
====================================================
*/


function parseMail(raw){


let result={

body:"",

html:""

};



let match=

raw.match(

/boundary\s*=\s*"?([^";\r\n]+)"?/i

);



if(match){


let boundary=match[1].trim();



let parts=

raw.split(

"--"+boundary

);



for(let part of parts){



if(

/Content-Type:\s*text\/plain/i.test(part)

&&

!result.body

){

result.body=decodePart(part);

}




if(

/Content-Type:\s*text\/html/i.test(part)

){

result.html=decodePart(part);

}


}


}

else{


result.body=decodePart(raw);


}





if(

!result.body && result.html

){


result.body=stripHTML(

result.html

);


}



result.body=cleanQuote(

result.body

);



return result;


}





/*
====================================================
 MIME Decode
====================================================
*/


function decodePart(part){



let base64=

/Content-Transfer-Encoding:\s*base64/i

.test(part);



let qp=

/Content-Transfer-Encoding:\s*quoted-printable/i

.test(part);




let index=

part.indexOf(

"\r\n\r\n"

);



if(index>=0){


part=

part.substring(

index+4

);


}





if(base64){


try{


return decodeBase64(part);


}

catch(e){}



}





if(qp){


return decodeQP(part);


}





return part.trim();


}






/*
====================================================
 Base64
====================================================
*/


function decodeBase64(str){



str=str

.replace(

/[\r\n\s]/g,

""

)

.replace(

/[^A-Za-z0-9+/=]/g,

""

);




let bytes=

Uint8Array.from(

atob(str),

c=>c.charCodeAt(0)

);




return decodeCharset(bytes);



}





/*
====================================================
 Charset
====================================================
*/


function decodeCharset(bytes){


const charsets=[

"utf-8",

"gb18030",

"big5"

];



for(let charset of charsets){


try{


let decoder=new TextDecoder(

charset,

{

fatal:true

}

);



let text=decoder.decode(bytes);



if(text && !text.includes("�")){


return text;


}


}

catch(e){}



}



return new TextDecoder(

"utf-8"

)

.decode(bytes);


}







/*
====================================================
 Quoted Printable
====================================================
*/


function decodeQP(str){

let bytes=[];


str=str.replace(

/=\r?\n/g,

""

);



str=str.replace(

/=([A-Fa-f0-9]{2})/g,

(_,h)=>{


bytes.push(

parseInt(h,16)

);


return "";

}

);



if(bytes.length){


try{


return decodeCharset(

new Uint8Array(bytes)

);


}

catch(e){}



}



return str;


}








/*
====================================================
 RFC2047 Header Decode
====================================================
*/


function decodeHeader(str){


if(!str)

return "";



return str.replace(



/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g,



(

match,

charset,

type,

data

)=>{



try{


if(

type.toUpperCase()==="B"

){



let bytes=

Uint8Array.from(

atob(data),

c=>c.charCodeAt(0)

);



return new TextDecoder(

charset||"gb18030"

)

.decode(bytes);



}




if(

type.toUpperCase()==="Q"

){


let bytes=[];



data

.replace(

/_/g,

" "

)

.replace(

/=([A-Fa-f0-9]{2})/g,

(_,h)=>{


bytes.push(

parseInt(h,16)

);


return "";

}

);



return new TextDecoder(

charset||"gb18030"

)

.decode(

new Uint8Array(bytes)

);


}




}

catch(e){}



return match;



}



);



}






/*
====================================================
 HTML 转文本
====================================================
*/


function stripHTML(text){


if(!text)

return "";



return text


.replace(

/<style[\s\S]*?<\/style>/gi,

""

)


.replace(

/<script[\s\S]*?<\/script>/gi,

""

)


.replace(

/<[^>]+>/g,

" "

)


.replace(

/&nbsp;/gi,

" "

)


.replace(

/\s+/g,

" "

)


.trim();


}






/*
====================================================
 清理引用
====================================================
*/


function cleanQuote(text){



return text

.replace(

/^\s*>\s?/gm,

""

)

.trim();


}






/*
====================================================
 验证码提取
====================================================
*/


function extractCode(text){



if(!text)

return "";



const rules=[


/验证码[\s:：-]*(\d{4,8})/,

/动态密码[\s:：-]*(\d{4,8})/,

/verification\s*code[\s:：-]*(\d{4,8})/i,

/security\s*code[\s:：-]*(\d{4,8})/i,

/otp[\s:：-]*(\d{4,8})/i,

/passcode[\s:：-]*(\d{4,8})/i,

/\b\d{6}\b/,

/\b\d{4}\b/


];





for(let rule of rules){


let m=text.match(rule);



if(m){


return (

m[1]||

m[0]

)

.replace(

/\s/g,

""

);


}



}



return "";


}
/*
====================================================
 Turnstile
====================================================
*/


async function verifyTurnstile(token,env){


if(!token)

return false;



let res=

await fetch(

"https://challenges.cloudflare.com/turnstile/v0/siteverify",

{

method:"POST",

headers:{

"content-type":"application/json"

},

body:JSON.stringify({

secret:env.TURNSTILE_SECRET,

response:token

})

}

);



let data=

await res.json();



return data.success===true;


}







/*
====================================================
 工具函数
====================================================
*/


function validMailbox(name){


return new RegExp(

"^[a-zA-Z0-9_-]{"+

CONFIG.NAME_MIN+

","+

CONFIG.NAME_MAX+

"}$"

)

.test(name);


}



function randomID(){


return crypto

.randomUUID()

.replace(/-/g,"")

.substring(0,10);


}



function randomDomain(){


return CONFIG.DOMAINS[

Math.floor(

Math.random()*CONFIG.DOMAINS.length

)

];


}



async function streamToText(stream){


let reader=

stream.getReader();


let chunks=[];



while(true){


let {

done,

value

}=await reader.read();



if(done)

break;



chunks.push(value);


}



let length=

chunks.reduce(

(a,b)=>a+b.length,

0

);



let buffer=

new Uint8Array(length);



let offset=0;



for(let chunk of chunks){


buffer.set(

chunk,

offset

);


offset+=chunk.length;


}



return new TextDecoder()

.decode(buffer);


}







/*
====================================================
 Frontend
====================================================
*/


function html(){

return `<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<title>
Temp Mail v3.1
</title>


<style>

body{

font-family:
Arial,
"Microsoft YaHei",
sans-serif;

background:#f5f7fa;

padding:30px;

}


.card{

max-width:700px;

margin:auto;

background:#fff;

padding:25px;

border-radius:15px;

box-shadow:
0 5px 20px rgba(0,0,0,.08);

}


h2{

text-align:center;

}


input{

width:70%;

padding:12px;

border-radius:8px;

border:1px solid #ddd;

font-size:16px;

}



button{

padding:10px 18px;

border:0;

border-radius:8px;

background:#1677ff;

color:white;

cursor:pointer;

}


button:hover{

opacity:.85;

}



.mailbox{

margin-top:20px;

padding:15px;

background:#eef6ff;

border-radius:10px;

}



.mail{

margin-top:15px;

padding-bottom:15px;

border-bottom:1px solid #eee;

}



.code{

color:red;

font-size:26px;

font-weight:bold;

}



</style>



<!-- Cloudflare Turnstile -->

<script

src="https://challenges.cloudflare.com/turnstile/v0/api.js"

async

defer>

</script>


</head>



<body>


<div class="card">


<h2>
📧 Temp Mail v3.1
</h2>



<p>
自定义邮箱名：
</p>



<input

id="name"

placeholder="例如 test123">



<br><br>



<!-- Turnstile -->

<div

class="cf-turnstile"

data-sitekey="0x4AAAAAAEWdvIdQxIGsLPy3"

data-theme="light">

</div>



<br>



<button id="createBtn">

创建邮箱

</button>




<div

id="box"

class="mailbox">

未创建邮箱

</div>




<div id="list">

</div>



</div>






<script>


let email="";

let box="";

let token="";





/*
恢复状态
*/


let saved=

localStorage.getItem(

"tempMail"

);



if(saved){


try{


let data=

JSON.parse(saved);


email=data.email || "";

box=data.box || "";

token=data.token || "";


if(email){

showBox();

load();

}



}

catch(e){}



}








document

.getElementById("createBtn")

.onclick=create;






async function create(){



let name=

document

.getElementById("name")

.value

.trim();





/*
读取 Turnstile token

*/


let captcha=

document.querySelector(

'[name="cf-turnstile-response"]'

)?.value;



if(!captcha){


alert(

"请完成人机验证"

);


return;


}






let url=

"/api/new?token="

+

encodeURIComponent(captcha);






if(name){


url +=

"&name="

+

encodeURIComponent(name);



}





let res=

await fetch(url);



let data=

await res.json();






if(data.email){



email=data.email;

box=data.box;

token=data.token;





localStorage.setItem(

"tempMail",

JSON.stringify({

email,

box,

token

})

);





showBox();


load();



}

else{


alert(

data.error ||

"创建失败"

);



}


}









function showBox(){



document

.getElementById("box")

.innerHTML=

"当前邮箱：<b>"

+

escapeHTML(email)

+

"</b><br><br>"

+

"<button id='copyEmailBtn'>"

+

"复制邮箱"

+

"</button>";



}








document.addEventListener(

"click",

function(e){



if(

e.target.id==="copyEmailBtn"

){


navigator.clipboard.writeText(

email

);


alert(

"邮箱已复制"

);


}




if(

e.target.classList.contains(

"copyCode"

)

){


navigator.clipboard.writeText(

e.target.dataset.code

);


alert(

"验证码已复制"

);



}



});









async function load(){



if(!box)

return;




let res=

await fetch(

"/api/mail?box="

+

encodeURIComponent(box)

+

"&token="

+

encodeURIComponent(token)

);



let data=

await res.json();



if(

!Array.isArray(data)

)

return;





let out="";





for(let m of data){



out +=

"<div class='mail'>"

+

"<b>"

+

escapeHTML(m.subject)

+

"</b>"

+

"<br>"

+

escapeHTML(m.from)

+

"<br><br>"

+

"<pre>"

+

escapeHTML(m.body)

+

"</pre>"

+

(

m.code

?

"<div class='code'>"

+

"验证码："

+

escapeHTML(m.code)

+

"<br><br>"

+

"<button class='copyCode' data-code='"

+

escapeHTML(m.code)

+

"'>"

+

"复制验证码"

+

"</button>"

+

"</div>"

:

""

)

+

"</div>";



}



document

.getElementById("list")

.innerHTML=out;



}








function escapeHTML(str){



if(!str)

return "";



return String(str)

.replace(/&/g,"&amp;")

.replace(/</g,"&lt;")

.replace(/>/g,"&gt;")

.replace(/"/g,"&quot;");

}




setInterval(

load,

5000

);



</script>


</body>

</html>`;

}
