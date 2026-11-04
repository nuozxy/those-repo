# 部署手册 · 1Panel

这套前台是**标准静态站点 + 独立 API 网关**。部署流程和你平时在 1Panel 上放一个静态网站完全一样：建站 → 上传 → 绑定域名 → 申请证书。区别只有一处：页面里的数据来自 `config.js` 里填的 API 地址。

---

## 一、先搞清楚"纯静态"是什么意思

| | 说明 |
|---|---|
| 构建产物 | `index.html` + `assets/*.js/css` + `config.js`，纯静态文件，**没有 Node 进程常驻** |
| 运行时 | 浏览器加载页面后，用 `fetch` 调 API 取数据，前端不直连数据库 |
| 和"传统 PHP 站"的区别 | 页面骨架不再由服务端拼好，而是浏览器渲染；数据仍由原来的服务器提供 |
| 是否需要 SSR | 不需要。这是登录后的应用，内容不需要被搜索引擎收录，SSR 只会多养一个进程 |

所以"纯静态"指的是**交付形态**，不是"没有后端"。你的后端一直在原服务器上（NexusPHP + BFF 网关），我们只是把 UI 那一层搬走了。

---

## 二、两种部署形态，选一个

### 形态 A：前端 + 接口在同一台机器（推荐，省事）

```
浏览器 ──► https://pt.example.com/         (1Panel 静态网站，放 dist)
              └─ /bff/*  ──反代──► 127.0.0.1:8787  (BFF 网关)
                                        └──► NexusPHP /api/v1
```

- `config.js` 里 `apiBase: "/bff"`
- 会话走 HttpOnly cookie，最安全
- nginx 需要加一段 `/bff/` 反代（`deploy/frontend/nginx-spa.conf` 第 4 节）

### 形态 B：前端在新服务器，接口在老服务器（彻底分离）

```
浏览器 ──► https://ui.example.com/     (新服务器 · 1Panel 静态网站)
              │
              └─ fetch ──► https://pt.example.com/bff/*   (老服务器 · BFF)
```

- `config.js` 里 `apiBase: "https://pt.example.com/bff"`
- `config.js` 里 `apiKey: "一串你自己的密钥"`（与后端 `appKey` 一致）
- 跨域时前端自动切换为 `Authorization` + `X-Tey-Session` 请求头，**不依赖第三方 cookie**，不会被浏览器拦截
- 老服务器要允许跨域：`bff/config.json` 里 `corsOrigins` 填新前端的域名

> 两种形态可以随时切换，只改 `config.js` 一个文件，不用重新构建。

---

## 三、1Panel 操作步骤（图形界面）

### 步骤 1 · 准备压缩包

在开发机执行：

```bash
bash deploy/frontend/build.sh
```

产物在 `deploy/frontend/out/tey-frontend-<时间戳>.tar.gz`。

### 步骤 2 · 创建网站

1Panel 左侧 **网站 → 创建网站**

| 字段 | 填什么 |
|---|---|
| 类型 | **静态网站** |
| 主域名 | 例如 `pt.example.com`（或 `ui.example.com`） |
| 网站目录 | 默认即可，例如 `/opt/1panel/apps/openresty/openresty/www/sites/pt.example.com/index` |
| 端口 | 80 |

创建后记下**网站目录**，下一步要用。

### 步骤 3 · 上传并解压

**网站 → 你的站点 → 目录**，进入根目录：

1. 点「上传」，选择 `tey-frontend-xxxx.tar.gz`
2. 上传完成后右键压缩包 →「解压」
3. 解压后确认目录结构是：

```
/opt/.../sites/pt.example.com/index/
├── index.html
├── config.js          ← 要改的就是这个
├── favicon.ico
└── assets/
    ├── index-xxxx.css
    ├── vendor-xxxx.js
    └── ...
```

⚠️ **不要多一层 `dist/` 目录**，`index.html` 必须在网站根目录下。

### 步骤 4 · 改 config.js

**网站 → 目录 → 编辑 `config.js`**：

形态 A（同机）：

```js
window.__TEY_CONFIG__ = {
  apiBase: '/bff',
  apiKey: '',
  appName: 'TEY · 太乙',
};
```

形态 B（跨机）：

```js
window.__TEY_CONFIG__ = {
  apiBase: 'https://pt.example.com/bff',
  apiKey: '这里填你生成的密钥',
  appName: 'TEY · 太乙',
};
```

保存即可生效，**不需要重启、不需要重新构建**。

### 步骤 5 · 改 nginx 配置

**网站 → 你的站点 → 配置修改**，在 `server { ... }` 块内加入 `deploy/frontend/nginx-spa.conf` 的内容（形态 A 需要第 4 节的反代；形态 B 不需要）。

最少必须有这一段，否则刷新子页面会 404：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

保存后 1Panel 会自动 reload。

### 步骤 6 · 绑定域名 + HTTPS

1. **网站 → 域名管理**：确认域名已绑定，DNS 已解析到本机
2. **网站 → HTTPS**：选择 Let's Encrypt，申请证书，打开「强制 HTTPS」
3. 开启后 `http` 会自动跳 `https`

### 步骤 7 · 自检

浏览器打开 `https://pt.example.com`，逐项确认：

- [ ] 首页能出种子列表（不是空白、不是一直转圈）
- [ ] 按 F12 → Network，找一条 `/bff/torrents`，状态 200
- [ ] 刷新 `/torrents` 这种子路径，不会 404（验证 try_files 生效）
- [ ] 点「登录」，用原站账号能登进去
- [ ] 顶栏出现用户名，数据条出现分享率（说明 `/bff/me` 通了）
- [ ] 封面能显示（没有则看是不是图床被墙，BFF 会自动代理）

---

## 四、后端要配的东西（老服务器）

