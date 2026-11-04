import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  activeSiteId, brandName, getToken, listSites, logout, saveSite, setActiveSite, setToken, settings,
} from '@/lib/config';
import { passwordLogin, passwordLoginEnabled, tokenPage } from '@/lib/auth';
import { Icon } from '@/components/Icon';

const ID_RE = /^[a-z0-9_-]{2,24}$/;

/** 由 API 地址推出该站控制面板，用户可以直接去创建个人访问令牌 */
function panelUrl(apiBase: string): string {
  const v = (apiBase || '').trim();
  if (!v || v === 'http://' || v === 'https://') return '';
  try {
    const u = new URL(v, window.location.href);
    if (!/^https?:$/.test(u.protocol)) return '';
    return `${u.origin}/usercp.php`;
  } catch { return ''; }
}

export default function Login() {
  const nav = useNavigate();
  const [sites, setSites] = useState(() => listSites());
  const [siteId, setSiteId] = useState(() => activeSiteId());
  /* 一个站点都没有时直接进入「接入站点」表单：
     以前这里默认塞了 tey/太乙，第一次登录就被叫成太乙，站点身份根本填不了。 */
  const [adding, setAdding] = useState(() => listSites().length === 0);
  const cfg = settings(siteId || undefined);

  const [mode, setMode] = useState<'token' | 'password'>(passwordLoginEnabled() ? 'password' : 'token');
  const [token, setTok] = useState('');
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  /* 首次接入时不预填任何地址，避免把默认的 /api/v1 当成真实站点地址 */
  const [base, setBase] = useState(() => (sites.length ? cfg.apiBase : ''));
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const current = sites.find((s) => s.id === siteId);
  const already = !!getToken(siteId);
  const panel = panelUrl(adding ? base : cfg.apiBase) || tokenPage();

  function pickSite(id: string) {
    setSiteId(id);
    setActiveSite(id);
    setBase(settings(id).apiBase);
    setAdding(false);
    setErr('');
  }

  function startAdd() {
    setAdding(true);
    setErr('');
    setBase('');
    setNewId('');
    setNewName('');
    setTok('');
  }

  /** 校验令牌并进入；siteId 显式传入，避免写错站点 */
  async function enterWith(tok: string, id: string) {
    setToken(tok, id);
    setActiveSite(id);
    try {
      const me = await api.profile(undefined, id);
      if (!me || !me.id) throw new Error('令牌有效但没有返回用户信息');
      nav('/', { replace: true });
    } catch (e) {
      logout(id);
      throw e;
    }
  }

  /** 接入新站点：标识 + 名称 + API 地址 + 令牌，一次填完，站点只存本机 */
  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const id = newId.trim().toLowerCase();
    const name = newName.trim() || id;
    const apiBase = base.trim().replace(/\/+$/, '');
    try {
      if (!ID_RE.test(id)) throw new Error('标识只能是 2-24 位小写字母 / 数字 / - _');
      if (!name) throw new Error('请填写站点名称');
      if (!/^https?:\/\//.test(apiBase) && !apiBase.startsWith('/')) throw new Error('API 地址要以 http(s):// 开头');
      const t = token.trim();
      if (!t) throw new Error('请填写该站点的访问令牌');
      if (sites.some((s) => s.id === id)) throw new Error(`标识「${id}」已存在，请换一个或直接选左边的站点`);
      saveSite({ id, name, apiBase, color: '#2bd9c4' });
      setSites(listSites());
      setSiteId(id);
      await enterWith(t, id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : '接入失败');
    } finally { setBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return submitNew(e);
    setErr(''); setBusy(true);
    try {
      if (mode === 'token') {
        const t = token.trim();
        if (!t) throw new Error('请填写访问令牌');
        saveSite({ ...(current ?? { id: siteId, name: siteId, apiBase: base }), apiBase: base });
        await enterWith(t, siteId);
      } else {
        if (!user.trim() || !pwd) throw new Error('请填写账号和密码');
        setActiveSite(siteId);
        const r = await passwordLogin(user.trim(), pwd);
        await enterWith(r.token!, siteId);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-glow" />
      <div className={`login-card ${adding ? 'wide' : ''}`}>
        <div className="login-brand">
          <span className="brand-mark big"><Icon name="stack" size={24} /></span>
          <div><b>{brandName}</b><small>OPEN API FRONTEND</small></div>
        </div>

        {adding ? (
          <>
            <h1>接入站点</h1>
            <p className="login-sub">
              填这个站自己的标识、名称和 API 地址，再用你自己的访问令牌登录。
              一个浏览器可以接多个站，互不串数据。
            </p>
            <form onSubmit={submitNew} className="login-form">
              <div className="login-grid">
                <label className="field">
                  <span>站点标识 <em>id · 建后不改</em></span>
                  <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="those" spellCheck={false} autoCapitalize="none" />
                </label>
                <label className="field">
                  <span>站点名称</span>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Those" />
                </label>
              </div>
              <label className="field">
                <span>API 地址 <em>apiBase</em></span>
                <div className="inp-wrap"><Icon name="link" size={15} />
                  <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://站点域名/api/v1" spellCheck={false} /></div>
              </label>
              <label className="field">
                <span>访问令牌 <em>{newName || 'ACCESS TOKEN'}</em></span>
                <div className="inp-wrap">
                  <Icon name="key" size={16} />
                  <input type={show ? 'text' : 'password'} value={token} onChange={(e) => setTok(e.target.value)}
                    placeholder="7|xxxxxxxxxxxxxxxxxxxxxxxx" autoComplete="off" spellCheck={false} />
                  <button type="button" className="inp-act" onClick={() => setShow(!show)}>{show ? '隐藏' : '显示'}</button>
                </div>
              </label>

              {err && <div className="login-err"><Icon name="alert" size={15} />{err}</div>}

              <button className="btn primary wide" disabled={busy} type="submit">
                {busy ? '验证中…' : <><Icon name="check" size={16} /> 保存并登录</>}
              </button>

              <div className="login-links">
                {panel
                  ? <a href={panel} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> 去该站控制面板创建令牌</a>
                  : <span className="site-add">令牌在站点「控制面板 → 访问令牌」创建</span>}
                {sites.length > 0 && (
                  <button type="button" onClick={() => { setAdding(false); setErr(''); setBase(settings(siteId).apiBase); }}>
                    <Icon name="chevL" size={14} /> 选择已有站点
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          <>
            <h1>登录 <em className="login-site">{current?.name || '站点'}</em></h1>
            <p className="login-sub">
              每个站点的令牌都不一样。先选站点，再粘贴你在该站创建的访问令牌。
            </p>

            <div className="site-pick">
              {sites.map((s) => (
                <button key={s.id} type="button" className={`site-chip ${s.id === siteId ? 'on' : ''}`} onClick={() => pickSite(s.id)}>
                  <span className="sw-dot" style={{ background: s.color }} />
                  {s.name}
                  {getToken(s.id) && <i className="ok">已登录</i>}
                </button>
              ))}
              <button type="button" className="site-add" onClick={startAdd}><Icon name="plus" size={13} /> 接入站点</button>
            </div>

            {passwordLoginEnabled() && (
              <div className="tabs">
                <button className={mode === 'password' ? 'on' : ''} onClick={() => { setMode('password'); setErr(''); }}>账号密码</button>
                <button className={mode === 'token' ? 'on' : ''} onClick={() => { setMode('token'); setErr(''); }}>访问令牌</button>
              </div>
            )}

            <form onSubmit={submit} className="login-form">
              {mode === 'token' ? (
                <label className="field">
                  <span>访问令牌 <em>{current?.name || 'ACCESS TOKEN'}</em></span>
                  <div className="inp-wrap">
                    <Icon name="key" size={16} />
                    <input type={show ? 'text' : 'password'} value={token} onChange={(e) => setTok(e.target.value)}
                      placeholder="5|xxxxxxxxxxxxxxxxxxxxxxxx" autoComplete="off" spellCheck={false} />
                    <button type="button" className="inp-act" onClick={() => setShow(!show)}>{show ? '隐藏' : '显示'}</button>
                  </div>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>用户名</span>
                    <div className="inp-wrap"><Icon name="user" size={16} />
                      <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="站点用户名" autoComplete="username" /></div>
                  </label>
                  <label className="field">
                    <span>密码</span>
                    <div className="inp-wrap"><Icon name="key" size={16} />
                      <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="站点密码" autoComplete="current-password" /></div>
                  </label>
                </>
              )}

              {err && <div className="login-err"><Icon name="alert" size={15} />{err}</div>}

              <button className="btn primary wide" disabled={busy} type="submit">
                {busy ? '验证中…' : <><Icon name="check" size={16} /> 登录 {current?.name}</>}
              </button>
            </form>

            <div className="login-links">
              {panel && <a href={panel} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> 去 {current?.name} 创建令牌</a>}
              <button type="button" onClick={() => setAdvanced(!advanced)}><Icon name="settings" size={14} /> 服务器地址</button>
            </div>
            {advanced && (
              <div className="login-adv">
                <label className="field"><span>API 地址</span>
                  <div className="inp-wrap"><Icon name="link" size={15} />
                    <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://host/api/v1" spellCheck={false} /></div>
                </label>
                <p>上游原生支持 CORS，跨域填完整地址即可，不需要网关。改这里只影响当前站点。</p>
              </div>
            )}
          </>
        )}

        <div className="login-foot">
          <Icon name="info" size={14} />
          <span>站点与令牌只按站点标识存在这台浏览器里，不写进网站文件，也不会发给第三方。换台电脑要重新接入。</span>
        </div>
      </div>
      {!adding && already && (
        <button className="login-back" onClick={() => nav('/')}>「{current?.name}」已有登录态 · 返回首页 →</button>
      )}
    </div>
  );
}
