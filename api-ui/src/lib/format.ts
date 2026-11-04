export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 从标题生成稳定的封面配色，保证同一个种子每次颜色一致 */
export function posterStyle(seed: string): { background: string; hue: number } {
  const h = hashOf(seed);
  const hue = h % 360;
  const hue2 = (hue + 38 + (h % 40)) % 360;
  return {
    hue,
    background: `linear-gradient(152deg, hsl(${hue} 34% 21%) 0%, hsl(${hue2} 30% 14%) 48%, hsl(${hue} 22% 9%) 100%)`,
  };
}

export function initialOf(name: string): string {
  const s = (name || '').trim();
  return s ? s[0].toUpperCase() : 'T';
}

export function compact(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
}

/** 去掉 BBCode 表情占位符 [em39] 之类的噪声 */
export function cleanText(s: string): string {
  return (s || '').replace(/\[em\d+\]/gi, '').replace(/\[\/?.+?\]/g, '').trim();
}

export function shortDate(s: string | undefined | null): string {
  if (!s) return '—';
  return s.replace(/^\d{4}-/, '').slice(0, 11);
}
