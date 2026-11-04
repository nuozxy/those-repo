import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  activeSiteId, getImageMode, getTheme, getToken, listSites, logout, removeSite,
  saveSettings, saveSite, setActiveSite, setImageMode, setTheme, setToken, settings,
  type ImageMode, type Site,
} from '@/lib/config';
import { tokenPage } from '@/lib/auth';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';

const ENDPOINTS = [
  ['GET', '/torrents', '全部种子 / 搜索 / 排序 / 筛选'],
  ['GET', '/torrents/{section}', '特别区 / 分区种子'],
  ['GET', '/detail/{id}', '种子详情、签名下载链接'],
  ['GET', '/comments?torrent_id=', '评论列表（只读）'],
  ['GET', '/sections', '分区 / 分类 / 标签选项'],
  ['GET', '/profile', '当前登录用户资料'],
  ['GET', '/profile/{id}', '其他用户资料'],
  ['POST', '/upload', '发布种子'],
  ['POST', '/bookmarks', '新增收藏'],
  ['POST', '/bookmarks/delete', '删除收藏'],
];

const IMAGE_MODES: { v: ImageMode; label: string; note: string }[] = [
  { v: 'auto', label: '自动（推荐）', note: '先直连原图，不可达时走图片代理' },
  { v: 'direct', label: '只直连', note: '不经过任何第三方，外网图床不可达时显示字封' },
  { v: 'proxy', label: '只走代理', note: '全部外链图都经 coverProxy / 公共代理' },
  { v: 'off', label: '不加载外链图', note: '一律用生成式封面，最省流量' },
];

const EMPTY: Site = { id: '', name: '', apiBase: '', color: '#2bd9c4' };

/** 由 API 地址推出该站控制面板，用户可以直接去创建个人访问令牌 */
function tokenUrl(apiBase: string): string {
  try {
    const u = new URL(apiBase, window.location.origin);
    return `${u.origin}/usercp.php`;
  } catch { return ''; }
}

