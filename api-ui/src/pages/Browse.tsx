import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, SORTS, type PageMeta, type Torrent, type TorrentQuery } from '@/lib/api';
import { sectionLabel, useSections } from '@/lib/useSections';
import { loadBookmarks } from '@/lib/bookmarks';
import { Empty, ErrorBox, Skeleton } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { Pager } from '@/components/Pager';
import { TorrentCard } from '@/components/TorrentCard';
import { TorrentRow } from '@/components/TorrentRow';

type View = 'wall' | 'list';
const VIEW_KEY = 'tey.view';

/** 海报墙：每页显示多少「行」；实际条数 = 行数 × 每行卡片数（随屏宽自动变） */
const WALL_ROWS = [2, 3, 4, 5, 6, 8];
/** 列表：每页条数用整数，最多 100 */
const LIST_PER = [10, 20, 30, 50, 100];

function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'wall'; } catch { return 'wall'; }
}

/** 收藏页在本地排序：服务端收藏是多个分区合并来的，没法交给接口排 */
function compare(a: Torrent, b: Torrent, sort: string): number {
  const dir = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace(/^-/, '');
  const val = (t: Torrent) => {
    switch (key) {
      case 'size': return t.size;
      case 'seeders': return t.seeders;
      case 'leechers': return t.leechers;
      case 'times_completed': return t.times_completed;
      case 'comments': return t.comments;
      default: return t.id;
    }
  };
  return (val(a) - val(b)) * dir;
}

