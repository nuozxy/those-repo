import { useEffect, useState, type ReactNode } from 'react';
import { imageCandidates } from '@/lib/config';
import { posterFallbackUrl } from '@/lib/poster';

/**
 * 外链图片回退：原图直连（防盗链图床直接走代理）→ 自建代理 → 公共代理 → 按片名补图。
 * 图床常拦 Referer 或图已被删，逐级 onError 换 src，绝不留下破图。
 */
export function SmartImage({
  src, alt = '', className, w, h, fallback, eager, lookup,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  /** 传宽高时会让图片代理顺手缩放，列表页加载更快 */
  w?: number;
  h?: number;
  fallback?: ReactNode;
  /** 首屏前几张用 eager，避免懒加载让用户以为图没出来 */
  eager?: boolean;
  /**
   * 片名：所有图片源都失败（或压根没有封面）时，用它去代理查第三方海报补上。
   * 只有封面会传，头像/勋章之类不传就不会多出请求。
   */
  lookup?: string | null;
}) {
  const base = src ? imageCandidates(src, w, h) : [];
  const extra = lookup ? posterFallbackUrl(lookup, w) : '';
  const list = extra ? (base.length ? [...base, extra] : [extra]) : base;
  const key = list.join('|');
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [key]);

  const cur = list[idx];
  if (!cur) return <>{fallback ?? null}</>;
  return (
    <img
      key={cur}
      src={cur}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      /* React 18 还不认驼峰版，写成小写属性透传，省掉一条控制台警告 */
      {...({ fetchpriority: eager ? 'high' : 'auto' } as Record<string, string>)}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
