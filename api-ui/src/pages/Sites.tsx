import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type UserBrief } from '@/lib/api';
import { activeSiteId, getToken, listSites, setActiveSite, type Site } from '@/lib/config';
import { Icon } from '@/components/Icon';
import { SmartImage } from '@/components/SmartImage';
import { Skeleton } from '@/components/Feedback';

interface SiteState {
  loading?: boolean;
  error?: string;
  total?: number;
  covers?: string[];
  profile?: UserBrief;
}

export default function Sites() {
  const nav = useNavigate();
  const [sites] = useState<Site[]>(listSites());
  const [active] = useState(activeSiteId());
  const [state, setState] = useState<Record<string, SiteState>>({});

  useEffect(() => {
    let alive = true;
    sites.forEach((s) => {
      setState((d) => ({ ...d, [s.id]: { loading: true } }));
      const token = getToken(s.id);
      Promise.all([
        api.torrents({ perPage: 6, sorts: '-id', visible: 1 }, s.id),
        token ? api.profile(undefined, s.id) : Promise.resolve(undefined),
      ])
        .then(([list, me]) => {
          if (!alive) return;
          setState((d) => ({
            ...d,
            [s.id]: {
              total: list.meta?.total,
              covers: list.items.map((t) => t.cover).filter(Boolean) as string[],
              profile: me,
            },
          }));
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setState((d) => ({ ...d, [s.id]: { error: e instanceof Error ? e.message : '连接失败' } }));
        });
    });
    return () => { alive = false; };
  }, [sites]);

  function enter(s: Site) {
    setActiveSite(s.id);
    window.location.assign(getToken(s.id) ? '/' : '/login');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>站点</h1>
          <p className="page-sub">多个站点可以同时挂在这里，各自一份令牌、各自一套数据，互不影响</p>
        </div>
        <div className="row-btns">
          <Link className="btn sm" to="/settings"><Icon name="plus" size={14} /> 添加 / 管理站点</Link>
        </div>
      </div>

      <div className="sites-grid">
        {sites.map((s) => {
          const st = state[s.id] || { loading: true };
          const logged = !!getToken(s.id);
          return (
            <article className={`site-card ${s.id === active ? 'on' : ''}`} key={s.id}>
              <div className="site-top">
                <span className="site-badge" style={{ background: s.color }}>{s.name.slice(0, 1).toUpperCase()}</span>
                <span className="site-name">
                  {s.name}
                  <small>{s.apiBase}</small>
                </span>
                <span className={`site-state ${st.error ? 'err' : logged ? 'ok' : ''}`}>
                  <span className="dot" />
                  {st.loading ? '连接中' : st.error ? '不可达' : logged ? '已登录' : '未登录'}
                </span>
              </div>

              <div className="site-body">
                {st.loading && <Skeleton h={92} r={8} />}
                {!st.loading && st.error && <div className="site-err">{st.error}</div>}
                {!st.loading && !st.error && (
                  <>
                    <div className="site-kv">
                      <span>种子 <b>{st.total?.toLocaleString() ?? '—'}</b></span>
                      {st.profile && <span>用户 <b>{st.profile.username}</b></span>}
                      {st.profile && <span>分享率 <b>{st.profile.share_ratio ?? '—'}</b></span>}
                      {st.profile && <span>魔力 <b>{st.profile.bonus_human ?? '—'}</b></span>}
                    </div>
                    <div className="site-thumbs">
                      {(st.covers || []).slice(0, 6).map((c, i) => (
                        <span className="site-th" key={i}><SmartImage src={c} w={120} h={180} /></span>
                      ))}
                      {!st.covers?.length && <span className="muted" style={{ fontSize: 11.5, gridColumn: 'span 6' }}>这个站点还没有封面</span>}
                    </div>
                  </>
                )}
              </div>

              <div className="site-acts">
                <button className="btn sm primary" onClick={() => enter(s)}>
                  <Icon name="chevR" size={14} /> {s.id === active ? '回到首页' : '切换进入'}
                </button>
                <button className="btn sm" onClick={() => { setActiveSite(s.id); nav('/login'); }}>
                  <Icon name="key" size={14} /> {logged ? '换令牌' : '登录'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="panel pad" style={{ marginTop: 16 }}>
        <div className="panel-h"><Icon name="info" size={16} /> 接入一个站点要填什么</div>
        <div className="ep-list">
          <div className="ep"><span className="ep-m get">标识</span><code>those</code><span className="ep-note">2-24 位小写，只用来区分本站的令牌，建后不改</span></div>
          <div className="ep"><span className="ep-m get">名称</span><code>Those</code><span className="ep-note">顶栏与切换器里显示，可以随时改</span></div>
          <div className="ep"><span className="ep-m get">地址</span><code>https://站点域名/api/v1</code><span className="ep-note">NexusPHP 开放 API 根地址，上游自带 CORS，跨域可直连</span></div>
          <div className="ep"><span className="ep-m post">令牌</span><code>每个用户自己登录</code><span className="ep-note">不写进配置文件；在原站 控制面板 → 访问令牌 创建</span></div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          想让它默认就出现，把站点写进 <code>config.js</code> 的 <code>sites</code> 数组；
          只想自己用，就在「连接设置」里加，只存这台浏览器。
        </p>
      </section>
    </>
  );
}
