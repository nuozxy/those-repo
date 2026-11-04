# 1Panel 部署：纯静态 API 前台（多站点版）

这一版**默认没有后端**：不需要 PHP、不需要 BFF、不需要反代。
构建产物是一堆静态文件，任何一个静态站点都能跑；多个 NexusPHP 站点可以同时挂在一个前台里。

唯一的可选服务端组件是「图片代理」（第七节），不装也能用。

---

## 一、为什么不需要后端

站点开放 API 已经做好了跨域：

```
OPTIONS /api/v1/torrents
204 No Content
Access-Control-Allow-Origin: <你填的任意域名>
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: authorization
```

POST 端点（`/upload`、`/bookmarks`）也返回 `Allow-Methods: POST`。
所以浏览器可以直接带 `Authorization: Bearer <个人令牌>` 调接口，跨域、跨机器、跨域名都行。

---

## 二、上传文件

1. 本地构建，或直接解开交付包 `those-api-frontend-*.tar.gz`：

```bash
cd api-ui
npm install
npm run build
```

2. 1Panel → 网站 → 创建网站（静态）→ 记下站点目录，例如
   `/opt/1panel/www/sites/pt-ui/index`
3. 把 `api-ui/dist/` 里的**全部内容**上传进去（`index.html`、`assets/`、`config.js`）

交付包里另外带 `nginx-spa.conf.txt`、`部署说明.md`、`optional/image-proxy/img.php`，
都是参考 / 可选组件，`img.php` 的用法见第七节。

---

## 三、改 config.js：品牌与站点

`config.js` 是运行时配置，改完刷新就生效，不用重新构建。交付包默认是这样：

```js
window.__TEY_API__ = {
  brand: 'Those',      // 前台自己的品牌：顶栏图标旁、登录页、页脚，不是站点名
  activeSite: '',      // 留空：首次访问进 /login 的接入表单
  imageMode: 'auto',   // auto / direct / proxy / off
  sites: [],           // 预置站点清单，可以一个都不放
};
```

### 第一次打开：接入站点

`sites` 为空时，打开 `/login` 会直接给出四个必填项：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| 站点标识 | `those` | 2-24 位小写字母 / 数字 / `-` `_`，只用来区分本站令牌，建后不改 |
| 站点名称 | `Those` | 顶栏、切换器、页脚里显示的名字，随时可改 |
| API 地址 | `https://pt.example.com/api/v1` | 该站 NexusPHP 开放 API 根地址 |
| 访问令牌 | `7|xxxxxxxx` | 这个用户在该站「控制面板 → 访问令牌」创建的 |

填完点「保存并登录」，会用 `GET /profile` 当场验令牌，通过后直接进站。
站点与令牌都只存这台浏览器，不写服务器文件；换设备要重新接入。
之后再打开 `/login` 会列出已接入的站点，右上角「接入站点」可以继续加。

### 想预置站点（所有访问者默认可见）

在 `sites[]` 里加一项即可，字段和多站点切换逻辑完全不变：

```js
sites: [
  { id: 'those', name: 'Those', apiBase: 'https://pt.example.com/api/v1', color: '#2bd9c4' },
  { id: 'other', name: '另一个站', apiBase: 'https://pt2.example.com/api/v1', color: '#5b9dff' },
],
```

- **本机加站**：网站里「连接设置 → 站点管理 → 添加站点」，同样有标识 / 名称 / API / 令牌四项
- **切换站点**：顶栏下拉直接切；切换是整页跳转，绝不会把上一站的令牌用到下一站
- **站点总览**：`/sites` 并发显示每个站的种子数、登录账号与封面

注意：

- `apiBase` 同域填 `/api/v1`，跨域填完整地址；HTTPS 前端配 HTTP 接口会被混合内容拦截，两边协议一致
- `id` 定了就别改：令牌按 `id` 存在浏览器里，改 `id` 等于换站、要重新登录
- 预置站点可以被本机隐藏 / 覆盖，不影响服务器文件
- `config.js` 里**没有令牌字段**，任何人的令牌都不写进网站文件
- 图片代理 `coverProxy` 按站点配置，格式 `{base}?u={url}`，见第七节；交付包不预置任何站点，也就不会带上预览环境的地址

