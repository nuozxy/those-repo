/**
 * NexusPHP 官方开放 API 客户端。
 *
 * 这里出现的每一个方法都对应 Apifox 文档里的一个端点，没有第二数据来源：
 *   GET  /torrents                种子列表
 *   GET  /torrents/{section}      特别分区种子列表
 *   GET  /detail/{id}             种子详情
 *   GET  /comments                种子评论列表
 *   GET  /sections                分区列表（发布页选项）
 *   GET  /profile                 当前用户详情
 *   GET  /profile/{id}           其他用户详情
 *   POST /upload                  发布种子
 *   POST /bookmarks               新增收藏
 *   POST /bookmarks/delete        删除收藏
 *
 * 上游原生支持 CORS，浏览器直连，不需要任何 BFF / 会话 / cookie。
 */
import { settings } from './config';

/* ---------------- 统一响应 ---------------- */
export interface Envelope<T> {
  ret: number;
  msg: string;
  data?: { data: T } & PagedExtras;
  time: number;
  rid: string;
}
export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}
export interface PageLinks {
  first: string | null;
  last: string | null;
  prev: string | null;
  next: string | null;
}
export interface PagedExtras {
  meta?: PageMeta;
  links?: PageLinks;
  [k: string]: unknown;
}
export interface Paged<T> {
  items: T[];
  meta?: PageMeta;
  links?: PageLinks;
  extra?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(message: string, public ret: number, public status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

/* ---------------- 数据模型 ---------------- */
export interface Tag {
  id: number;
  name: string;
  color: string;
  font_color?: string;
  font_size?: string;
  padding?: string;
  margin?: string;
  border_radius?: string;
  priority?: number;
}
export interface UserBrief {
  id: number;
  username: string;
  email?: string;
  status?: string;
  enabled?: string;
  added?: string;
  added_human?: string;
  last_access?: string;
  last_access_human?: string;
  last_login?: string;
  last_login_human?: string;
  class?: number;
  class_text?: string;
  avatar?: string;
  invites?: number;
  attendance_card?: number;
  uploaded?: number;
  uploaded_text?: string;
  downloaded?: number;
  downloaded_text?: string;
  bonus?: number;
  bonus_human?: string;
  seed_points?: number;
  seed_points_human?: string;
  seedtime?: number;
  seedtime_text?: string;
  leechtime?: number;
  leechtime_text?: string;
  share_ratio?: string | number | null;
  seed_points_per_hour?: number;
  seed_points_per_hour_human?: string;
  seed_bonus_per_hour?: number;
  seed_bonus_per_hour_human?: string;
  inviter?: UserBrief | null;
  valid_medals?: Medal[];
  seeding_leeching_data?: unknown;
}
export interface Medal {
  id: number;
  name: string;
  get_type?: string;
  get_type_text?: string;
  image_large?: string;
  image_small?: string;
  price?: number;
  price_human?: string;
  duration?: number;
  expire_at?: string | null;
  wearing_status?: number;
  wearing_status_text?: string;
}
export interface PromotionInfo {
  text: string;
  up_multiplier: number;
  down_multiplier: number;
  color: string;
}
export interface DescBlock {
  type: string;
  data: Record<string, unknown>;
}
export interface Torrent {
  id: number;
  name: string;
  filename: string;
  hash: string;
  cover: string | null;
  small_descr: string | null;
  category: number;
  category_info?: { id: number; name: string };
  size: number;
  size_human: string;
  added: string;
  added_human: string;
  numfiles: number;
  leechers: number;
  seeders: number;
  times_completed: number;
  views: number;
  hits: number;
  comments: number;
  pos_state: string;
  pos_state_until?: string | null;
  pos_state_until_human?: string | null;
  sp_state: number;
  sp_state_real: number;
  promotion_info?: PromotionInfo | null;  hr: number;
  pick_type: string;
  pick_time?: string | null;
  pick_info?: { text: string; color: string } | null;
  anonymous: string;
  last_action: string;
  last_action_human: string;
  sub_categories?: Record<string, { label: string; value: string }>;
  tags?: Tag[];
  user?: UserBrief;
  extra?: { descr?: string; media_info?: string; media_info_summary?: string; nfo?: string; [k: string]: unknown };
  description?: DescBlock[] | null;
  images?: string[];
  download_url?: string;
  has_bookmarked?: boolean;
  has_thanked?: boolean;
  has_rewarded?: boolean;
  has_claimed?: boolean;
  active_status?: string | null;
  thank_users_count?: number;
  reward_logs_count?: number;
  claims_count?: number;
}
export interface Comment {
  id: number;
  text: string;
  created_at: string;
  updated_at: string | null;
  create_user?: UserBrief;
  update_user?: UserBrief | null;
}
export interface Section {
  id: number;
  name: string;
  display_name: string;
  categories: { id: number; name: string }[];
  sub_categories: { field: string; label: string; data: { id: number; name: string }[] }[];
  tags: Tag[];
}

/* ---------------- 请求内核 ---------------- */
type Params = Record<string, string | number | boolean | undefined | null>;

function query(params: Params): string {
  const out: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    // 键保持原样（含 filter[xxx] / include_fields[torrent] 的方括号），只编码值
    out.push(`${k}=${encodeURIComponent(String(v))}`);
  });
  return out.length ? '?' + out.join('&') : '';
}

