import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Torrent } from '@/lib/api';
import { setBookmark, useBookmarks } from '@/lib/bookmarks';
import { Poster } from './Poster';
import { Icon } from './Icon';
import { useToast } from './Toast';

export function TorrentCard({ t, onToggle, eager }: {
  t: Torrent; onToggle?: (id: number, v: boolean) => void; eager?: boolean;
}) {
  const toast = useToast();
  const bm = useBookmarks();
  /* 同列表行：不用接口返回的 has_bookmarked，统一用收藏 id 集合 */
  const [pending, setPending] = useState<boolean | null>(null);
  const mark = pending ?? (bm.ready ? bm.has(t.id) : false);
  const [busy, setBusy] = useState(false);
  const promo = t.promotion_info?.text;
  const promoDown = (t.promotion_info?.down_multiplier ?? 1) === 0;
  const res = t.sub_categories?.standard?.value;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !mark;
    try {
      await setBookmark(t.id, next);
      setPending(next); onToggle?.(t.id, next);
      toast(next ? '已加入收藏' : '已取消收藏', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'err');
    } finally { setBusy(false); }
  }

  return (
    <Link to={`/t/${t.id}`} className="tcard">
      <div className="tcard-p">
        {/* fit=contain：PT 站里大量「封面」是横版视频截图，cover 会被裁得只剩中间一条 */}
        <Poster name={t.name} cover={t.cover} descr={t.small_descr} className="tcard-img" eager={eager} />
        <div className="tcard-badges">
          {promo && <span className={`badge ${promoDown ? 'badge-free' : 'badge-promo'}`}>{promo}</span>}
          {res && <span className="badge badge-res">{res}</span>}
          {t.hr ? <span className="badge badge-hr">H&amp;R</span> : null}
          {t.pick_type && t.pick_type !== 'normal' && <span className="badge badge-pick">{t.pick_info?.text || '推荐'}</span>}
        </div>
        <button className={`markbtn ${mark ? 'on' : ''}`} onClick={toggle} disabled={busy}
          title={mark ? '取消收藏' : '加入收藏'} aria-label={mark ? '取消收藏' : '加入收藏'}>
          <Icon name="star" size={15} />
        </button>
        {t.small_descr && <div className="tcard-s" title={t.small_descr}>{t.small_descr}</div>}
      </div>
      <div className="tcard-b">
        <div className="tcard-t" title={t.name}>{t.name}</div>
        <div className="tcard-meta">
          <span>{t.size_human}</span>
          <span className="seed"><Icon name="arrowUp" size={12} />{t.seeders}</span>
          <span className="leech"><Icon name="arrowDown" size={12} />{t.leechers}</span>
          <span><Icon name="check" size={12} />{t.times_completed}</span>
        </div>
        <div className="tcard-foot">
          <span className="tcard-cat">{t.category_info?.name?.replace(/^\w+\s*\|\s*/, '') || '种子'}</span>
          <span>{t.added_human}</span>
        </div>
      </div>
    </Link>
  );
}
