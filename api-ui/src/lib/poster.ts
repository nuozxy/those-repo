/**
 * 封面兜底：站内 cover 指到的图床挂掉 / 图被删时，按片名去第三方（豆瓣）找一张。
 *
 * 为什么放在代理端做：豆瓣搜索建议接口 movie.douban.com/j/subject_suggest
 * 不带 CORS 头，浏览器直连拿不到；而且豆瓣图床要特定的 Referer。
 * 前端只负责把「片名」拼进代理地址，取图与缓存由代理完成：
 *   {coverProxy}{?|&}q=片名
 * 代理返回图就直接用，返回 404 时浏览器触发 onError，卡片回落到生成式封面。
 */
import { getImageMode, settings } from './config';

/** 技术参数：命中就往回截断，这些词后面基本都是规格而不是片名 */
const TECH = new RegExp(
  [
    '(\\d{3,4}[pi]|4k|8k|uhd)',
    '(blu-?ray|bdrip|brrip|bdmv|remux|web-?dl|webrip|web|hdtv|dvdrip|dvd)',
    '(hevc|avc|x264|x265|h\\.?26[45]|10bit|8bit|hdr(?:10)?|dolby|atmos|dts(?:-?hd)?|truehd|aac|ac3|ddp|dd|flac|mp3)',
    '([257]\\.1|2\\.0|5\\.1)',
    '(nvenc|hq|hdr|sdr|complete|repack|proper|internal)',
  ].join('|'),
  'i',
);

const SEP = /[\/|｜丨]+/;

/** 「类型：动作 / 主演：…」这类字段段不是片名 */
const LABEL = /^(类型|类别|主演|演员|导演|编剧|地区|国家|语言|集数|片长|别名|简介|标签|分辨率|字幕|格式|音轨)\s*[:：]/;

/** 副标题里常带的口语标签：「韩剧 xxx 全123集」 */
const KIND = /^(韩剧|日剧|美剧|英剧|国产剧|港剧|台剧|泰剧|动漫|动画|纪录片|综艺|电影|剧集)\s*[:：]?\s*/;
const TAIL = /[*＊]?\s*(全\s*\d+\s*[集话話]|第\s*\d+\s*[集话話]|更新至?\s*\d+\s*[集话話]?|全\s*\d+\s*季).*$/;

function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 48) return false;
  if (/^\d+$/.test(t)) return false;
  return !TECH.test(t);
}

/** 去掉方括号内容、把分隔符统一成空格 */
function clean(s: string): string {
  return s
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 副标题里的单段清洗：去掉「韩剧 / 全123集 / *第一季*」这类包装 */
function tidy(seg: string): string {
  return clean(seg)
    .replace(KIND, '')
    .replace(TAIL, '')
    .replace(/^[*＊\s]+|[*＊\s]+$/g, '')
    .trim();
}

/** 从种子名里剥出片名：截到年份或第一个技术参数之前 */
function fromName(name: string): string {
  let s = clean(name || '');
  if (!s) return '';
  const year = s.search(/\b(19|20)\d{2}\b/);
  if (year > 0) s = s.slice(0, year);
  const tech = s.search(TECH);
  if (tech > 0) s = s.slice(0, tech);
  // 季标记留在查询词里会降低命中率（S01 / S2 / Season 3）
  s = s.replace(/\bseason\s*\d{1,2}\b/gi, ' ').replace(/\bs\d{1,2}\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').replace(/[-–—:：\s]+$/, '').trim();
  return s.length >= 2 ? s : '';
}

/**
 * 查询词：优先副标题里的中文/原文片名，其次从主标题剥规格。
 * 副标题形如「韩国制造 / Made in Korea Season 2 / 메이드 인 코리아2 | 全6集 | 1080p」，
 * 第一段通常就是最准的片名。
 */
export function posterQuery(name: string, descr?: string | null): string {
  const segs = (descr || '')
    .split(SEP)
    .map(tidy)
    .filter((x) => x && !LABEL.test(x) && looksLikeName(x));

  // 1) 优先中文片名：豆瓣库里中文名命中率最高
  const cn = segs.find((x) => /[\u4e00-\u9fa5]/.test(x));
  if (cn) return cn;

  // 2) 日韩原名，豆瓣也有收录
  const cjk = segs.find((x) => /[\u3040-\u30ff\uac00-\ud7af]/.test(x));
  if (cjk) return cjk;

  // 3) 英文原名
  const latin = segs.find((x) => /[a-z]/i.test(x));
  if (latin) return latin;

  // 4) 退回主标题：剥掉年份与规格
  return fromName(name);
}

/**
 * 代理端的补图地址；没配 coverProxy、或配的是公共缩放代理（不支持 q）时返回空串。
 * 前端拿不到地址就不发请求，行为与现在完全一致。
 */
export function posterFallbackUrl(query: string, w?: number): string {
  const q = (query || '').trim();
  if (!q) return '';
  if (getImageMode() === 'off') return '';
  const p = settings().coverProxy;
  if (!p) return '';
  // weserv 只做缩放，不认 q
  if (p.includes('weserv.nl')) return '';
  const sep = p.includes('?') ? '&' : '?';
  return `${p}${sep}q=${encodeURIComponent(q)}${w ? `&w=${w}` : ''}`;
}
