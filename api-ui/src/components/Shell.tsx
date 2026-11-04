import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type UserBrief } from '@/lib/api';
import {
  SITE_EVENT, activeSite, brandName, getTheme, getToken, listSites,
  logout, setActiveSite, setTheme,
} from '@/lib/config';
import { sectionLabel, useSections } from '@/lib/useSections';
import { tokenPage } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { Icon } from './Icon';
import { SmartImage } from './SmartImage';

type NavItem = { to: string; label: string; end?: boolean };

/**
 * 固定导航：首页 / 收藏 / 发布 / 站点 / 我的；中间的分区项由 /sections 动态插入。
 * 不再放「全部」——站点只有一个综合分区时，它和「综合」内容完全一样，纯属重复。
 * /torrents 路由本身保留（首页「进入片库」、搜索结果仍可用）。
 */
const NAV_HEAD: NavItem[] = [
  { to: '/', label: '首页', end: true },
];
const NAV_TAIL: NavItem[] = [
  { to: '/bookmarks', label: '收藏' },
  { to: '/upload', label: '发布' },
  { to: '/sites', label: '站点' },
  { to: '/me', label: '我的' },
];

const TITLES: [RegExp, string][] = [
  [/^\/bookmarks/, '我的收藏'], [/^\/upload/, '发布种子'],
  [/^\/me$/, '我的资料'], [/^\/u\//, '用户资料'], [/^\/settings/, '连接设置'],
  [/^\/sites/, '站点总览'], [/^\/t\//, '种子详情'], [/^\/torrents/, '全部种子'],
  [/^\/s\//, '分区'], [/^\//, '首页'],
];

/** 状态条数字缩写：1,998,024,231.7 → 19.98 亿，避免把整条挤爆 */
function shorten(v?: string | number | null): ReactNode {
  if (v === undefined || v === null || v === '') return '—';
  const s = String(v);
  const n = Number(s.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return s;
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  if (Math.abs(n) >= 1e8) return `${trim(n / 1e8)} 亿`;
  if (Math.abs(n) >= 1e4) return `${trim(n / 1e4)} 万`;
  return s;
}

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [swOpen, setSwOpen] = useState(false);
  const [sites, setSites] = useState(listSites());
  const [site, setSite] = useState(activeSite());
  const [theme, setThemeState] = useState<'dark' | 'light'>(getTheme());
  const [q, setQ] = useState(new URLSearchParams(loc.search).get('q') || '');
  const swRef = useRef<HTMLDivElement>(null);
  const token = getToken();

  useEffect(() => { document.documentElement.dataset.theme = getTheme(); }, []);
  useEffect(() => { setMenu(false); setSwOpen(false); }, [loc.pathname]);

  useEffect(() => {
    const sync = () => { setSites(listSites()); setSite(activeSite()); };
    window.addEventListener(SITE_EVENT, sync);
    return () => window.removeEventListener(SITE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!swOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (swRef.current && !swRef.current.contains(e.target as Node)) setSwOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [swOpen]);

  useEffect(() => { setQ(new URLSearchParams(loc.search).get('q') || ''); }, [loc.search]);

  const me = useAsync<UserBrief | null>(
    () => (token ? api.profile() : Promise.resolve(null)),
    [token, site.id],
  );

  // 分区导航按当前站点的 /sections 动态生成，站点不同名字就不同
  const { sections } = useSections();
  const NAV = useMemo<NavItem[]>(() => [
    ...NAV_HEAD,
    ...sections.map((s) => ({ to: `/s/${encodeURIComponent(s.name)}`, label: sectionLabel(s) })),
    ...NAV_TAIL,
  ], [sections]);

  const secName = decodeURIComponent(loc.pathname.match(/^\/s\/([^/]+)/)?.[1] || '');
  const sec = secName ? sections.find((s) => s.name === secName) : undefined;
  const title = useMemo(
    () => (sec ? sectionLabel(sec) : '') || TITLES.find(([r]) => r.test(loc.pathname))?.[1] || '首页',
    [loc.pathname, sec],
  );
  const p = me.data;

  useEffect(() => {
    document.title = `${title} · ${site.name}`;
  }, [title, site.name]);

  function toggleTheme() {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); setThemeState(t);
  }
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const k = q.trim();
    nav(k ? `/torrents?q=${encodeURIComponent(k)}` : '/torrents');
  }
  function switchSite(id: string) {
    setSwOpen(false);
    if (id === site.id) return;
    setActiveSite(id);
    // 整页跳转：上一站的数据、分页、滚动位置全部丢弃，绝不允许串站
    window.location.assign(getToken(id) ? '/' : '/login');
  }
  function signOut() {
    logout();
    nav('/login', { replace: true });
  }

  const hud: { k: string; v: ReactNode; cls?: string; hideSm?: boolean; hideXs?: boolean }[] = [
    { k: '分享率', v: shorten(p?.share_ratio) },
    { k: '上传', v: shorten(p?.uploaded_text), cls: 'up' },
    { k: '下载', v: shorten(p?.downloaded_text), cls: 'dn', hideXs: true },
    { k: '积分', v: shorten(p?.seed_points_human), hideSm: true },
    { k: '魔力值', v: shorten(p?.bonus_human), cls: 'acc' },
    { k: '时产', v: shorten(p?.seed_bonus_per_hour_human), hideSm: true },
    { k: '邀请', v: shorten(p?.invites), hideSm: true },
  ];

  return (
    <div className="app">
      <header className="top">
        {/* 顶栏主标识 = 当前站点名；产品品牌只保留左侧圆形图标 */}
        <Link to="/" className="logo" title={`当前站点：${site.name}`}>
          <span className="logo-mark" style={{ borderColor: site.color }} />
          <span className="logo-word site-logo-name">{site.name}</span>
        </Link>

        <nav className="nav2">
          {NAV.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => `nav2-a ${isActive ? 'on' : ''}`}>
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="sw" ref={swRef}>
          <button className={`sw-btn ${swOpen ? 'open' : ''}`} onClick={() => setSwOpen((v) => !v)}>
            <span className="sw-dot" style={{ background: site.color }} />
            <span className="sw-name">切换站点</span>
            <Icon name="chevD" size={12} />
          </button>
          {swOpen && (
            <div className="sw-pop">
              <div className="sw-h">
                <span>切换站点</span>
                <Link to="/settings" onClick={() => setSwOpen(false)}>管理</Link>
              </div>
              {sites.map((s) => (
                <button key={s.id} className={`sw-i ${s.id === site.id ? 'on' : ''}`} onClick={() => switchSite(s.id)}>
                  <span className="sw-dot" style={{ background: s.color }} />
                  <span className="sw-n">{s.name}</span>
                  <span className={`sw-t ${getToken(s.id) ? 'ok' : ''}`}>{getToken(s.id) ? '已登录' : '未登录'}</span>
                </button>
              ))}
              <Link className="sw-add" to="/sites" onClick={() => setSwOpen(false)}>
                <Icon name="link" size={14} /> 站点总览 / 添加站点
              </Link>
            </div>
          )}
        </div>

        <form className="search" onSubmit={submitSearch}>
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索片名 / 制作组 / 编码" />
          <kbd>/</kbd>
        </form>

        <div className="top-right">
          <button className="iconbtn theme-btn" onClick={toggleTheme} title="切换深色 / 浅色">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          <Link className="iconbtn up-btn" to="/upload" title="发布种子"><Icon name="upload" size={15} /></Link>
          <Link to="/me" className="me">
            <span className="me-ava">
              <SmartImage src={p?.avatar} w={64} h={64} fallback={<Icon name="user" size={15} />} />
            </span>
            <span className="me-n">
              <b>{p?.username || (token ? '已连接' : '未登录')}</b>
              <i>{p?.class_text || (token ? site.name : '去登录')}</i>
            </span>
          </Link>
          <button className="iconbtn burger" onClick={() => setMenu(true)} title="菜单" aria-label="菜单">
            <Icon name="menu" size={17} />
          </button>
        </div>
      </header>

      {/* 状态条：对齐参考站的「影院仪表」 */}
      <div className="hud">
        <div className="hud-k hud-site">
          <span className="sw-dot" style={{ background: site.color }} />
          <b>{site.name}</b>
          <i className={token ? 'on' : ''}>{token ? '已连接' : '未登录'}</i>
        </div>
        {token
          ? hud.map((h) => (
            <div className={`hud-k ${h.cls || ''} ${h.hideSm ? 'hide-sm' : ''} ${h.hideXs ? 'hide-xs' : ''}`} key={h.k}>
              <i>{h.k}</i><b>{h.v}</b>
            </div>
          ))
          : <div className="hud-k hud-empty">还没有连接这个站点<Link to="/login">去登录 →</Link></div>}
        <div className="hud-sp" />
        <Link className="hud-link" to="/sites">站点总览</Link>
        <Link className="hud-link" to="/settings">连接设置</Link>
      </div>

      <main className="content">{children}</main>

      <footer className="foot">
        <div>{brandName} · 只使用 NexusPHP 官方开放 API · 纯静态</div>
        <div className="foot-l">
          <Link to="/sites">站点</Link>
          <Link to="/settings">连接设置</Link>
          {tokenPage() && <a href={tokenPage()} target="_blank" rel="noreferrer">原站控制面板</a>}
        </div>
      </footer>

      {/* 移动端抽屉 */}
      <div className={`mm ${menu ? 'open' : ''}`}>
        <div className="mm-h">
          <span><i className="sw-dot" style={{ background: site.color, display: 'inline-block', marginRight: 8 }} />{site.name}</span>
          <button className="iconbtn" onClick={() => setMenu(false)} aria-label="关闭"><Icon name="x" size={17} /></button>
        </div>
        <div className="mm-grid">
          {NAV.concat([{ to: '/settings', label: '设置' }]).map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => `mm-i ${isActive ? 'on' : ''}`} onClick={() => setMenu(false)}>
              {it.label}
            </NavLink>
          ))}
        </div>
        <div className="mm-foot">
          <div className="mm-site">
            {sites.map((s) => (
              <button key={s.id} className={`mm-s ${s.id === site.id ? 'on' : ''}`} onClick={() => switchSite(s.id)}>
                <span className="sw-dot" style={{ background: s.color }} />{s.name}
              </button>
            ))}
          </div>
          {token && <button className="btn ghost wide" onClick={signOut}><Icon name="external" size={15} /> 退出登录</button>}
        </div>
      </div>
      {menu && <div className="mm-mask" onClick={() => setMenu(false)} />}
    </div>
  );
}
