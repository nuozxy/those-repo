import { initialOf, posterStyle } from '@/lib/format';
import { brandName } from '@/lib/config';
import { posterQuery } from '@/lib/poster';
import { SmartImage } from './SmartImage';

/**
 * 底层始终是生成式封面，真图加载成功后盖在上面；拿不到也不会破图。
 * 传 descr 时，若所有图源都失败，会按片名去第三方补一张海报。
 */
export function Poster({
  name, cover, label, className = '', eager, descr,
}: {
  name: string;
  cover?: string | null;
  label?: string;
  className?: string;
  eager?: boolean;
  /** 副标题：里面有更准的片名，补图时优先用 */
  descr?: string | null;
}) {
  const st = posterStyle(name);
  const q = posterQuery(name, descr);
  return (
    <div className={`poster ${className}`} style={{ background: st.background }}>
      <span className="poster-glow" style={{ background: `radial-gradient(circle at 70% 20%, hsl(${st.hue} 80% 58% / .22), transparent 62%)` }} />
      <span className="poster-letter">{initialOf(name)}</span>
      <span className="poster-mark">{brandName.slice(0, 4).toUpperCase()}</span>
      {label && <span className="poster-label">{label}</span>}
      <SmartImage src={cover} w={320} h={460} className="poster-img" eager={eager} lookup={q} />
    </div>
  );
}
