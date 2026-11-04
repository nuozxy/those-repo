/**
 * 下载器推送（预留扩展点 / 不属于官方 API）
 *
 * 官方开放 API 只有「下载种子」的签名直链 download_url，没有推送到
 * Transmission / qBittorrent 的能力。这块以后由一个小后端服务承担，
 * 前端只负责在配置好 pushEndpoint 后显示按钮，并把签名直链交给它。
 *
 * 约定：POST {pushEndpoint}/push
 *   body: { torrentId, name, downloadUrl, target? }
 *   返回: { ok: boolean, downloader?: string, message: string }
 *
 * 后端要做的事：
 *   1. 用 downloadUrl 取回 .torrent 字节（该链接自带 JWT 签名，无需 Authorization）
 *   2. Transmission → JSON-RPC `torrent-add`，参数 metainfo = base64(字节)
 *      qBittorrent   → `POST /api/v2/torrents/add`，multipart 里放 torrents 文件
 *   3. 把下载器的结果与名称回传
 *
 * 为什么必须走后端：下载器 API 不给浏览器 CORS，且 Transmission 需要 base64，
 * 浏览器无法直接完成。
 */
import { settings } from './config';

export interface PushResult {
  ok: boolean;
  downloader?: string;
  message: string;
}

export function pushEnabled(): boolean {
  return !!settings().pushEndpoint;
}

export async function pushToDownloader(args: {
  torrentId: number;
  name: string;
  downloadUrl: string;
  target?: string;
}): Promise<PushResult> {
  const base = settings().pushEndpoint;
  if (!base) throw new Error('尚未配置下载器推送服务');
  const res = await fetch(`${base}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json: PushResult;
  try { json = JSON.parse(text) as PushResult; }
  catch { throw new Error(`推送服务返回异常（HTTP ${res.status}）`); }
  if (!res.ok && !json.ok) throw new Error(json.message || `推送失败（HTTP ${res.status}）`);
  return json;
}
