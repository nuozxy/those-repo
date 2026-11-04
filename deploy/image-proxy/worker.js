/**
 * 封面代理 · Cloudflare Worker 版
 * ============================================================
 * 解决三件事：
 *   1. 豆瓣图床按 Referer 防盗链，浏览器直连一律 418 —— 这里在边缘补上 Referer；
 *   2. 种子封面图床被墙 / 图已删 —— 用 ?q=片名 去豆瓣搜一张补上；
 *   3. 同一张图被上万次访问 —— Worker 侧走 caches.default，只回源一次。
 *
 * 用法
 *   GET /img?u=<完整图片地址，需 urlencode>   直连代理
 *   GET /img?q=<片名>                        豆瓣搜海报再代理
 *   加 &f=0 时失败返回 404（前端会自动回落到生成式封面）
 *
 * 部署
 *   1. Cloudflare 控制台 → Workers & Pages → 创建 Worker → 粘贴本文件 → 部署
 *   2. 该 Worker → 设置 → 触发器 → 自定义域，绑一个子域，例如 img.those.cc
 *   3. 前端 config.js（或站点设置里的 coverProxy）填：
 *        https://img.those.cc/img?f=0
 *      前端会自动拼 &u=<封面地址> 或 &q=<片名>，不用再改代码
 *
 * 说明：不存任何密钥，也不做缩放（缩放交给浏览器 / 图床自身的尺寸变体）。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** 只允许代理这些图床，防止被人拿去当任意网站的开放代理 */
const ALLOW = [
  'doubanio.com',
  'douban.com',
  'hhanclub.net',
  'ptpimg.me',
  'netok.xyz',
  'helloimg.com',
  'twimg.com',
  'themoviedb.org',
  'tmdb.org',
  'tvmaze.com',
  'gying.org',
  'imgur.com',
  'sinaimg.cn',
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
};

function refFor(host) {
  if (/(^|\.)doubanio\.com$|(^|\.)douban\.com$/.test(host)) return 'https://movie.douban.com/';
  if (/(^|\.)hhanclub\.net$/.test(host)) return 'https://hhanclub.net/';
  if (/(^|\.)themoviedb\.org$|(^|\.)tmdb\.org$/.test(host)) return ''; // TMDB 不要 Referer
  return `https://${host}/`;
}

const allowed = (host) => ALLOW.some((d) => host === d || host.endsWith('.' + d));

function notFound(why) {
  return new Response(why || 'not found', {
    status: 404,
    headers: { ...CORS, 'cache-control': 'public, max-age=1800' },
  });
}

/** 豆瓣搜索建议：不需要 API key，返回的第一条带 img 的就是海报 */
async function doubanSearch(q) {
  const url = 'https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': UA,
        referer: 'https://movie.douban.com/',
        accept: 'application/json, text/plain, */*',
      },
    });
    if (!r.ok) return '';
    const arr = await r.json();
    if (!Array.isArray(arr)) return '';
    for (const it of arr) {
      if (it && typeof it.img === 'string' && it.img) {
        // 小图换中图，卡片尺寸够清楚又不至于太大
        return it.img.replace('/s_ratio_poster/', '/m_ratio_poster/');
      }
    }
  } catch {
    /* 网络抖动就当没找到 */
  }
  return '';
}

/**
 * 「搞笑一家人3：短腿的反击」这种带副标题的整串豆瓣搜不到，
 * 按 整串 → 冒号前 → 空格前 依次降级重试。
 */
async function doubanPoster(q) {
  const cands = [q];
  const colon = q.split(/[：:]/)[0].trim();
  if (colon && colon !== q) cands.push(colon);
  const space = q.split(/\s+/)[0].trim();
  if (space && !cands.includes(space)) cands.push(space);
  for (const c of cands) {
    if (c.length < 2) continue;
    const hit = await doubanSearch(c);
    if (hit) return hit;
  }
  return '';
}

/**
 * 豆瓣：大图 → 中图。
 * 卡片只渲染到 320px 宽，而站内 cover 大量是 l_ratio_poster（1000+ 宽、单张 1MB 上下），
 * 手机流量下慢到卡片先闪生成式封面。换成 m_ratio_poster（540 宽，几十 KB）视觉无差别。
 * 老格式 /view/photo/l/ 同理换 /view/photo/m/。
 */
const DOUBAN_HOST = /(^|\.)doubanio\.com$|(^|\.)douban\.com$/;

function doubanMedium(href, host) {
  if (!DOUBAN_HOST.test(host)) return '';
  const m = href
    .replace('/l_ratio_poster/', '/m_ratio_poster/')
    .replace('/view/photo/l/', '/view/photo/m/')
    .replace('/s_ratio_poster/', '/m_ratio_poster/');
  return m === href ? '' : m;
}

/** 边缘抓取带硬超时：一张坏图不能把卡片卡几十秒 */
async function timedFetch(url, headers, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function proxyImage(target, ctx) {
  let u;
  try {
    u = new URL(target);
  } catch {
    return notFound('bad url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return notFound('bad scheme');
  if (!allowed(u.hostname.toLowerCase())) return notFound('host not allowed');

  const cache = caches.default;
  // v2 前缀：换中图后旧的大图缓存不再命中，重新按新逻辑回源一次
  const key = new Request('https://img-cache.invalid/v2/' + encodeURIComponent(u.href));

  const hit = await cache.match(key);
  if (hit) return hit;

  const headers = { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
  const ref = refFor(u.hostname.toLowerCase());
  if (ref) headers.referer = ref;

  // 豆瓣先试中图（快 10 倍），拿不到再回原图
  const medium = doubanMedium(u.href, u.hostname.toLowerCase());
  let upstream = medium ? await timedFetch(medium, headers, 8000) : null;
  const usable = (r) => r && r.ok && (r.headers.get('content-type') || '').startsWith('image/');
  if (!usable(upstream)) upstream = await timedFetch(u.href, headers, 12000);
  if (!upstream) return notFound('upstream timeout');

  const type = upstream.headers.get('content-type') || '';
  const ok = upstream.ok && type.startsWith('image/');

  const out = new Response(ok ? upstream.body : 'upstream ' + upstream.status, {
    status: ok ? 200 : 404,
    headers: {
      ...CORS,
      'content-type': ok ? type : 'text/plain; charset=utf-8',
      // 命中后由 CF 边缘直接吐，浏览器也缓存一天
      'cache-control': ok ? 'public, max-age=604800' : 'public, max-age=1800',
    },
  });

  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound('method');

    if (url.pathname !== '/img' && url.pathname !== '/') {
      return new Response('poster proxy\n/img?u=<url>  |  /img?q=<name>', {
        headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const u = (url.searchParams.get('u') || '').trim();
    const q = (url.searchParams.get('q') || '').trim();

    if (u) return proxyImage(u, ctx);

    if (q) {
      // 查询结果也缓存一天，避免同名片被反复搜
      const qk = new Request('https://img-cache.invalid/q/' + encodeURIComponent(q));
      const qhit = await caches.default.match(qk);
      let target = qhit ? (await qhit.text()).trim() : '';
      if (!qhit) {
        target = await doubanPoster(q);
        ctx.waitUntil(caches.default.put(qk, new Response(target || '-', {
          headers: { 'cache-control': 'public, max-age=86400' },
        })));
      }
      if (!target || target === '-') return notFound('no match');
      return proxyImage(target, ctx);
    }

    return notFound('missing u or q');
  },
};