export default function SettingsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [activeId, setActiveId] = useState(activeSiteId());
  const [sites, setSites] = useState<Site[]>(listSites());
  const cfg = settings(activeId);

  const [base, setBase] = useState(cfg.apiBase);
  const [push, setPush] = useState(cfg.pushEndpoint);
  const [login, setLogin] = useState(cfg.loginEndpoint);
  const [cover, setCover] = useState(cfg.coverProxy);
  const [imgMode, setModeState] = useState<ImageMode>(getImageMode());
  const [theme, setT] = useState<'dark' | 'light'>(getTheme());
  const [draft, setDraft] = useState<Site | null>(null);
  const [draftToken, setDraftToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [me, setMe] = useState('');

  const current = sites.find((s) => s.id === activeId);

  useEffect(() => {
    const c = settings(activeId);
    setBase(c.apiBase); setPush(c.pushEndpoint); setLogin(c.loginEndpoint); setCover(c.coverProxy);
    setMe('');
  }, [activeId]);

  function save() {
    saveSettings({ apiBase: base, pushEndpoint: push, loginEndpoint: login, coverProxy: cover });
    setSites(listSites());
    toast('连接设置已保存', 'ok');
  }
  async function test() {
    setTesting(true); setMe('');
    try {
      saveSettings({ apiBase: base, pushEndpoint: push, loginEndpoint: login, coverProxy: cover });
      const u = await api.profile(undefined, activeId);
      setMe(`${u.username}（${u.class_text || '用户'}）`);
      toast('连接正常', 'ok');
    } catch (e) { toast(e instanceof Error ? e.message : '连接失败', 'err'); }
    finally { setTesting(false); }
  }
  function enter(id: string) {
    setActiveSite(id);
    window.location.assign('/');
  }
  function openDraft(s: Site | null) {
    setDraft(s ? { ...s } : { ...EMPTY });
    setDraftToken('');
  }

  /** 保存站点；填了令牌就当场验证，验证通过可直接「保存并进入」，不用再跳登录页 */
  async function submitSite(enterAfter = false) {
    if (!draft) return;
    const id = draft.id.trim().toLowerCase();
    const name = draft.name.trim() || id;
    const apiBase = draft.apiBase.trim();
    if (!/^[a-z0-9_-]{2,24}$/.test(id)) { toast('标识只能是 2-24 位小写字母 / 数字 / - _', 'err'); return; }
    if (!/^https?:\/\//.test(apiBase) && !apiBase.startsWith('/')) { toast('API 地址要以 http(s):// 开头', 'err'); return; }

    saveSite({ ...draft, id, name, apiBase });
    const tok = draftToken.trim();
    if (tok) {
      setToken(tok, id);
      try {
        await api.profile(undefined, id);
      } catch (e) {
        setSites(listSites());
        toast(`站点已保存，但令牌验证失败：${e instanceof Error ? e.message : '请检查令牌'}`, 'err');
        return;
      }
    }
    setSites(listSites());
    setDraft(null);
    setDraftToken('');
    if (enterAfter) {
      setActiveSite(id);
      window.location.assign(getToken(id) ? '/' : '/login');
      return;
    }
    toast(tok ? '站点已保存，令牌验证通过' : '站点已保存', 'ok');
  }
  function del(id: string) {
    if (!confirm(`删除站点「${id}」？只影响这台浏览器里的配置与令牌。`)) return;
    removeSite(id);
    const next = listSites();
    setSites(next);
    setActiveId(activeSiteId());
    toast('已删除', 'ok');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>连接设置</h1><p className="page-sub">配置只存在本机浏览器；站点可以同时挂多个，各自独立</p></div>
        <button className="btn sm" onClick={() => nav('/sites')}><Icon name="link" size={14} /> 站点总览</button>
      </div>

      {/* 站点管理 */}
      <section className="panel pad">
        <div className="panel-h">
          <Icon name="link" size={16} /> 站点管理 <span className="panel-n">{sites.length}</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => openDraft(null)}>
            <Icon name="plus" size={14} /> 添加站点
          </button>
        </div>

        <div className="slist">
          {sites.map((s) => (
            <div className="srow" key={s.id}>
              <span className="dot" style={{ background: s.color }} />
              <span style={{ minWidth: 0 }}>
                <b>{s.name} {s.id === activeId && <span className="tag" style={{ fontSize: 10 }}>当前</span>}</b>
                <small>{s.apiBase} · {getToken(s.id) ? '已登录' : '未登录'}{s.builtin ? ' · config.js 预置' : ''}</small>
              </span>
              <span className="acts">
                {s.id !== activeId && <button className="btn sm" onClick={() => enter(s.id)}>进入</button>}
                <button className="btn sm ghost" onClick={() => openDraft(s)}><Icon name="settings" size={13} /></button>
                <button className="btn sm ghost" onClick={() => del(s.id)}><Icon name="x" size={13} /></button>
              </span>
            </div>
          ))}
        </div>

        {draft && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-h"><Icon name="plus" size={15} /> {sites.some((s) => s.id === draft.id) ? '编辑站点' : '新增站点'}</div>
            <div className="pad">
              <div className="sform">
                <label className="field"><span>标识 <em>id · 小写，建后不改</em></span>
                  <input value={draft.id} disabled={sites.some((s) => s.id === draft.id)}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="those" spellCheck={false} />
                </label>
                <label className="field"><span>名称</span>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Those" />
                </label>
                <label className="field span2"><span>API 地址 <em>apiBase</em></span>
                  <input value={draft.apiBase} onChange={(e) => setDraft({ ...draft, apiBase: e.target.value })} placeholder="http://host/api/v1" spellCheck={false} />
                </label>
                <label className="field span2">
                  <span>访问令牌 <em>可选 · 只存在本机，不写进文件</em></span>
                  <div className="inp-wrap">
                    <Icon name="key" size={15} />
                    <input type="password" value={draftToken} onChange={(e) => setDraftToken(e.target.value)}
                      placeholder={draft.id && getToken(draft.id) ? '留空则沿用已保存的令牌' : '7|xxxxxxxxxxxxxxxxxxxxxxxx'}
                      spellCheck={false} autoComplete="off" />
                  </div>
                  <small className="field-note">
                    每个用户、每个站点各自的令牌，在
                    {tokenUrl(draft.apiBase) && (
                      <a href={tokenUrl(draft.apiBase)} target="_blank" rel="noreferrer"> 该站控制面板 <Icon name="external" size={12} /> </a>
                    )}
                    创建；填了会当场用 /profile 验证。
                  </small>
                </label>
                <label className="field"><span>标识色</span>
                  <input type="color" value={draft.color || '#2bd9c4'} onChange={(e) => setDraft({ ...draft, color: e.target.value })} style={{ padding: 4, height: 36 }} />
                </label>
              </div>
              <div className="row-btns mt">
                <button className="btn primary sm" onClick={() => void submitSite(false)}><Icon name="check" size={15} /> 保存站点</button>
                <button className="btn sm" onClick={() => void submitSite(true)}><Icon name="external" size={15} /> 保存并进入</button>
                <button className="btn ghost sm" onClick={() => setDraft(null)}>取消</button>
              </div>
            </div>
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          想让它对所有访问者默认可见，就写进 <code>config.js</code> 的 <code>sites</code>；
          这里加的只存在你这台浏览器。令牌从不写进文件，每个站点各自登录。
        </p>
      </section>

      {/* 当前站点参数 */}
      <section className="panel pad">
        <div className="panel-h">
          <Icon name="gauge" size={16} /> 当前站点：{current?.name || activeId}
          <span className="panel-n">{getToken(activeId) ? '已登录' : '未登录'}</span>
        </div>
        <div className="fgrid">
          <label className="field span2"><span>API 地址 <em>apiBase</em></span>
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://host/api/v1" spellCheck={false} />
          </label>
          <label className="field span2"><span>下载器推送服务 <em>pushEndpoint · 预留，留空即隐藏按钮</em></span>
            <input value={push} onChange={(e) => setPush(e.target.value)} placeholder="http://host:port" spellCheck={false} />
          </label>
          <label className="field span2"><span>账号密码登录服务 <em>loginEndpoint · 预留，留空即只用令牌登录</em></span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="http://host:port" spellCheck={false} />
          </label>
          <label className="field span2"><span>外链图片代理 <em>coverProxy · 格式 {'{base}'}?u={'{url}'}，留空用公共代理</em></span>
            <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="http://host:port/bff/img" spellCheck={false} />
          </label>
          <label className="field span2"><span>图片加载方式 <em>imageMode</em></span>
            <select value={imgMode} onChange={(e) => {
              const v = e.target.value as ImageMode;
              setImageMode(v); setModeState(v);
              toast('已切换，刷新页面后全部生效', 'ok');
            }}>
              {IMAGE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label} — {m.note}</option>)}
            </select>
          </label>
        </div>
        <div className="row-btns mt">
          <button className="btn primary sm" onClick={save}><Icon name="check" size={15} /> 保存</button>
          <button className="btn sm" onClick={test} disabled={testing}><Icon name="refresh" size={15} /> {testing ? '测试中…' : '测试连接'}</button>
          <button className="btn ghost sm" onClick={() => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setT(t); }}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} /> {theme === 'dark' ? '浅色主题' : '深色主题'}
          </button>
          {getToken(activeId) && (
            <button className="btn ghost sm" onClick={() => { logout(activeId); setSites(listSites()); nav('/login'); }}>
              <Icon name="external" size={15} /> 退出这个站点
            </button>
          )}
        </div>
        {me && <div className="okline"><Icon name="check" size={15} /> 连接正常：{me}</div>}
        <p className="muted" style={{ marginBottom: 0 }}>
          图片：原图直连失败时才走代理，代理也失败则退化为生成式封面，不会出现破图。
          {tokenPage() && <> 令牌在原站「控制面板 → 访问令牌」创建。</>}
        </p>
      </section>

      <section className="panel pad">
        <div className="panel-h"><Icon name="info" size={16} /> 本前台使用的全部接口 <span className="panel-n">{ENDPOINTS.length}</span></div>
        <p className="muted">除此之外没有任何数据来源：不抓原站页面、不读数据库、不做演示假数据。所有站点用的是同一套接口。</p>
        <div className="ep-list">
          {ENDPOINTS.map(([m, p, note]) => (
            <div className="ep" key={m + p}>
              <span className={`ep-m ${m === 'GET' ? 'get' : 'post'}`}>{m}</span>
              <code>{p}</code><span className="ep-note">{note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel pad">
        <div className="panel-h"><Icon name="send" size={16} /> 预留后端契约（以后接 Transmission / qBittorrent）</div>
        <div className="contract">
          <div><b>POST {`{pushEndpoint}`}/push</b><code>{'{ torrentId, name, downloadUrl, target? }'}</code>
            <p>后端用 downloadUrl 取回 .torrent，再调 Transmission 的 <code>torrent-add</code>（metainfo=base64）或 qBittorrent 的 <code>/api/v2/torrents/add</code>（multipart 文件）。返回 <code>{'{ ok, downloader, message }'}</code>。</p></div>
          <div><b>POST {`{loginEndpoint}`}/login</b><code>{'{ username, password }'}</code>
            <p>后端用账号密码换出个人令牌（可复用原站 <code>/web/token/add</code>），返回 <code>{'{ ok, token }'}</code>，前端拿去验 /profile 后登录。</p></div>
        </div>
        <p className="muted">这两项都不属于官方开放 API，所以默认关闭：填了地址才会出现对应按钮。前端本身仍是零后端纯静态。</p>
      </section>
    </>
  );
}
