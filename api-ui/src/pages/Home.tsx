import { Link } from 'react-router-dom';
import { api, type Torrent, type UserBrief } from '@/lib/api';
import { activeSite, getToken, listSites } from '@/lib/config';
import { loadBookmarks } from '@/lib/bookmarks';
import { useAsync } from '@/lib/useAsync';
import { ErrorBox, Skeleton } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Poster } from '@/components/Poster';
import { TorrentCard } from '@/components/TorrentCard';
import { TorrentRow } from '@/components/TorrentRow';

export default function Home() {
  const site = activeSite();
  const token = getToken();
  const sites = listSites();

  const hot = useAsync(() => api.torrents({ perPage: 5, sorts: '-seeders', visible: 1 }), []);
  const latest = useAsync(() => api.torrents({ perPage: 6, sorts: '-id', visible: 1 }), []);
  const me = useAsync<UserBrief | null>(() => (token ? api.profile() : Promise.resolve(null)), [token]);
  /* 收藏必须跨分区取：/torrents?filter[bookmark]=1 只覆盖普通分区，
     特别分区（蓝光等）的收藏要按分区单独请求再合并，否则首页永远显示「还没有收藏」 */
  const marks = useAsync<Torrent[]>(async () => {
    if (!token) return [];
    return (await loadBookmarks()).slice(0, 5);
  }, [token]);

  const total = latest.data?.meta?.total ?? 0;
  const covers = (latest.data?.items || []).map((t) => t.cover).filter(Boolean).slice(0, 5) as string[];
  const p = me.data;

  return (
    <>
      <section className="hero">
        <div className="hero-bg">
          {covers.map((c, i) => <Poster key={i} name={`hero${i}`} cover={c} className="hero-poster" eager />)}
        </div>
        <div className="hero-in">
          <div>
            <div className="hero-tag">深夜场 · {site.name}</div>
            <h1>今晚 <em>{total.toLocaleString()}</em> 部在架</h1>
            <p>
              <span>最新入库 <b>{latest.data?.items[0]?.added_human || '—'}</b></span>
              <span>已接入 <b>{sites.length}</b> 个站点</span>
              <span>状态 <b>{p?.username || (token ? '已连接' : '未登录')}</b></span>
            </p>
          </div>
          <div className="hero-acts">
            <Link className="btn primary" to="/torrents">进入片库</Link>
            <Link className="btn" to="/upload">发布种子</Link>
            <Link className="btn ghost" to="/sites">站点总览</Link>
          </div>
        </div>
      </section>

      <div className="home-split">
        <div>
          <section className="sec">
            <div className="sec-h">
              <h2>热种榜 <span>按做种数</span></h2>
              <Link className="more" to="/torrents?sort=-seeders">全部 →</Link>
            </div>
            {hot.loading && <div className="picks wall">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={228} r={8} />)}</div>}
            {!hot.loading && hot.error && <ErrorBox text={hot.error} onRetry={hot.reload} />}
            {!hot.loading && !hot.error && (
              <div className="picks wall">
                {hot.data?.items.map((t, i) => <TorrentCard key={t.id} t={t} eager={i < 5} />)}
              </div>
            )}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>最新入库 <span>共 {total.toLocaleString()} 部</span></h2>
              <Link className="more" to="/torrents">查看全部 →</Link>
            </div>
            {latest.loading && <div className="tgrid list">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} />)}</div>}
            {!latest.loading && latest.error && <ErrorBox text={latest.error} onRetry={latest.reload} />}
            {!latest.loading && !latest.error && (
              <div className="tgrid list">
                {latest.data?.items.map((t) => <TorrentRow key={t.id} t={t} />)}
              </div>
            )}
          </section>
        </div>

        <aside className="home-side">
          <section className="rail">
            <div className="rail-h"><Icon name="gauge" size={15} /> 我的状态 <Link className="more" to="/me">详情 →</Link></div>
            {token ? (
              <div className="rail-kv">
                <div><b className="up">{p?.uploaded_text ?? '—'}</b><span>上传</span></div>
                <div><b className="dn">{p?.downloaded_text ?? '—'}</b><span>下载</span></div>
                <div><b>{p?.share_ratio ?? '—'}</b><span>分享率</span></div>
                <div><b className="acc">{p?.bonus_human ?? '—'}</b><span>魔力值</span></div>
                <div><b>{p?.seed_points_human ?? '—'}</b><span>做种积分</span></div>
                <div><b>{p?.seed_bonus_per_hour_human ?? '—'}</b><span>时产魔力</span></div>
              </div>
            ) : (
              <div className="rail-b">
                <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>还没有连接这个站点。</p>
                <Link className="btn sm primary" to="/login" style={{ marginTop: 10 }}>
                  <Icon name="key" size={14} /> 用个人令牌登录
                </Link>
              </div>
            )}
          </section>

          <section className="rail">
            <div className="rail-h"><Icon name="link" size={15} /> 站点概览 <Link className="more" to="/sites">切换 →</Link></div>
            <div className="rail-kv">
              <div><b>{total.toLocaleString()}</b><span>种子总数</span></div>
              <div><b>{sites.length}</b><span>已接站点</span></div>
            </div>
            <div className="rail-b" style={{ display: 'grid', gap: 7 }}>
              <div className="site-kv"><span>当前站点</span><b>{site.name}</b></div>
              <div className="site-kv" style={{ wordBreak: 'break-all' }}><span>API</span><b style={{ fontSize: 11, fontWeight: 500 }}>{site.apiBase}</b></div>
              <div className="site-kv"><span>令牌</span><b style={{ color: token ? 'var(--good)' : 'var(--warn)' }}>{token ? '已连接' : '未登录'}</b></div>
            </div>
          </section>

          <section className="rail">
            <div className="rail-h"><Icon name="star" size={15} /> 我的收藏 <Link className="more" to="/bookmarks">全部 →</Link></div>
            {!token && <div className="rail-b muted" style={{ fontSize: 12 }}>登录后显示收藏</div>}
            {token && marks.loading && <div className="rail-b"><Skeleton h={92} /></div>}
            {token && !marks.loading && !marks.error && !marks.data?.length && (
              <div className="rail-b muted" style={{ fontSize: 12 }}>还没有收藏任何种子</div>
            )}
            {token && !marks.loading && !!marks.error && <ErrorBox text={marks.error} onRetry={marks.reload} />}
            {token && !!marks.data?.length && (
              <div>
                {marks.data.map((t, i) => (
                  <Link className="rail-row" to={`/t/${t.id}`} key={t.id}>
                    <span className="n">{i + 1}</span>
                    <span className="thumb"><Poster name={t.name} cover={t.cover} descr={t.small_descr} /></span>
                    <span className="t" title={t.name}>{t.name}</span>
                    <span className="v">{t.size_human}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
