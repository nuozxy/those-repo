/**
 * 运行时配置 · 多站点目录 · 每站点独立令牌
 *
 * 设计要点：
 *  1. config.js 里只放「站点清单」（名称 + API 地址 + 可选扩展点），绝不放令牌。
 *  2. 令牌按站点 id 存在本机 localStorage，每个用户、每个站点各自登录。
 *  3. 用户在「连接设置」里增删改的站点也存本机，部署后不用改文件就能加站。
 *  4. settings() 永远返回「当前激活站点」的配置，所有 API 请求自动跟随切换。
 */
export interface Site {
  id: string;
  name: string;
  apiBase: string;
  color?: string;
  pushEndpoint?: string;
  loginEndpoint?: string;
  coverProxy?: string;
  /** 来自 config.js 的预置站点：不可真删，只能隐藏 / 覆盖字段 */
  builtin?: boolean;
}

export type ImageMode = 'auto' | 'direct' | 'proxy' | 'off';

export interface RuntimeConfig {
  apiBase: string;
  token: string;
  appName: string;
  pushEndpoint: string;
  loginEndpoint: string;
  coverProxy: string;
  siteId: string;
  siteName: string;
  siteColor: string;
  imageMode: ImageMode;
}

interface FileConfig {
  /** 前台品牌名（顶栏图标、登录页、页脚）；与「站点名」无关 */
  brand?: string;
  appName?: string;
  apiBase?: string;
  token?: string;
  pushEndpoint?: string;
  loginEndpoint?: string;
  coverProxy?: string;
  /** 新写法：多站点清单 */
  sites?: Site[];
  activeSite?: string;
  imageMode?: ImageMode;
}

declare global {
  interface Window { __TEY_API__?: FileConfig }
}

const file: FileConfig = typeof window !== 'undefined' ? window.__TEY_API__ ?? {} : {};
const norm = (s?: string) => (s || '').replace(/\/+$/, '');

/** config.js 里的预置站点；兼容旧版单站 apiBase 写法。
 *  显式写 sites: [] 就是「一个预置站点都没有」，首访走 /login 的接入表单，
 *  不会凭空出现某个站（以前默认塞一个 tey/太乙，导致别人的站也被叫成太乙）。 */
const BUILTIN: Site[] = (
  Array.isArray(file.sites)
    ? file.sites
    : [{ id: 'default', name: file.appName || 'PT', apiBase: norm(file.apiBase) || '/api/v1' }]
).map((s) => ({
  ...s,
  apiBase: norm(s.apiBase) || '/api/v1',
  color: s.color || '#38d8b4',
  builtin: true,
}));

/** 前台品牌：brand 优先，其次 appName 里 · 之前的部分。站点名永远不参与品牌。 */
export const brandName = (() => {
  const b = (file.brand || '').trim();
  if (b) return b;
  const a = (file.appName || '').split('·')[0].trim();
  return a || 'PT';
})();

export const fileConfig = {
  appName: file.appName || brandName,
  brand: brandName,
  sites: BUILTIN,
  activeSite: file.activeSite || BUILTIN[0]?.id || '',
  apiBase: norm(file.apiBase) || BUILTIN[0]?.apiBase || '/api/v1',
  token: file.token || '',
  pushEndpoint: norm(file.pushEndpoint),
  loginEndpoint: norm(file.loginEndpoint),
  coverProxy: norm(file.coverProxy),
  imageMode: (file.imageMode || 'auto') as ImageMode,
};

const KEY = {
  custom: 'tey.sites.custom',         // Site[] 用户新增的站点
  hidden: 'tey.sites.hidden',         // string[] 被隐藏的预置站点 id
  overrides: 'tey.sites.overrides',   // Record<id, Partial<Site>> 对预置站点的本机覆盖
  active: 'tey.sites.active',
  tokens: 'tey.tokens',               // Record<id, token>
  imageMode: 'tey.image.mode',
  theme: 'tey.api.theme',
  // 旧版单站键，首次读取时迁移
  legacyBase: 'tey.api.base',
  legacyToken: 'tey.api.token',
  legacyPush: 'tey.api.push',
  legacyLogin: 'tey.api.login',
  legacyCover: 'tey.api.cover',
};