async function request<T>(
  path: string,
  opts: { params?: Params; method?: 'GET' | 'POST'; body?: FormData | BodyInit; siteId?: string } = {},
): Promise<{ data: T; extra?: Record<string, unknown> }> {
  // siteId 只给「站点总览」用：并发请求多个站点时互不串台
  const cfg = settings(opts.siteId);
  const url = cfg.apiBase + path + query(opts.params ?? {});
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body,
      credentials: 'omit',
      mode: 'cors',
    });
  } catch (e) {
    throw new ApiError('无法连接 API，请检查地址与网络（或跨域配置）', -1);
  }

  const raw = await res.text();
  let json: Envelope<T>;
  try {
    json = JSON.parse(raw) as Envelope<T>;
  } catch {
    throw new ApiError(
      res.status === 401 ? '令牌无效或已过期' : `API 返回了非 JSON 内容（HTTP ${res.status}）`,
      -2,
      res.status,
    );
  }
  if (json.ret !== 0 || !json.data) {
    const msg = json.msg || (res.status === 401 ? '令牌无效或已过期' : `请求失败（HTTP ${res.status}）`);
    throw new ApiError(msg, json.ret ?? -3, res.status);
  }
  const { data, ...extra } = json.data as { data: T } & PagedExtras;
  return { data, extra: extra as Record<string, unknown> };
}

function toPaged<T>(r: { data: T[]; extra?: Record<string, unknown> }): Paged<T> {
  const e = r.extra ?? {};
  return {
    items: r.data ?? [],
    meta: e.meta as PageMeta | undefined,
    links: e.links as PageLinks | undefined,
    extra: e,
  };
}

/* ---------------- 列表参数 ---------------- */
export interface TorrentQuery {
  page?: number;
  perPage?: number;
  section?: string;
  title?: string;
  category?: number;
  sorts?: string;
  visible?: number | '';
  bookmark?: 1 | 2 | '';
  sizeGt?: number;
}

