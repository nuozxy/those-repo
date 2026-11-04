import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Comment, type DescBlock, type Torrent } from '@/lib/api';
import { cleanText, shortDate } from '@/lib/format';
import { pushEnabled, pushToDownloader } from '@/lib/push';
import { setBookmark, useBookmarks } from '@/lib/bookmarks';
import { useAsync } from '@/lib/useAsync';
import { ErrorBox, Skeleton } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Poster } from '@/components/Poster';
import { SmartImage } from '@/components/SmartImage';
import { useToast } from '@/components/Toast';

function DescBlocks({ blocks }: { blocks: DescBlock[] }) {
  return (
    <div className="desc">
      {blocks.map((b, i) => {
        const d = b.data || {};
        if (b.type === 'image' && typeof d.url === 'string') {
          return (
            <SmartImage
              key={i}
              className="desc-img"
              src={d.url}
              w={1200}
              fallback={<p className="desc-link">[图片暂不可达] <a href={d.url} target="_blank" rel="noreferrer">{d.url}</a></p>}
            />
          );
        }
        if (b.type === 'quote') {
          return <blockquote key={i}>{String(d.text ?? d.quote_text ?? '')}</blockquote>;
        }
        const text = String(d.text ?? d.quote_text ?? '');
        if (!text.trim()) return null;
        return <p key={i}>{text}</p>;
      })}
    </div>
  );
}

