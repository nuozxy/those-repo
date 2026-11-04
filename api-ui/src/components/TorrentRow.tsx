import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Torrent } from '@/lib/api';
import { setBookmark, useBookmarks } from '@/lib/bookmarks';
import { Icon } from './Icon';
import { Poster } from './Poster';
import { useToast } from './Toast';

/** 列表视图的一行：封面 / 标题 / 大小 / 做种下载条 / 完成 / 操作 */
/* 悬停放大图：176×264 看不清封面，直接翻倍到 352×528；小屏再按视口收缩 */
const ZOOM_W = 352;
const ZOOM_H = 528;

export function TorrentRow({ t, onToggle }: { t: Torrent; onToggle?: (id: number, v: boolean) => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const bm = useBookmarks();
  /* 分区接口的 has_bookmarked 不可信，统一用收藏 id 集合判断 */
  const [pending, setPending] = useState<boolean | null>(null);
  const mark = pending ?? (bm.ready ? bm.has(t.id) : false);
  const [busy, setBusy] = useState(false);
  /* 缩略图只有 46px 宽，看不清；悬停时在侧边浮出一张放大的封面 */
  const [zoom, setZoom] = useState<{ top: number; left: number; w: number; h: number } | null>(null);
  const promo = t.promotion_info?.text || '';
  const free = (t.promotion_info?.down_multiplier ?? 1) === 0;
  const total = t.seeders + t.leechers || 1;
  const sp = (t.seeders / total) * 100;
  const lp = (t.leechers / total) * 100;
  const std = t.sub_categories?.standard?.value;
  const team = t.sub_categories?.team?.value;

  function showZoom(e: React.MouseEvent<HTMLElement>) {
    if (!t.cover) return;
    const r = e.currentTarget.getBoundingClientRect();
    const gap = 12;
    // 视口装不下 352×528 时等比缩小，但不会小于原来的 176×264
    const maxW = Math.min(ZOOM_W, window.innerWidth - 24);
    const maxH = Math.min(ZOOM_H, window.innerHeight - 24);
    const w = Math.max(176, Math.min(maxW, maxH / 1.5));
    const h = Math.round(w * 1.5);
    // 右侧放不下就翻到左侧，并保证不出视口
    const rawLeft = window.innerWidth - r.right >= w + gap ? r.right + gap : r.left - w - gap;
    const left = Math.max(10, Math.min(rawLeft, window.innerWidth - w - 10));
    const top = Math.min(Math.max(r.top + r.height / 2 - h / 2, 10), window.innerHeight - h - 10);
    setZoom({ top, left, w, h });
  }

  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !mark;
    try {
      await setBookmark(t.id, next);
      setPending(next);
      onToggle?.(t.id, next);
      toast(next ? '已加入收藏' : '已取消收藏', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'err');
    } finally { setBusy(false); }
  }

  return (
    <div
      className="lrow" role="link" tabIndex={0}
      onClick={() => nav(`/t/${t.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') nav(`/t/${t.id}`); }}
    >
      <span className="lrow-p"
        onMouseEnter={showZoom}
        onMouseLeave={() => setZoom(null)}>
        <Poster name={t.name} cover={t.cover} descr={t.small_descr} className="lrow-poster" />
      </span>

      <span className="lrow-m">
        <span className="lrow-t" title={t.name}>{t.name}</span>
        {/* 副标题：small_descr，原来只在详情页有，列表看不到 */}
        {t.small_descr && <span className="lrow-s" title={t.small_descr}>{t.small_descr}</span>}
        <span className="lrow-tags">
          {promo && <span className={`chip ${free ? 'free' : 'promo'}`}>{promo}</span>}
          {std && <span className="chip">{std}</span>}
          {team && team !== 'Other' && <span className="chip">{team}</span>}
          {t.hr ? <span className="chip hr">H&amp;R</span> : null}
          <span>{t.added_human}</span>
        </span>
      </span>

      <span className="lrow-size">{t.size_human}</span>

      <span className="lrow-bar">
        <span className="lrow-pair"><span className="s">▲{t.seeders}</span><span className="l">▼{t.leechers}</span></span>
        <span className="bar"><i style={{ width: `${sp}%` }} /><u style={{ width: `${lp}%` }} /></span>
      </span>

      <span className="lrow-n">{t.times_completed} 完成</span>

      <span className="lrow-acts">
        <button className="iconbtn" onClick={toggle} disabled={busy}
          title={mark ? '取消收藏' : '加入收藏'}
          style={mark ? { color: 'var(--warn)', borderColor: 'var(--warn)' } : undefined}>
          <Icon name="star" size={14} />
        </button>
        {t.download_url
          ? <a className="iconbtn" href={t.download_url} title="下载种子" onClick={(e) => e.stopPropagation()}><Icon name="download" size={14} /></a>
          : <span className="iconbtn" title="资源无下载链接"><Icon name="download" size={14} /></span>}
      </span>

      {zoom && (
        <span className="lrow-zoom" style={{ top: zoom.top, left: zoom.left, width: zoom.w, height: zoom.h }} aria-hidden="true">
          <Poster name={t.name} cover={t.cover} descr={t.small_descr} className="lrow-zoom-poster" eager />
          <span className="lrow-zoom-name">{t.name}</span>
        </span>
      )}
    </div>
  );
}
