# 📧 Temp Mail v3.1 部署文档

基于：

* Cloudflare Workers
* Cloudflare KV
* Cloudflare Email Routing
* Cloudflare Turnstile

实现的临时邮箱系统。

功能：

✅ 自定义邮箱名
✅ 随机邮箱生成
✅ Cloudflare Email Routing 收件
✅ KV 保存邮件
✅ 中文邮件解析
✅ Base64 / Quoted Printable 解码
✅ 验证码自动提取
✅ Turnstile 防机器人
✅ 邮件自动刷新
✅ 邮箱复制
✅ 验证码复制
✅ 邮件展开查看

---

# 一、准备工作

需要准备：

## 1. Cloudflare账号

注册地址：

[https://dash.cloudflare.com](https://dash.cloudflare.com)

---

## 2. 一个自己的域名

例如：

```
example.com
```

或者：

```
example.com
```

必须托管到 Cloudflare。

DNS 状态：

```
Active
```

---

# 二、创建邮箱子域名

例如使用：

```
mail.example.com
```

进入：

```
Cloudflare Dashboard

↓

DNS

↓

Add Record
```

添加：

类型：

```
MX
```

名称：

```
mail
```

目标：

```
route1.mx.cloudflare.net
```

优先级：

```
10
```

保存。

继续添加 Cloudflare Email Routing 要求的 MX 记录。

最终类似：

```
mail.example.com

MX
route1.mx.cloudflare.net

MX
route2.mx.cloudflare.net

MX
route3.mx.cloudflare.net
```

---

# 三、开启 Email Routing

进入：

```
Cloudflare

↓

Email

↓

Email Routing
```

点击：

```
Enable Email Routing
```

选择：

```
Custom address
```

绑定 Worker。

---

# 四、创建 Cloudflare KV

进入：

```
Workers & Pages

↓

KV

↓

Create namespace
```

创建：

名称：

```
MAIL_KV
```

例如：

```
TEMP_MAIL_KV
```

---

# 五、创建 Worker

进入：

```
Workers & Pages

↓

Create Application

↓

Create Worker
```

名称：

例如：

```
temp-mail
```

---

部署代码：

上传：

```
worker.js
```

结构：

```
temp-mail

├── worker.js

```

---

# 六、绑定 KV

进入：

```
Worker

↓

Settings

↓

Bindings

↓

Add binding
```

类型：

```
KV Namespace
```

变量名称：

必须和代码一致：

```
MAIL_KV
```

KV Namespace：

选择：

```
TEMP_MAIL_KV
```

保存。

---

# 七、配置环境变量

进入：

```
Worker

↓

Settings

↓

Variables
```

添加：

## Turnstile 密钥

变量：

```
TURNSTILE_SECRET
```

值：

```
你的 Turnstile Secret Key
```

---

# 八、创建 Cloudflare Turnstile

进入：

[https://dash.cloudflare.com](https://dash.cloudflare.com)

路径：

```
Turnstile

↓

Add Site
```

填写：

名称：

```
Temp Mail
```

域名：

例如：

```
temp.example.com
```

选择：

```
Managed
```

创建。

获得两个 KEY：

---

## Site Key

用于前端：

```html
data-sitekey="xxxxx"
```

---

## Secret Key

用于 Worker：

```
TURNSTILE_SECRET
```

---

# 九、配置 Worker 域名

进入：

```
Workers

↓

Custom Domains
```

添加：

例如：

```
temp.example.com
```

等待 SSL 生效。

---

# 十、配置 Email Routing 到 Worker

进入：

```
Email Routing

↓

Routes

↓

Create address
```

规则：

例如：

```
*@mail.example.com
```

目标：

选择：

```
Worker
```

选择：

```
temp-mail
```

保存。

---

# 十一、修改 worker.js 配置

找到：

```javascript
const CONFIG = {

DOMAINS:[

"mail.example.com",

"tmp.example.com"

]

}
```

修改成自己的邮箱域名：

例如：

```javascript
DOMAINS:[

"mail.example.com"

]
```

---

# 十二、部署

方式1：

Cloudflare网页：

```
Workers

↓

Edit Code

↓

Paste worker.js

↓

Deploy
```

---

方式2：

Wrangler

安装：

```bash
npm install -g wrangler
```

登录：

```bash
wrangler login
```

部署：

```bash
wrangler deploy
```

---

# 十三、测试

打开：

```
https://你的域名
```

例如：

```
https://temp.example.com
```

输入：

```
test123
```

完成 Turnstile。

点击：

```
创建邮箱
```

得到：

```
test123@mail.example.com
```

---

# 十四、测试收信

使用 Gmail：

发送：

```
收件人:

test123@mail.example.com
```

内容：

```
测试中文

验证码 888888
```

等待：

约5秒

页面显示：

```
📨 测试中文


验证码：

888888
```

---

# 十五、KV 数据结构

## 邮箱信息

Key:

```
box:test123
```

Value:

```json
{
"id":"test123",

"domain":"mail.example.com",

"token":"xxxx",

"created":123456789
}
```

---

## 邮件数据

Key:

```
mail:test123
```

Value:

```json
[
{
"from":"xxx@gmail.com",

"subject":"验证码",

"body":"验证码888888",

"code":"888888",

"time":123456789

}
]
```

---

# 十六、常见问题

## 1. 创建邮箱失败

提示：

```
captcha failed
```

检查：

* Turnstile Site Key
* Secret Key
* 环境变量

---

## 2. 收不到邮件

检查：

Cloudflare：

```
Email Routing

↓

Routes
```

是否：

```
Worker
```

---

## 3. 中文乱码

检查：

worker.js：

```javascript
decodeCharset()
```

优先：

```
utf-8
```

再：

```
gb18030
```

---

## 4. favicon 404

可以忽略。

或者增加：

```
/favicon.ico
```

路由。

---

# 十七、安全建议

生产环境建议：

增加：

* IP限流
* 邮箱创建次数限制
* 黑名单
* 邮件大小限制
* KV 定期清理

推荐：

```
单IP:

每小时20个邮箱
```

---

# 十八、目录结构

最终：

```
temp-mail

│

├── worker.js

│

└── README.md

```

---

# 十九、版本记录

## v3.1

新增：

* Turnstile
* 中文邮件解析
* 验证码提取
* 邮件刷新
* 邮件时间
* 邮件展开

---

## 后续计划 v3.2

计划：

* 邮箱倒计时
* 删除邮箱
* 深色模式
* HTML邮件查看
* 限流系统
* 管理后台

---

# 完成

部署完成后，你拥有一个：

**基于 Cloudflare 全球边缘网络运行的无服务器临时邮箱系统。**

架构：

```
用户
 |
 |
Cloudflare Worker
 |
 |
KV Storage
 |
 |
Email Routing
 |
 |
真实邮箱系统
```

无服务器、低成本、全球访问。