function CommentList({ items }: { items: Comment[] }) {
  if (!items.length) return <div className="muted pad">暂无评论</div>;
  return (
    <div className="cmts">
      {items.map((c) => (
        <div className="cmt" key={c.id}>
          <span className="cmt-ava">
            <SmartImage src={c.create_user?.avatar} w={72} h={72} fallback={<Icon name="user" size={16} />} />
          </span>
          <div className="cmt-b">
            <div className="cmt-h">
              {c.create_user ? <Link to={`/u/${c.create_user.id}`}>{c.create_user.username}</Link> : <span>已注销用户</span>}
              <span>{shortDate(c.created_at)}</span>
            </div>
            <div className="cmt-t">{cleanText(c.text) || '（表情 / 空内容）'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Detail() {
  const { id: idStr } = useParams();
  const id = Number(idStr);
  const toast = useToast();
  const bm = useBookmarks();
  const [mark, setMark] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [tab, setTab] = useState<'desc' | 'media' | 'nfo'>('desc');

  const d = useAsync<Torrent>(() => api.detail(id), [id]);
  const c = useAsync(() => api.comments(id), [id]);

  const t = d.data;
  /* 详情接口对 special 分区的 has_bookmarked 也不准，统一以收藏集合为准 */
  const marked = mark ?? (bm.ready ? bm.has(id) : false);
  const canPush = pushEnabled() && !!t?.download_url;

  async function toggleMark() {
    if (!t || busy) return;
    setBusy(true);
    const next = !marked;
    try {
      await setBookmark(id, next);
      setMark(next);
      toast(next ? '已加入收藏' : '已取消收藏', 'ok');
    } catch (e) { toast(e instanceof Error ? e.message : '操作失败', 'err'); }
    finally { setBusy(false); }
  }

  async function doPush() {
    if (!t?.download_url || pushing) return;
    setPushing(true);
    try {
      const r = await pushToDownloader({ torrentId: id, name: t.name, downloadUrl: t.download_url });
      toast(r.ok ? `已推送到 ${r.downloader || '下载器'}` : r.message, r.ok ? 'ok' : 'err');
    } catch (e) { toast(e instanceof Error ? e.message : '推送失败', 'err'); }
    finally { setPushing(false); }
  }

  if (d.loading) return (
    <div className="detail-skel">
      <Skeleton h={32} w="70%" /><Skeleton h={16} w="40%" />
      <div className="dgrid"><Skeleton h={420} r={14} /><div><Skeleton h={200} r={14} /><Skeleton h={120} r={14} /></div></div>
    </div>
  );
  if (d.error || !t) return <ErrorBox text={d.error || '种子不存在'} onRetry={d.reload} />;

  const subs = Object.entries(t.sub_categories || {});

  return (
    <>
      <div className="detail-top">
        <Link to="/" className="backlink"><Icon name="chevL" size={15} /> 返回列表</Link>
        <div className="detail-title">
          <h1>{t.name}</h1>
          {t.small_descr && <p>{t.small_descr}</p>}
        </div>
        <div className="detail-acts">
          {t.download_url && <a className="btn primary" href={t.download_url} target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> 下载种子</a>}
          <button className={`btn ${marked ? 'marked' : ''}`} onClick={toggleMark} disabled={busy}>
            <Icon name="star" size={16} /> {marked ? '已收藏' : '收藏'}</button>
          {canPush && <button className="btn ghost" onClick={doPush} disabled={pushing}>
            <Icon name="send" size={16} /> {pushing ? '推送中…' : '推送到下载器'}</button>}
        </div>
      </div>

      <div className="dgrid">
        <div className="dleft">
          <Poster name={t.name} cover={t.cover} descr={t.small_descr} label={t.category_info?.name?.split('|')[0].trim()} className="dposter" />
          <div className="dstat">
            <div><span>体积</span><b>{t.size_human}</b></div>
            <div><span>文件数</span><b>{t.numfiles}</b></div>
            <div><span>做种</span><b className="up">{t.seeders}</b></div>
            <div><span>下载</span><b className="down">{t.leechers}</b></div>
            <div><span>完成</span><b>{t.times_completed}</b></div>
            <div><span>评论</span><b>{t.comments}</b></div>
          </div>
          <div className="dchips">
            {t.promotion_info?.text && <span className="chip promo" style={{ background: t.promotion_info.color }}>{t.promotion_info.text}</span>}
            {t.hr ? <span className="chip warn">H&amp;R</span> : null}
            {t.pick_type !== 'normal' && <span className="chip">{t.pick_info?.text || '推荐'}</span>}
            {t.category_info && <span className="chip">{t.category_info.name}</span>}
            <span className="chip">{t.added_human}发布</span>
          </div>
        </div>

        <div className="dright">
          <section className="panel">
            <div className="panel-h"><Icon name="info" size={16} /> 基本信息</div>
            <div className="kv">
              <div><span>种子 ID</span><b>#{t.id}</b></div>
              <div style={{ gridColumn: '1 / -1' }}><span>Info Hash</span><b className="mono">{t.hash}</b></div>
              <div><span>发布时间</span><b>{t.added}</b></div>
              <div><span>最后活动</span><b>{t.last_action}</b></div>
              <div><span>发布者</span><b>{t.anonymous === 'yes' ? '匿名' : t.user
                ? <Link to={`/u/${t.user.id}`}>{t.user.username}</Link> : '—'}</b></div>
              <div><span>浏览量 / 点击</span><b>{t.views} / {t.hits}</b></div>
            </div>
          </section>

          {subs.length > 0 && (
            <section className="panel">
              <div className="panel-h"><Icon name="stack" size={16} /> 子分类</div>
              <div className="kv kv-2">
                {subs.map(([k, v]) => <div key={k}><span>{v.label}</span><b>{v.value || '—'}</b></div>)}
              </div>
            </section>
          )}

          {!!t.tags?.length && (
            <section className="panel">
              <div className="panel-h"><Icon name="medal" size={16} /> 标签</div>
              <div className="tags">
                {t.tags.map((tag) => (
                  <span key={tag.id} className="tag" style={{ background: tag.color, color: tag.font_color || '#fff' }}>{tag.name}</span>
                ))}
              </div>
            </section>
          )}

          {t.user && (
            <section className="panel">
              <div className="panel-h"><Icon name="user" size={16} /> 发布者</div>
              <Link to={`/u/${t.user.id}`} className="pub">
                <span className="pub-ava"><SmartImage src={t.user.avatar} w={80} h={80} fallback={<Icon name="user" size={18} />} /></span>
                <span><b>{t.user.username}</b><small>{t.user.class_text || '用户'}</small></span>
                <Icon name="chevR" size={16} />
              </Link>
            </section>
          )}
        </div>
      </div>

      <section className="panel block">
        <div className="tabs line">
          <button className={tab === 'desc' ? 'on' : ''} onClick={() => setTab('desc')}>详情描述</button>
          {t.extra?.media_info && <button className={tab === 'media' ? 'on' : ''} onClick={() => setTab('media')}>MediaInfo</button>}
          {t.extra?.nfo && <button className={tab === 'nfo' ? 'on' : ''} onClick={() => setTab('nfo')}>NFO</button>}
        </div>
        {tab === 'desc' && (t.description?.length
          ? <DescBlocks blocks={t.description} />
          : <div className="muted pad">{cleanText(t.extra?.descr || '') || '该种子没有详细描述'}</div>)}
        {tab === 'media' && <pre className="pre">{String(t.extra?.media_info || '')}</pre>}
        {tab === 'nfo' && <pre className="pre">{String(t.extra?.nfo || '')}</pre>}
      </section>

      <section className="panel block">
        <div className="panel-h">
          <Icon name="users" size={16} /> 评论 <span className="panel-n">{c.data?.items.length ?? 0}</span>
          <span className="readonly">只读 · API 未提供发表评论接口</span>
        </div>
        {c.loading ? <div className="pad"><Skeleton h={54} r={9} /><Skeleton h={54} r={9} /></div>
          : c.error ? <ErrorBox text={c.error} onRetry={c.reload} />
            : <CommentList items={c.data?.items || []} />}
      </section>
    </>
  );
}