### 收藏

收藏页会合并**普通分区 + 特别分区（蓝光等）**的收藏：`GET /torrents`
只覆盖普通分区，特别分区要按 `/torrents/{section}?filter[bookmark]=1` 单独取，
前端会把所有分区合并、去重后统一筛选 / 排序 / 分页。星标状态也来自这份
合并结果，不会出现「分区页点了收藏、收藏页却是空的」。

---

## 四、站点配置（关键三条）

写在哪：**1Panel → 网站 → 你的站点 → 设置 → 伪静态**，整段直接贴进去即可
（伪静态的内容会被 1Panel 包进 `server` 块，所以**不要**自己再包一层 `server {}`）。
等价做法是「配置文件」页直接改 `server` 块，效果相同；用伪静态的好处是
1Panel 重建配置时不容易丢。

```nginx
# 1. SPA 路由回落（/t/620、/sites 这种路径刷新才不会 404）
location / {
    try_files $uri $uri/ /index.html;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}

# 2. 带 hash 的产物永久缓存
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    access_log off;
}

# 3. 运行时配置不能缓存
location = /config.js {
    add_header Cache-Control "no-cache, must-revalidate";
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    expires -1;
}
location = /index.html {
    add_header Cache-Control "no-cache, must-revalidate";
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    expires -1;
}
```

注意 `add_header` 的坑：**location 里一旦出现任何 `add_header`，就不会再继承外层的**。
所以安全响应头要在每个带 `add_header` 的 location 里重复写一遍（上面已写好），
只写在 server 级的话，`/assets/`、`/config.js`、`/index.html` 这三处是拿不到的。

保存后 1Panel 会自动 reload。**不需要**任何 `proxy_pass`。

### 前面有 Cloudflare 时（those.cc 的实际形态）

站点挂在 Cloudflare 橙色云后面时，源站伪静态不用改，但 Cloudflare 面板要设两处：

1. **缓存 → 配置 → 浏览器缓存 TTL** → 选「遵循现有响应头（Respect Existing Headers）」。
   否则 CF 会把 `config.js` 的 `no-cache` 覆盖成 `max-age=14400`（4 小时），
   改配置后用户长时间看不到生效。实测：不改时 `config.js` 返回
   `Cache-Control: max-age=14400`，改完恢复 `no-cache, must-revalidate`。
2. **SSL/TLS 模式**用「完全（严格）」——源站已给域名签了 Let's Encrypt 证书。

`/assets/*` 的 `immutable` 会被 CF 原样透传，且命中 CF 边缘缓存（`cf-cache-status: HIT`），
用户二次加载更快，无需额外配置。SPA 回落（`try_files`）与安全响应头在 CF 后同样生效。

> 用户接入站点时，API 地址填 PT 站自己的开放 API，如 `https://php.those.cc/api/v1`。
> 不要填内网地址（外网不可达，且 HTTPS 页面调 HTTP 会被混合内容策略拦截）。

---

## 五、用户怎么登录

每个账号、每个站点的令牌都不一样：

1. 用户打开**对应站点**的原站「控制面板」→ `usercp.php` → 「访问令牌」→ 创建
2. 勾选：获取种子列表、查看种子详情、发布种子、查看用户基本信息、添加收藏、删除收藏
3. 复制 `5|xxxx...`（只显示一次）
4. 打开新前台 `/login`，**先在站点 chip 里选好站**，粘贴令牌 → 登录

令牌按 `站点 id` 存在该用户自己的浏览器里（`tey.tokens = { tey: '...', other: '...' }`）。
换账号就退出再登；切站点不会串号，因为**切换站点是整页跳转**，上一站的数据、分页、滚动全部丢弃。

管理员的令牌不会泄露给任何访问者。

> 如果希望用户「输账号密码」就自动拿到令牌，需要第八节里的登录服务。

---

## 六、界面说明（不用配，开箱即是）