编辑 `bff/config.json`：

```json
{
  "upstream": "http://192.168.1.10",
  "token": "5|xxxx",
  "tokenUid": 1,
  "appKey": "",
  "corsOrigins": ["*"]
}
```

| 字段 | 说明 |
|---|---|
| `upstream` | NexusPHP 站点地址 |
| `token` | 只读 API 用的 Sanctum token |
| `tokenUid` | 上面 token 归属的 UID，用于校验"发布种子"的身份一致性 |
| `appKey` | 客户端密钥。**留空 = 不校验**；填了之后前端必须在 `config.js` 里带同样的值 |
| `corsOrigins` | 允许跨域的前端来源。`["*"]` 全部允许；收紧就写 `["https://ui.example.com"]` |

生成一个密钥：

```bash
openssl rand -hex 24
```

> 关于 `appKey` 的定位：它写在浏览器里，任何人 F12 都能看到。作用是挡掉"别人的前端偷偷调你的接口"，**不是用户身份凭证**。用户身份由登录会话负责。

---

## 五、常见问题

**刷新页面 404**
`try_files $uri $uri/ /index.html;` 没加，或者加在了错误的位置。必须在 `server` 块内。

**页面白屏、控制台报 `Failed to fetch`**
1. `config.js` 里的 `apiBase` 写错了（跨域要带 `https://`）
2. 老服务器没开 CORS —— 检查 `bff/config.json` 的 `corsOrigins`
3. 浏览器控制台看具体报错：`CORS policy` 是后端问题，`ERR_CONNECTION_REFUSED` 是地址/端口问题

**跨域时登录后马上又变成未登录**
浏览器拦截了第三方 cookie。确认走的是跨域模式：`config.js` 的 `apiBase` 是**完整 URL**（不是 `/bff`），前端会自动改用 `X-Tey-Session` 头。

**封面全是占位图**
图床被墙。BFF 的 `/bff/img` 会代为抓取并缓存到磁盘，第一次慢一点，之后走缓存。检查 BFF 的 `.cache/img` 目录有没有权限写。

**更新版本后还是旧页面**
`index.html` 和 `config.js` 被缓存了。本手册的 nginx 配置里已经对这两个文件加了 `no-cache`；如果用 CDN，记得一起刷。

**上传种子报 413**
nginx 的 `client_max_body_size` 太小，`nginx-spa.conf` 里已设 `4m`，按需调大。

---

## 六、目录与命令速查

```bash
# 开发
cd web && npm run dev            # http://localhost:5173，/bff 自动代理到 BFF_TARGET

# 构建 + 打包
bash deploy/frontend/build.sh

# 只构建
cd web && npm run build          # 产物在 web/dist

# 类型检查
cd web && npm run typecheck
```


---

## 长尾页面（容器通道）

原站还有 100 多个页面（勋章、魔力值、H&R、日志、求种、候选、字幕、FAQ、站点统计……）。
它们不走 React 重写，由 BFF 的 `/legacy` 通道接管：带你的登录会话去抓原站页面，
裁掉原站的页头页脚导航，把链接和表单动作改写成代理地址，再嵌进新 UI 的容器里。

**对使用者的感受**：顶栏、页脚、主题切换、搜索都是新 UI 的，中间内容区是原站页面，
功能与原站完全一致（表单能提交、分页能翻、排序能点）。

**部署要求**：`/bff` 反代必须放行 `/legacy` 与 `/asset` 两个路径（默认配置里已经包含，
因为都是 `/bff/` 前缀，无需额外配置）。

**跨域部署的注意点**：iframe 属于第三方上下文，浏览器的 SameSite 策略不会带上 BFF 的会话
cookie。前端会自动在地址里带 `sid` 参数，BFF 也会给容器内的链接补上 `sid`，所以跨域也能正常用。
唯一代价是 `sid` 会出现在 iframe 的地址里——它是本次会话的临时标识，不是账号密码。

**已知限制**：

- 容器里的页面样式是原站的，只做了底色与配色桥接，不会和原生页面完全一致
- 原站自己缺的资源（例如 `theme/default/layer.css`）在容器里同样缺，控制台会有一条 404，
  不影响功能；原站直接访问也是一样的
- 移动端容器里的表格需要横向滑动

---

## 没有 API 的页面怎么原生化

NexusPHP 只给种子开放了 `/api/v1`。论坛、魔力商城这类页面没有任何 JSON 接口，
但它们的前端结构是稳定的表格——BFF 里放了一层「HTML → JSON」适配（`bff/legacy_api.php`），
带会话抓页面、用 `DOMXPath` 解析成结构体，前端当普通接口用。

已经原生化：

| 页面 | 路由 | 读 | 写 |
|---|---|---|---|
| 论坛首页 | `/forum` | `forums.php` | — |
| 版块主题列表 | `/forum/f/:id` | `?action=viewforum` | — |
| 主题详情 | `/forum/t/:id` | `?action=viewtopic` | 回帖 `?action=post` |
| 魔力商城 | `/shop` | `mybonus.php` | 兑换 `?action=exchange` |

**BFF 文件结构**：`bff/index.php`（路由与通用函数）+ `bff/legacy_api.php`（页面解析）。
两个文件都要传到服务器的 `bff/` 目录，`index.php` 会 `require` 后者。

**加一个页面要写多少**：一个 `parse_xxx()` 解析函数（30–80 行）+ 一条路由 + 一个 React 页面。
表单型页面还要接一条 POST 转发。内容型页面（规则、FAQ、公告）最简单，直接取正文 HTML 消毒即可。

**回帖实测**：`POST /bff/forum/reply` 返回 `{"ok":true,"msg":"回复已发布"}`，
楼层立即出现在原站与新 UI；错误内容（空正文、会话过期）分别返回 400 / 401。
