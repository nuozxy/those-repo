/**
 * 收藏：一处加载，全站共用。
 *
 * 注意 /torrents 只覆盖普通分区，特别分区（如蓝光）的收藏只能通过
 * /torrents/{section}?filter[bookmark]=1 单独取，所以 api.bookmarks() 会把
 * 所有分区合并起来。收藏页与每颗星标都读这份结果，避免出现
 * 「分区页点了收藏、收藏页却是空的」。
 */
import { useEffect, useState } from 'react';
import { api, type Torrent } from './api';
import { activeSiteId, getToken } from './config';

interface State {
  ids: Set<number>;
  ready: boolean;
}

let siteId = '';
let list: Torrent[] = [];
let state: State = { ids: new Set(), ready: false };
let inflight: Promise<Torrent[]> | null = null;
let loadedAt = 0;
const TTL = 60_000;
const listeners = new Set<(s: State) => void>();

function emit() {
  state = { ids: new Set(state.ids), ready: state.ready };
  listeners.forEach((l) => l(state));
}

function reset(sid: string) {
  siteId = sid;
  list = [];
  state = { ids: new Set(), ready: false };
  inflight = null;
  loadedAt = 0;
  emit();
}

/** 拉取当前站点的全部收藏；60 秒内复用，force 可强制刷新 */
export async function loadBookmarks(force = false): Promise<Torrent[]> {
  const sid = activeSiteId();
  if (sid !== siteId) reset(sid);
  if (!getToken(sid)) {
    state = { ids: new Set(), ready: true };
    emit();
    return [];
  }
  if (inflight && !force) return inflight;
  if (!force && state.ready && Date.now() - loadedAt < TTL) return list;

  inflight = (async () => {
    try {
      list = await api.bookmarks(sid);
    } catch {
      list = [];
    }
    if (sid !== siteId) return list;
    state = { ids: new Set(list.map((t) => t.id)), ready: true };
    loadedAt = Date.now();
    emit();
    return list;
  })().finally(() => { inflight = null; });

  return inflight;
}

export function useBookmarks() {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    listeners.add(setS);
    void loadBookmarks();
    return () => { listeners.delete(setS); };
  }, []);
  return {
    ready: s.ready,
    has: (id: number) => s.ids.has(id),
  };
}

/**
 * 收藏 / 取消收藏。上游对「已经收藏 / 本来就没收藏」会返回 ret=-1，
 * 那不算失败，按目标状态处理即可。
 */
export async function setBookmark(id: number, next: boolean): Promise<void> {
  try {
    if (next) await api.bookmarkAdd(id);
    else await api.bookmarkRemove(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const okState = next ? /已经收藏/.test(msg) : /未收藏|没有收藏|不存在/.test(msg);
    if (!okState) throw e;
  }
  if (next) state.ids.add(id);
  else {
    state.ids.delete(id);
    list = list.filter((t) => t.id !== id);
  }
  loadedAt = 0; // 下一次进收藏页重新拉，顺序与内容都以服务端为准
  emit();
}