- 顶部 sticky 导航 + 状态条 HUD：分享率、上传、下载、积分、魔力、时产、邀请
- 顶栏文字就是**当前站点名**，`TEY` 只保留左侧图标；中间分区项按各站 `/sections` 动态生成（本例「综合」「蓝光」），换站名字跟着换
- 导航里不再有「全部」——只有一个综合分区时它和「综合」完全重复；`/torrents` 路由仍保留（首页「进入片库」可进）
- 深色影院配色（对齐设计系统 `system.html`），右上角可一键切浅色数据台
- 片库支持**海报墙 / 列表双视图**，视图偏好记在本机
- 海报墙按「每页行数」取数，往下滚自动加载下一页、一直铺满；**分页器固定悬浮在视口底部**（不是留在文档末尾），滚到第几十页都能直接翻页或输入页码跳转，例如滚到 10 页不想滚了，直接跳 100 页
- 悬浮条右侧的 `⌄` 可收起成右下角小胶囊（显示当前页 / 总页数），点一下再展开；页面底部已留白，最后一行不会被压住
- 跳页后会**停在该页**，不会立刻又自动续一页；用户再往下滚才继续加载
- 列表视图**同样是无限流**，每页 10 / 20 / 30 / 50 / 100 条，用的是同一条悬浮翻页条；副标题常显一行
- 列表里缩略图只有 46px，**鼠标悬停会在侧边浮出 176×264 的大图**，右侧放不下自动翻到左侧，触屏设备不显示
- 副标题取 `small_descr`：列表常显，海报墙 hover 时浮在海报底部（2 行截断）
- 移动端顶栏折叠成抽屉，窄屏已做溢出收敛（桌面 / 手机均无横向滚动）

---

## 七、可选：让封面显示真图（图片代理）

图床（豆瓣、部分 PT 站）按 Referer / 出口 IP 防盗链，浏览器直连常被 418/403。
前端已经做了多级回退（`SmartImage`）：

```
原图直连 → 站点 coverProxy → 公共代理 images.weserv.nl → 生成式封面
```

`imageMode` 四档：`auto`（默认，三级全试）/ `direct` / `proxy` / `off`，
也可在「连接设置」里按站切换。**什么都不配也能正常看**，只是部分封面会退化成生成式色块。

想要更高的真图率，装单文件图片代理：

1. 把交付包 `optional/image-proxy/img.php` 放到**任意一个 PHP 站点**根目录
   （1Panel 里新建一个 PHP 站点，或挂在原站目录下都行）
2. 确认能访问：

   ```bash
   curl -I "https://你的域名/img.php?u=https%3A%2F%2Fpic.hhanclub.net%2Fimg%2F2026%2F09%2F10%2F6aa25ddd4658f.jpg&f=0"
   ```

   返回 200 / `image/jpeg` 即可（示例地址来自接口返回的真实 `cover` 字段，换成你自己
   站点的一条种子封面来测最准）；抓不到会返回 404（这是故意的，前端要继续换下一个源）
3. 在 `config.js` 对应站点的 `coverProxy` 填：`https://你的域名/img.php?f=0`
   （也可在「连接设置 → 站点管理」里按站填，只存本机）

代理特性：无数据库、磁盘缓存 7 天、豆瓣自动带 `Referer: https://movie.douban.com/`、
单文件 8 MB 上限、禁止内网 / 回环地址（防 SSRF）；自建出口抓不到时级联公共代理，
默认带 `w=720` 缩放（不带宽度参数时实测经常超时）。
缓存写在 `img.php` 同目录的 `.imgcache/`，需要可写权限；不想缓存可删掉该目录或改 `$CACHE_TTL = 0`。

实测：用接口返回的真实 `cover` 地址请求，`200 image/jpeg`、89 KB、JPEG 魔数正常，
第二次起命中磁盘缓存。

> 公共图片代理有频率限制：短时间大量不同图片请求可能被临时限流，表现为代理返回 404。
> 这不会影响页面——前端会继续换下一个图片源，最后退化为生成式封面，不出现破图。
> `img.php` 的 7 天磁盘缓存正是为降低外发请求量；若部署主机本身能直连图床，
> 则完全不依赖公共代理。