function read(k: string): string {
  try { return localStorage.getItem(k) || ''; } catch { return ''; }
}
function write(k: string, v: string) {
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ }
}
function readJson<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
function writeJson(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

/* ---------------- 站点显示名 ---------------- */

/**
 * 站点显示名：名称留空就退回站点标识，避免顶栏空着。
 * 不再把某个名字当「品牌名」特殊处理 —— 站点名与前台品牌是两回事，
 * 用户完全可以把站点就叫 Those。
 */
export function siteLabel(id: string, name?: string): string {
  const n = (name || '').trim();
  return n || id;
}

/* ---------------- 站点目录 ---------------- */

export function listSites(): Site[] {
  const custom = readJson<Site[]>(KEY.custom, []);
  const hidden = readJson<string[]>(KEY.hidden, []);
  const ov = readJson<Record<string, Partial<Site>>>(KEY.overrides, {});
  const out: Site[] = [];
  BUILTIN.forEach((s) => {
    if (hidden.includes(s.id)) return;
    const cur = { ...s, ...(ov[s.id] || {}), builtin: true };
    out.push({ ...cur, name: siteLabel(cur.id, cur.name) });
  });
  custom.forEach((s) => {
    if (out.some((x) => x.id === s.id)) return;
    const cur = { ...s, color: s.color || '#5b9dff', builtin: false };
    out.push({ ...cur, name: siteLabel(cur.id, cur.name) });
  });
  return out;
}

export function activeSiteId(): string {
  const a = read(KEY.active) || fileConfig.activeSite;
  const sites = listSites();
  return sites.some((s) => s.id === a) ? a : (sites[0]?.id ?? '');
}

export function activeSite(): Site {
  const id = activeSiteId();
  return listSites().find((s) => s.id === id) ?? {
    id, name: siteLabel(id), apiBase: fileConfig.apiBase,
    color: '#2bd9c4', builtin: true,
  };
}

export function setActiveSite(id: string) { write(KEY.active, id); }

export function saveSite(site: Site) {
  const s: Site = { ...site, apiBase: norm(site.apiBase) || '/api/v1' };
  if (BUILTIN.some((b) => b.id === s.id)) {
    const ov = readJson<Record<string, Partial<Site>>>(KEY.overrides, {});
    ov[s.id] = {
      name: s.name, apiBase: s.apiBase, color: s.color,
      pushEndpoint: s.pushEndpoint, loginEndpoint: s.loginEndpoint, coverProxy: s.coverProxy,
    };
    writeJson(KEY.overrides, ov);
  } else {
    const arr = readJson<Site[]>(KEY.custom, []);
    const i = arr.findIndex((x) => x.id === s.id);
    if (i >= 0) arr[i] = s; else arr.push(s);
    writeJson(KEY.custom, arr);
  }
  notify();
}

export function removeSite(id: string) {
  if (BUILTIN.some((b) => b.id === id)) {
    const hidden = readJson<string[]>(KEY.hidden, []);
    if (!hidden.includes(id)) hidden.push(id);
    writeJson(KEY.hidden, hidden);
  } else {
    writeJson(KEY.custom, readJson<Site[]>(KEY.custom, []).filter((s) => s.id !== id));
  }
  const tokens = readJson<Record<string, string>>(KEY.tokens, {});
  delete tokens[id];
  writeJson(KEY.tokens, tokens);
  if (activeSiteId() === id) write(KEY.active, '');
  notify();
}

/** 站点清单变动事件：顶栏切换器据此刷新，不用整页重载 */
export const SITE_EVENT = 'tey:sites-changed';
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SITE_EVENT));
}