export const api = {
  /** GET /torrents 或 GET /torrents/{section} */
  async torrents(q: TorrentQuery, siteId?: string): Promise<Paged<Torrent>> {
    const p: Params = {
      page: q.page || 1,
      per_page: q.perPage || 24,
      sorts: q.sorts || '-id',
      'filter[visible]': q.visible === '' ? undefined : (q.visible ?? undefined),
      'filter[title]': q.title || undefined,
      'filter[category]': q.category || undefined,
      'filter[bookmark]': q.bookmark || undefined,
      'filter[size][gt]': q.sizeGt || undefined,
      // 不传 includes：特别分区带 includes=extra 会触发上游 500（原站自身问题），
      // 列表页只需要下面的扩展字段，user/extra 由详情接口单独取。
      'include_fields[torrent]': 'has_bookmarked,active_status,download_url',
    };
    const path = q.section ? `/torrents/${encodeURIComponent(q.section)}` : '/torrents';
    return toPaged<Torrent>(await request<Torrent[]>(path, { params: p, siteId }));
  },

  /**
   * 全部收藏。GET /torrents 只覆盖普通分区，特别分区（如蓝光）要按分区取
   * /torrents/{section}?filter[bookmark]=1，这里合并所有分区并去重。
   */
  async bookmarks(siteId?: string): Promise<Torrent[]> {
    const sections = await this.sections(siteId).catch(() => [] as Section[]);
    const targets: (string | undefined)[] = [undefined, ...sections.map((s) => s.name)];
    const all: Torrent[] = [];
    await Promise.all(targets.map(async (section) => {
      let page = 1;
      let last = 1;
      do {
        const r = await this.torrents(
          { page, perPage: 100, section, bookmark: 1, visible: 0, sorts: '-id' },
          siteId,
        ).catch(() => null);
        if (!r) break;
        all.push(...(r.items || []));
        last = r.meta?.last_page ?? 1;
        page += 1;
      } while (page <= last && page <= 5);
    }));
    const map = new Map<number, Torrent>();
    all.forEach((t) => map.set(t.id, t));
    return [...map.values()].sort((a, b) => b.id - a.id);
  },

  /** GET /detail/{id} */
  async detail(id: number): Promise<Torrent> {
    const r = await request<Torrent>(`/detail/${id}`, {
      params: {
        includes: 'user,tags,extra',
        include_counts: 'claims,thank_users,reward_logs',
        'include_fields[torrent]': 'description,download_url,has_bookmarked,has_thanked,has_rewarded,has_claimed,active_status',
        extra_fields: 'bonus_reward_values',
      },
    });
    return r.data;
  },

  /** GET /comments */
  async comments(torrentId: number): Promise<Paged<Comment>> {
    return toPaged<Comment>(
      await request<Comment[]>('/comments', { params: { torrent_id: torrentId, per_page: 100 } }),
    );
  },

  /** GET /sections —— 分区名按站点各自取，导航与片库标题都用它，不写死 */
  async sections(siteId?: string): Promise<Section[]> {
    return (await request<Section[]>('/sections', { siteId })).data;
  },

  /** GET /profile 或 GET /profile/{id} */
  async profile(id?: number, siteId?: string): Promise<UserBrief> {
    const r = await request<UserBrief>(id ? `/profile/${id}` : '/profile', {
      params: {
        includes: 'inviter,valid_medals',
        'include_fields[user]': 'seeding_leeching_data',
      },
      siteId,
    });
    return r.data;
  },

  /** POST /upload —— 唯一会写入种子库的接口 */
  async upload(form: FormData): Promise<{ id: number }> {
    return (await request<{ id: number }>('/upload', { method: 'POST', body: form })).data;
  },

  /** POST /bookmarks */
  async bookmarkAdd(torrentId: number): Promise<void> {
    const f = new FormData();
    f.append('torrent_id', String(torrentId));
    await request<unknown>('/bookmarks', { method: 'POST', body: f });
  },

  /** POST /bookmarks/delete */
  async bookmarkRemove(torrentId: number): Promise<void> {
    const f = new FormData();
    f.append('torrent_id', String(torrentId));
    await request<unknown>('/bookmarks/delete', { method: 'POST', body: f });
  },
};

export const SORTS = [
  { v: '-id', label: '最新发布' },
  { v: 'id', label: '最早发布' },
  { v: '-seeders', label: '做种最多' },
  { v: '-leechers', label: '下载最多' },
  { v: '-times_completed', label: '完成最多' },
  { v: '-comments', label: '评论最多' },
  { v: '-size', label: '体积最大' },
  { v: 'size', label: '体积最小' },
];