> 注意：1Panel 的标准 PHP 站点自带 `location ~ \.php$`；若是自定义 nginx 站点
> （例如只配了固定入口的预览站），需要显式给 `img.php` 加一条 `fastcgi_pass` 规则，
> 否则会被当静态文件下载或直接 404。

> 多个站点可以用同一个 `img.php`，也可以每站配自己的。
> 图片是 `<img>` 标签加载，不要求 CORS 头；前后端不同域也能用。

---

## 八、两个可选后端（以后再加）

前端已经预留好按钮和配置位，**填了地址才出现**，不填就是纯静态；两者都是**站点级**配置。

### 下载器推送（Transmission / qBittorrent）

```
POST {pushEndpoint}/push
body  { torrentId, name, downloadUrl, target? }
resp  { ok, downloader, message }
```

后端逻辑：

1. 用 `downloadUrl`（详情接口给的 JWT 签名直链）取回 `.torrent` 字节
2. Transmission：JSON-RPC `torrent-add`，`metainfo = base64(字节)`，Basic Auth
3. qBittorrent：先 `POST /api/v2/auth/login` 拿 SID cookie，再
   `POST /api/v2/torrents/add`，multipart 字段 `torrents` 放文件
4. 返回下载器名称与结果

为什么必须服务端：下载器接口不给浏览器 CORS；Transmission 还要 base64 编码。
**目前只有前端契约，适配服务尚未实现**，需要下载器类型 / 地址 / 账号后再写。

### 账号密码登录

```
POST {loginEndpoint}/login
body  { username, password }
resp  { ok, token }
```

后端可复用原站 web 会话，登录后调 `/web/token/add` 创建令牌再回传。
（这个接口是原站前端在用的，不在开放 API 文档里，属于扩展能力。）

---

## 九、验证清单

```bash
# 首页
curl -I http://<前端地址>/
# SPA 深链
curl -I http://<前端地址>/t/620
curl -I http://<前端地址>/sites
# 配置
curl http://<前端地址>/config.js

# 接口本身（用你自己的令牌）
curl -H "Authorization: Bearer 5|xxxx" http://192.168.1.10/api/v1/profile
```

浏览器里再确认：

- 顶栏站点切换器能列出 `config.js` 里的所有站点，`/sites` 每站都有数据
- 登录后首页有海报、详情页能显示统计与评论、收藏按钮能切换
- 片库墙 / 列表切换正常；桌面与手机都无横向滚动
- 部分封面是真图、其余是生成式封面，**没有破图图标**

---

## 十、常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 登录提示「无法连接 API」 | `apiBase` 写错 / 协议不一致 | 浏览器直接打开 `apiBase/torrents` 试试 |
| 登录提示「令牌无效」 | 令牌过期、权限没勾，或选错了站点 | 回对应原站重新创建令牌，确认 `/login` 选的站点 |
| 切到另一站显示上一站数据 | 旧版本缓存 | 刷新；本版切换是整页跳转，正常不会串站 |
| 加站后不显示 | `config.js` 被缓存 / `id` 重复 | 确认第四节 `no-cache`；`id` 必须唯一 |
| 刷新 `/t/620` 变 404 | 少了 `try_files` | 加第四节第 1 条 |
| 改了 config.js 不生效 | 被缓存 | 确认 `config.js` 那条 `no-cache`，强制刷新一次 |
| 特别区报「加载失败」 | 上游 500 | 本版已避开（列表不传 `includes`），若仍出现看站点版本 |
| 封面全是渐变色块 | 图床跨站 418 且公共代理也抓不到 | 按第七节装 `img.php` 并填 `coverProxy` |
| 图片代理一直 404 | 目标图本身不可达 / 缓存目录不可写 | 直接 curl 原图确认；检查 `.imgcache` 权限 |
| 勋章 / 站点图标显示成通用占位 | 接口返回的是相对路径（如 `/pic/category/xunzhang/kz.png`），浏览器会去前端域名下找 | 本版已按站点 `apiBase` 的 origin 自动补全，无需配置；若仍空白说明原图本身 404 |
| 请求偶发失败 | 限流 60 次/分钟 | 稍等再点，页面不做轮询 |