/* ---------------- 令牌（按站点隔离） ---------------- */

type TokenMap = Record<string, string>;

function tokens(): TokenMap {
  const map = readJson<TokenMap>(KEY.tokens, {});
  // 一次性迁移：旧版单站令牌 → 当前站点
  const legacy = read(KEY.legacyToken);
  if (legacy) {
    const id = activeSiteId();
    if (!map[id]) map[id] = legacy;
    writeJson(KEY.tokens, map);
    write(KEY.legacyToken, '');
  }
  return map;
}

export function getToken(siteId?: string): string {
  return tokens()[siteId || activeSiteId()] || '';
}
export function setToken(t: string, siteId?: string) {
  const map = tokens();
  map[siteId || activeSiteId()] = t.trim();
  writeJson(KEY.tokens, map);
  write(KEY.legacyToken, '');
}
export function logout(siteId?: string) {
  const map = tokens();
  delete map[siteId || activeSiteId()];
  writeJson(KEY.tokens, map);
  write(KEY.legacyToken, '');
}
export function loggedInSites(): string[] {
  const map = tokens();
  return Object.keys(map).filter((id) => !!map[id]);
}

/* ---------------- 当前生效配置 ---------------- */

export function getImageMode(): ImageMode {
  const m = read(KEY.imageMode);
  return (m === 'direct' || m === 'proxy' || m === 'off' || m === 'auto') ? m : fileConfig.imageMode;
}
export function setImageMode(m: ImageMode) { write(KEY.imageMode, m === fileConfig.imageMode ? '' : m); }

export function settings(siteId?: string): RuntimeConfig {
  const sites = listSites();
  const s = (siteId ? sites.find((x) => x.id === siteId) : undefined) ?? activeSite();
  // 旧版单站设置迁移到当前站点（只做一次）
  const legacy = read(KEY.legacyBase);
  if (legacy && !readJson<Record<string, Partial<Site>>>(KEY.overrides, {})[s.id]) {
    saveSite({
      ...s,
      apiBase: legacy,
      pushEndpoint: read(KEY.legacyPush) || s.pushEndpoint,
      loginEndpoint: read(KEY.legacyLogin) || s.loginEndpoint,
      coverProxy: read(KEY.legacyCover) || s.coverProxy,
    });
    [KEY.legacyBase, KEY.legacyPush, KEY.legacyLogin, KEY.legacyCover].forEach((k) => write(k, ''));
  }
  const cur = listSites().find((x) => x.id === s.id) ?? s;
  // 空串 = 「没配」：站点里留空的字段不能把 config.js 的全局设置顶掉
  // （之前是 v !== undefined，用户只要在设置页保存过一次站点，
  //   coverProxy 就会被一个空串覆盖，全局代理直接失效）
  const pick = (v: string | undefined, fallback: string) =>
    v !== undefined && v.trim() !== '' ? norm(v) : fallback;
  return {
    apiBase: norm(cur.apiBase) || '/api/v1',
    token: getToken(cur.id),
    appName: fileConfig.appName,
    pushEndpoint: pick(cur.pushEndpoint, fileConfig.pushEndpoint),
    loginEndpoint: pick(cur.loginEndpoint, fileConfig.loginEndpoint),
    coverProxy: pick(cur.coverProxy, fileConfig.coverProxy),
    siteId: cur.id,
    siteName: cur.name,
    siteColor: cur.color || '#38d8b4',
    imageMode: getImageMode(),
  };
}

