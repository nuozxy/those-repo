import { useState } from 'react';
import { Icon } from './Icon';

export function Pager({ page, last, total, onChange, hint, dock }: {
  page: number;
  last: number;
  total: number;
  onChange: (p: number) => void;
  /** 附加说明，例如「已连续加载 10 页」 */
  hint?: string;
  /**
   * 无限流模式：固定在视口底部的悬浮翻页条。
   * 瀑布流会一直往下追加卡片，页面底部的分页器永远够不着，所以改成常驻悬浮。
   */
  dock?: boolean;
}) {
  const [jump, setJump] = useState('');
  const [folded, setFolded] = useState(false);

  function submitJump(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jump.trim());
    if (!Number.isFinite(n)) return;
    const p = Math.min(last, Math.max(1, Math.floor(n)));
    setJump('');
    if (p !== page) onChange(p);
  }

  if (last <= 1 && !hint) return null;
  const cur = Math.min(Math.max(page, 1), last);

  /* 收起状态：只留一枚小胶囊，显示当前页，点开还原 */
  if (dock && folded) {
    return (
      <button type="button" className="pager-mini" onClick={() => setFolded(false)}
        title="展开翻页条" aria-label="展开翻页条">
        <Icon name="stack" size={13} />
        <b>{cur}</b>
        <span>/ {last}</span>
      </button>
    );
  }

  const win: (number | '…')[] = [];
  const from = Math.max(1, cur - 2), to = Math.min(last, cur + 2);
  if (from > 1) { win.push(1); if (from > 2) win.push('…'); }
  for (let i = from; i <= to; i++) win.push(i);
  if (to < last) { if (to < last - 1) win.push('…'); win.push(last); }

  return (
    <div className={`pager${dock ? ' dock' : ''}`}>
      <span className="pager-total">
        共 {total.toLocaleString()} 条 · 第 {cur}/{last} 页{hint ? ` · ${hint}` : ''}
      </span>
      <div className="pager-btns">
        <button className="pbtn" disabled={cur <= 1} onClick={() => onChange(cur - 1)} aria-label="上一页">
          <Icon name="chevL" size={15} />
        </button>
        {win.map((p, i) => p === '…'
          ? <span className="pdots" key={'d' + i}>…</span>
          : <button key={p} className={`pbtn ${p === cur ? 'on' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
        <button className="pbtn" disabled={cur >= last} onClick={() => onChange(cur + 1)} aria-label="下一页">
          <Icon name="chevR" size={15} />
        </button>
      </div>
      {/* 无限流滚到很多页后，直接跳到任意页，不用一直往下滚 */}
      <form className="pager-jump" onSubmit={submitJump}>
        <span>跳至</span>
        <input
          value={jump}
          onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder={String(cur)}
          aria-label="跳转到页码"
        />
        <span>页</span>
        <button className="btn sm ghost" type="submit">跳转</button>
      </form>
      {dock && (
        <button type="button" className="pager-fold" onClick={() => setFolded(true)}
          title="收起翻页条" aria-label="收起翻页条">
          <Icon name="chevD" size={14} />
        </button>
      )}
    </div>
  );
}
