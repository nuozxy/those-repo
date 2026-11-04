/**
 * 分区列表 hook：按站点缓存，顶栏导航和片库页共用同一份数据。
 *
 * - 每个站点一个缓存键，站点切换时立刻换成该站的缓存，不会串站；
 * - 内存 + localStorage 双缓存：刷新后导航不闪回默认文案；
 * - 多个组件同时挂载（Shell / Browse / Upload）只发一次请求。
 */
import { useEffect, useState } from 'react';
import { api, type Section } from './api';
import { activeSiteId } from './config';

const mem = new Map<string, Section[]>();
const EVENT = 'tey:sections';
const inflight = new Map<string, Promise<Section[]>>();
const keyOf = (id: string) => `tey.sections.${id}`;

function cached(id: string): Section[] {
  if (mem.has(id)) return mem.get(id)!;
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (raw) {
      const arr = JSON.parse(raw) as Section[];
      if (Array.isArray(arr)) {
        mem.set(id, arr);
        return arr;
      }
    }
  } catch { /* ignore */ }
  return [];
}

function load(id: string): Promise<Section[]> {
  const running = inflight.get(id);
  if (running) return running;
  const p = api.sections(id)
    .then((list) => {
      const arr = (list || []).filter((s) => s && s.name);
      mem.set(id, arr);
      try { localStorage.setItem(keyOf(id), JSON.stringify(arr)); } catch { /* ignore */ }
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
      return arr;
    })
    .catch(() => cached(id))
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** 清掉某个站点的分区缓存（改了 API 地址或退出登录后调用） */
export function clearSections(siteId?: string) {
  const id = siteId || activeSiteId();
  mem.delete(id);
  try { localStorage.removeItem(keyOf(id)); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function sectionLabel(s: Section): string {
  return (s.display_name || s.name || '').trim() || s.name;
}

export function useSections(): { sections: Section[]; loading: boolean } {
  const siteId = activeSiteId();
  const [sections, setSections] = useState<Section[]>(() => cached(siteId));
  const [loading, setLoading] = useState(() => cached(siteId).length === 0);

  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setSections(cached(siteId)); };
    if (typeof window !== 'undefined') window.addEventListener(EVENT, sync);
    const c = cached(siteId);
    if (c.length) {
      setSections(c);
      setLoading(false);
    } else {
      setLoading(true);
      load(siteId).then((arr) => { if (alive) { setSections(arr); setLoading(false); } });
    }
    return () => { alive = false; if (typeof window !== 'undefined') window.removeEventListener(EVENT, sync); };
  }, [siteId]);

  return { sections, loading };
}