/** 兼容旧调用：把连接参数写回「当前站点」 */
export function saveSettings(v: { apiBase: string; pushEndpoint: string; loginEndpoint: string; coverProxy: string }) {
  saveSite({
    ...activeSite(),
    apiBase: v.apiBase.trim(),
    pushEndpoint: v.pushEndpoint.trim(),
    loginEndpoint: v.loginEndpoint.trim(),
    coverProxy: v.coverProxy.trim(),
  });
}
/** 恢复当前站点的预置参数（不动令牌） */
export function clearSettings() {
  const id = activeSiteId();
  const ov = readJson<Record<string, Partial<Site>>>(KEY.overrides, {});
  delete ov[id];
  writeJson(KEY.overrides, ov);
  notify();
}

/* ---------------- 图片：三级回退 ---------------- */

function weserv(u: string, w?: number, h?: number): string {
  const q = [`url=${encodeURIComponent(u)}`];
  if (w) q.push(`w=${w}`);
  if (h) q.push(`h=${h}`, 'fit=cover');
  q.push('output=jpg', 'q=82');
  return 'https://images.weserv.nl/?' + q.join('&');
}

/**
 * 返回按顺序尝试的图片地址列表：
 *   auto   原图直连(no-referrer) → 图片代理
 *   direct 只直连
 *   proxy  只走代理
 *   off    不加载外链（纯生成式封面）
 * 代理优先用站点自定义的 coverProxy（格式 {base}?u={url}），否则用公共图片代理。
 */
/**
 * 站点返回的资源路径常是相对的，比如勋章的 `/pic/category/xunzhang/kz.png`。
 * 浏览器会拿它去前端域名下找 → 404 → 只剩占位图标（勋章"图标不对"就是这个原因）。
 * 这里统一按该站 apiBase 的 origin 补全。
 */
export function absoluteUrl(u: string, apiBase?: string): string {
  const s = (u || '').trim();
  if (!s) return '';
  if (/^(?:https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
  const base = apiBase || settings().apiBase;
  let origin = '';
  try {
    const href = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    origin = new URL(base, href).origin;
  } catch { /* ignore */ }
  if (!origin || origin === 'null') return s;
  return origin + (s.startsWith('/') ? s : `/${s}`);
}

/**
 * 按 Referer 防盗链的图床：浏览器直连一定 418/403，
 * 配了自建代理时不必先白跑一次直连（省一次请求，也少一次控制台报错）。
 */
const REFERER_LOCKED = /(^|\.)(doubanio\.com|douban\.com|hhanclub\.net|ptpimg\.me|netok\.xyz)$/i;

function hostOf(u: string): string {
  try {
    return new URL(u, typeof location !== 'undefined' ? location.href : 'http://localhost/').hostname;
  } catch {
    return '';
  }
}

export function imageCandidates(u: string, w?: number, h?: number): string[] {
  if (!u) return [];
  const mode = getImageMode();
  if (mode === 'off') return [];
  const cfg = settings();
  const full = absoluteUrl(u, cfg.apiBase);
  const p = cfg.coverProxy;
  const own = p
    ? (p.includes('weserv.nl') ? weserv(full, w, h) : `${p}${p.includes('?') ? '&' : '?'}u=${encodeURIComponent(full)}`)
    : '';
  const pub = weserv(full, w, h);
  if (mode === 'direct') return [full];
  if (mode === 'proxy') return [own || pub];
  // auto：防盗链图床直接走自建代理（直连必然失败）；其余先直连，代理兜底
  const locked = !!own && REFERER_LOCKED.test(hostOf(full));
  const list = locked ? [own, pub] : [full];
  if (own && !locked) list.push(own);
  list.push(pub);
  return Array.from(new Set(list));
}

/** 兼容旧调用 */
export function imageSrc(u: string, w?: number, h?: number): string | null {
  return imageCandidates(u, w, h)[0] || null;
}

/* ---------------- 主题 ---------------- */

export function getTheme(): 'dark' | 'light' {
  return read(KEY.theme) === 'light' ? 'light' : 'dark';
}
export function setTheme(t: 'dark' | 'light') {
  write(KEY.theme, t === 'light' ? 'light' : '');
  document.documentElement.dataset.theme = t;
}