export default function Browse({ sectionName, bookmarkOnly }: {
  sectionName?: string;
  bookmarkOnly?: boolean;
}) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const page = Math.max(1, Number(sp.get('page') || 1));
  const sort = sp.get('sort') || '-id';
  const cat = Number(sp.get('cat') || 0);
  /* 收藏页默认「全部」：收藏的种子常常是没人做种的死种，
     默认活种会把它们全过滤掉，看起来就像「收藏了却不显示」。 */
  const visible = sp.get('visible') === null ? (bookmarkOnly ? 0 : 1) : Number(sp.get('visible'));
  const per = LIST_PER.includes(Number(sp.get('per'))) ? Number(sp.get('per')) : 20;
  const rows = WALL_ROWS.includes(Number(sp.get('rows'))) ? Number(sp.get('rows')) : 3;
  const [view, setView] = useState<View>(readView());
  const [cols, setCols] = useState(6);
  const [tick, setTick] = useState(0);

  const { sections } = useSections();
  const current = useMemo(
    () => sections.find((s) => s.name === (sectionName || 'chd')),
    [sections, sectionName],
  );
  const secInfo = sectionName ? sections.find((s) => s.name === sectionName) : undefined;
  const title = bookmarkOnly ? '我的收藏' : sectionName ? (secInfo ? sectionLabel(secInfo) : sectionName) : '全部种子';
  const endpoint = sectionName ? `GET /torrents/${sectionName}` : 'GET /torrents';

  /* ---------------- 每页条数 ---------------- */
  // 列表：固定整数条；海报墙：行数 × 实测每行卡片数，上限 100 条
  const perPage = view === 'wall' ? Math.min(100, Math.max(1, rows * cols)) : per;

  /* ---------------- 数据：基础页 + 无限流追加 ---------------- */
  const [items, setItems] = useState<Torrent[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  /* 收藏页：所有分区的收藏一次取回，本地筛选 / 排序 / 分页 */
  const [bmAll, setBmAll] = useState<Torrent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [err, setErr] = useState('');
  const [loadedTo, setLoadedTo] = useState(page);
  const seq = useRef(0);
  const busy = useRef(false);
  /* 只有「用户主动往下滚过」才允许自动续页：
     否则跳页后 scrollTo(top) 会把 sentinel 拉进视野，刚跳到第 20 页就自己跑到第 21 页。
     用向下滚动位移判断（而不是只听滚轮），滚动条拖拽 / 键盘 / 触屏都覆盖；
     scrollTo 是向上滚，不会误触发。
     用 state 而不是 ref —— 变化时要重建观察器，否则哨兵一开始就在触发区里、
     之后滚动不会产生「重新进入」的状态变化，就再也不会续页了。 */
  const [armed, setArmed] = useState(false);
  const lastY = useRef(0);
  const suppressUntil = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // 跳页后的平滑滚动 / 列表重建引起的滚动锚定回弹不算「用户向下滚」
      if (Date.now() >= suppressUntil.current && y > lastY.current + 40) setArmed(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const args = (p: number): TorrentQuery => ({
    page: p,
    perPage,
    section: sectionName,
    title: q,
    category: cat || undefined,
    sorts: sort,
    visible,
  });

  // 基础页：筛选 / 视图 / 每页条数 / 手动跳页变化时重置列表
  useEffect(() => {
    if (bookmarkOnly) return;
    const my = ++seq.current;
    setLoading(true); setErr(''); setItems([]); setLoadedTo(page);
    api.torrents(args(page))
      .then((r) => {
        if (my !== seq.current) return;
        setItems(r.items || []);
        setMeta(r.meta);
      })
      .catch((e: unknown) => {
        if (my === seq.current) setErr(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => { if (my === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, sectionName, q, sort, cat, visible, bookmarkOnly, tick]);

  /* 收藏页：普通分区 + 特别分区的收藏一起拉，之后全部本地处理 */
  useEffect(() => {
    if (!bookmarkOnly) { setBmAll(null); return; }
    let alive = true;
    setLoading(true); setErr(''); setLoadedTo(page);
    loadBookmarks(true)
      .then((list) => { if (alive) setBmAll(list); })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : '加载失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkOnly, tick]);

  /* 收藏页是本地分页：URL 页码 / 筛选变化时，重新切到对应页 */
  useEffect(() => {
    if (bookmarkOnly) setLoadedTo(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkOnly, page, perPage, q, cat, sort]);

  /* 收藏页的本地视图：关键词 / 分类 / 排序 */
  const bmView = useMemo(() => {
    if (!bookmarkOnly) return [] as Torrent[];
    const kw = q.trim().toLowerCase();
    return (bmAll || [])
      .filter((t) => !kw || `${t.name} ${t.small_descr || ''}`.toLowerCase().includes(kw))
      .filter((t) => !cat || t.category === cat)
      .slice()
      .sort((a, b) => compare(a, b, sort));
  }, [bookmarkOnly, bmAll, q, cat, sort]);

  const bmMeta: PageMeta | undefined = bookmarkOnly
    ? { total: bmView.length, last_page: Math.max(1, Math.ceil(bmView.length / perPage)) } as PageMeta
    : undefined;
  const pageMeta = bookmarkOnly ? bmMeta : meta;
  /* 收藏页：已经「加载」到第几页，就切出前几页的数据 */
  const shown = bookmarkOnly ? bmView.slice(0, loadedTo * perPage) : items;

  const loadMore = useCallback(async () => {
    if (busy.current || loading || appending || err) return;
    if (!armed) return;
    if (bookmarkOnly) {
      const last = bmMeta?.last_page ?? 1;
      if (loadedTo >= last) return;
      setLoadedTo(loadedTo + 1);
      return;
    }
    if (!meta || loadedTo >= meta.last_page) return;
    busy.current = true;
    setAppending(true);
    const my = seq.current;
    const next = loadedTo + 1;
    try {
      const r = await api.torrents(args(next));
      if (my !== seq.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return prev.concat((r.items || []).filter((x) => !seen.has(x.id)));
      });
      if (r.meta) setMeta(r.meta);
      setLoadedTo(next);
    } catch {
      // 静默：不打断已经加载的内容，滚到底会再触发一次重试
    } finally {
      busy.current = false;
      setAppending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, loading, appending, err, meta, bmMeta, loadedTo, perPage, sectionName, q, sort, cat, visible, bookmarkOnly]);

  /* ---------------- 无限流触发 ---------------- */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(); },
      { rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [view, loadMore, shown.length]);

  /* ---------------- 实测列数（响应式，窗口缩放自动跟） ---------------- */
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || view !== 'wall') return;
    const measure = () => {
      const tpl = getComputedStyle(el).gridTemplateColumns;
      const n = tpl ? tpl.split(' ').filter(Boolean).length : 0;
      if (n > 0) setCols((prev) => (prev === n ? prev : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  function set(k: string, v: string | number) {
    const next = new URLSearchParams(sp);
    if (v === '' || v === 0) next.delete(k); else next.set(k, String(v));
    if (k !== 'page') next.delete('page');
    setSp(next, { replace: false });
  }
  function switchView(v: View) {
    setArmed(false);
    lastY.current = 0;
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }
  function goPage(p: number) {
    lastY.current = window.scrollY;
    suppressUntil.current = Date.now() + 1600;
    setArmed(false);   // 跳页后停在目标页，用户再往下滚才续页
    set('page', p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const atEnd = !!pageMeta && loadedTo >= pageMeta.last_page;
  // 到最后了还差几张才满一行，就补几个低对比度占位卡，海报墙不会缺一角
  const padCount = view === 'wall' && atEnd && !loading && !err && shown.length
    ? (cols - (shown.length % cols)) % cols
    : 0;
  // 两种视图都是无限流：分页器显示「已经加载到第几页」，不是最初那一页
  const pagerPage = loadedTo;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="page-sub">
            {bookmarkOnly
              ? '仅显示当前令牌所属账号收藏的种子'
              : sectionName
                ? '分区名、分类与子分类均来自该站 /sections 接口'
                : '浏览、搜索、排序与筛选全部来自官方开放 API'}
          </p>
        </div>
        <span className="api-tag"><Icon name="link" size={13} /> {endpoint}</span>
      </div>

      <div className="filters">
        <div className="fgroup">
          <label>分类</label>
          <select value={cat} onChange={(e) => set('cat', Number(e.target.value))}>
            <option value={0}>全部分类</option>
            {(current?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label>排序</label>
          <select value={sort} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        {!bookmarkOnly && (
          <div className="fgroup">
            <label>状态</label>
            <select value={visible} onChange={(e) => set('visible', Number(e.target.value))}>
              <option value={1}>活种</option>
              <option value={0}>全部</option>
              <option value={2}>死种</option>
            </select>
          </div>
        )}
        <div className="fgroup">
          <label>{view === 'wall' ? '每页行数' : '每页'}</label>
          {view === 'wall' ? (
            <select value={rows} onChange={(e) => set('rows', Number(e.target.value))}>
              {WALL_ROWS.map((n) => (
                <option key={n} value={n}>{n} 行 · 约 {n * cols} 部</option>
              ))}
            </select>
          ) : (
            <select value={per} onChange={(e) => set('per', Number(e.target.value))}>
              {LIST_PER.map((n) => <option key={n} value={n}>{n} 条</option>)}
            </select>
          )}
        </div>
        {q && (
          <button className="qchip" onClick={() => set('q', '')}>
            「{q}」<Icon name="x" size={13} />
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setTick((t) => t + 1)} title="刷新">
          <Icon name="refresh" size={15} /> 刷新
        </button>
        <div className="vswitch" style={{ marginLeft: 'auto' }}>
          <button className={view === 'wall' ? 'on' : ''} onClick={() => switchView('wall')} title="海报墙">
            <Icon name="film" size={13} /> 海报
          </button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => switchView('list')} title="列表">
            <Icon name="menu" size={13} /> 列表
          </button>
        </div>
      </div>

      <div className="result-line">
        {pageMeta ? (
          <span>
            共 <b>{pageMeta.total.toLocaleString()}</b> 条 · 第 {pagerPage}/{pageMeta.last_page} 页
            {view === 'wall' && <> · 每行 {cols} 部 / 每页 {rows} 行</>}
            {view === 'list' && <> · 每页 {per} 条</>}
            {loadedTo > page && ` · 已连续加载 ${loadedTo - page + 1} 页`}
          </span>
        ) : <span>加载中…</span>}
        {bookmarkOnly && <span className="hint">普通分区 + 特别分区的收藏合并显示，按 <code>filter[bookmark]</code> 取回</span>}
      </div>

      {err && <ErrorBox text={err} onRetry={() => setTick((t) => t + 1)} />}

      {/* ---------------- 海报墙 / 列表：都是无限流，共用哨兵与翻页条 ---------------- */}
      {view === 'wall' ? (
        <div ref={gridRef} className="tgrid wall">
          {loading && Array.from({ length: Math.min(perPage, 24) }, (_, i) => (
            <div className="tcard" key={'sk' + i}>
              <Skeleton h={220} r={10} />
              <div className="tcard-b"><Skeleton h={14} w="92%" /><Skeleton h={11} w="62%" /></div>
            </div>
          ))}
          {!loading && !err && shown.map((t, i) => (
            <TorrentCard key={t.id} t={t} eager={i < 10}
              onToggle={() => bookmarkOnly && setTick((x) => x + 1)} />
          ))}
          {!loading && !err && Array.from({ length: padCount }, (_, i) => (
            <div className="tcard ghost" key={'pad' + i}><span>已到底</span></div>
          ))}
          {appending && Array.from({ length: Math.min(cols, 6) }, (_, i) => (
            <div className="tcard ghost" key={'more' + i} />
          ))}
        </div>
      ) : (
        <div className="tgrid list">
          {loading && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={72} />)}
          {!loading && !err && shown.map((t) => (
            <TorrentRow key={t.id} t={t} onToggle={() => bookmarkOnly && setTick((x) => x + 1)} />
          ))}
        </div>
      )}

      {!loading && !err && pageMeta && loadedTo < pageMeta.last_page && (
        <div ref={sentinelRef} className="scroll-sentinel">
          {appending
            ? <><Icon name="disc" size={15} /> 正在加载第 {loadedTo + 1} 页…</>
            : <><Icon name="chevD" size={15} /> 继续下滑自动加载下一页</>}
        </div>
      )}
      {!loading && !err && !shown.length && (
        <Empty icon={bookmarkOnly ? 'star' : 'search'}
          text={q ? `没有匹配「${q}」的种子` : bookmarkOnly ? '还没有收藏任何种子' : '这个筛选条件下没有种子'}
          hint={bookmarkOnly ? '在种子卡片右上角点星标即可收藏' : '换个关键词或把状态切到「全部」试试'} />
      )}
      {/* 悬浮翻页条固定在视口底部，这里留出同等高度，最后一行不会被挡 */}
      {pageMeta && pageMeta.last_page > 1 && <div className="dock-spacer" />}

      {/* 分页器保留：无限流到第几页就显示第几页，并且可以直接跳到任意页。
          wall 视图用 dock 模式悬浮在视口底部，滚到第几十页也随时能翻。 */}
      {pageMeta && (
        <Pager page={pagerPage} last={pageMeta.last_page} total={pageMeta.total}
          dock
          hint={loadedTo > page ? `已连续加载 ${loadedTo - page + 1} 页` : undefined}
          onChange={goPage} />
      )}
    </>
  );
}
