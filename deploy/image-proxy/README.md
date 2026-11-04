# 封面代理 · 三种落地方式

站内封面大多指向豆瓣图床，而豆瓣按 `Referer` 防盗链：浏览器直接请求一律 **418**，
页面就只剩生成式封面。抽样 40 个种子实测只有 6 张能直连成功。

代理要做的事很小：**替浏览器带着 `Referer: https://movie.douban.com/` 去取图**，
取回来缓存住；顺便支持 `?q=片名` 去豆瓣搜一张海报，补封面缺失/图已删的种子。

前端已经改好：只要在配置里填了 `coverProxy`，就会自动

1. 把防盗链图床的图片直接走代理（不再先白等一次 418）；
2. 所有源都失败时，拿片名请求 `{coverProxy}&q=片名` 补图；
3. 代理返回 404 就回落到生成式封面，不会出现破图。

三选一即可，配置写法完全相同。

---

## 方式一：Cloudflare Worker（推荐）

免费、走 CF 边缘缓存、不用动服务器，上线后同一张图只回源一次。

1. Cloudflare 控制台 → **Workers & Pages** → 创建 → Worker，名字随意；
2. 编辑代码，把 `worker.js` 全文粘进去 → 部署；
3. 该 Worker → **设置 → 触发器 → 自定义域**，绑一个子域，例如 `img.those.cc`；
4. 填到前端配置（见文末）。

验证：

```bash
curl -I "https://img.those.cc/img?u=https%3A%2F%2Fimg9.doubanio.com%2Fview%2Fphoto%2Fl_ratio_poster%2Fpublic%2Fp2927978012.jpg"
# 期望 200 + content-type: image/*
curl -s -o /tmp/x.jpg -w "%{http_code} %{size_download}\n" "https://img.those.cc/img?q=%E9%9F%A9%E5%9B%BD%E5%88%B6%E9%80%A0"
# 期望 200 且有几十 KB
```

---

## 方式二：PHP（`img.php`）

任意有 PHP 的站点，把 `img.php` 丢到根目录即可，无需数据库、无需常驻进程。
1Panel 里的 NexusPHP 站点、单独建的 PHP 站点都行。

- 缓存目录 `./.imgcache`（自动创建，需可写）；
- 图片缓存 7 天，片名查询结果缓存 30 天，失败结果缓存 30 分钟；
- 上限 8MB/张，禁止内网地址。

验证：

```bash
curl -I "https://你的域名/img.php?f=0&u=https%3A%2F%2Fimg9.doubanio.com%2Fview%2Fphoto%2Fl_ratio_poster%2Fpublic%2Fp2927978012.jpg"
curl -s -o /tmp/y.jpg -w "%{http_code} %{size_download}\n" "https://你的域名/img.php?f=0&q=%E9%9F%A9%E5%9B%BD%E5%88%B6%E9%80%A0"
```

---

## 方式三：nginx 纯反代（没有 PHP 时的降级）

只能解决防盗链（`?u=`），**不能**做 `?q=` 片名补图 —— 因为搜豆瓣要解析 JSON，
nginx 做不到。补图那一步会自动跳过（前端拿不到图就用生成式封面）。

`nginx-img.conf.example` 是片段，粘到站点 `server {}` 里：

- `proxy_cache_path` 必须放在 `http {}` 级，1Panel 可写进 `/usr/local/openresty/nginx/conf/nginx.conf`；
- 白名单只放行常见图床，避免被当成开放代理；
- 记得 `resolver` 指向你机器上可用的 DNS。

---

## 填到前端

两种入口，任选：

**A. 站点设置里改**（只影响当前浏览器）
站点 → 连接设置 → 外链图片代理，填 `https://img.those.cc/img?f=0`

**B. `config.js` 里改**（对所有人生效）

```js
window.__TEY_API__ = {
  brand: 'Those',
  sites: [
    {
      id: 'those',
      name: 'Those',
      apiBase: 'https://php.those.cc/api/v1',
      color: '#2bd9c4',
      coverProxy: 'https://img.those.cc/img?f=0',
    },
  ],
  imageMode: 'auto',
};
```

格式说明：`{base}?f=0`，前端会自动补 `&u=<封面地址>` 或 `&q=<片名>`。
`f=0` 表示取不到就返回 404（前端自动换下一个源），不要去掉。

---

## 效果与成本

- 页面上「有真实海报」的卡片从 ~30% 提升到 ~95%（其余仍走生成式封面）；
- 首次访问一张图回源一次，之后走 CF 边缘 / PHP 本地缓存 / nginx 缓存；
- 补图只对「没有封面」或「图已失效」的卡片触发，一页最多十几条查询，且结果都带缓存；
- 任何一步失败都退回生成式封面，不会出现破图或空白格。
