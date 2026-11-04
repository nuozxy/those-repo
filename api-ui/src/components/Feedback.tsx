import { Icon } from './Icon';

export function Skeleton({ h = 16, w = '100%', r = 7 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}

export function CardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="tgrid">
      {Array.from({ length: count }, (_, i) => (
        <div className="tcard" key={i}>
          <Skeleton h={210} r={12} />
          <div className="tcard-b">
            <Skeleton h={15} w="92%" />
            <Skeleton h={12} w="65%" />
            <Skeleton h={12} w="45%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="state state-err">
      <div className="state-ico"><Icon name="alert" size={24} /></div>
      <div className="state-t">加载失败</div>
      <p>{text}</p>
      <div className="state-hint">常见原因：令牌失效、API 地址不对、上游限流（60 次/分钟）</div>
      {onRetry && <button className="btn" onClick={onRetry}><Icon name="refresh" size={15} /> 重试</button>}
    </div>
  );
}

export function Empty({ icon = 'info', text, hint }: { icon?: string; text: string; hint?: string }) {
  return (
    <div className="state">
      <div className="state-ico"><Icon name={icon} size={24} /></div>
      <div className="state-t">{text}</div>
      {hint && <p>{hint}</p>}
    </div>
  );
}
