/**
 * 登录扩展点（预留 / 不属于官方 API）
 *
 * 官方开放 API 没有发放令牌的端点：令牌是用户自己在原站
 * 「控制面板 → 访问令牌」创建的，每个账号都不一样。
 * 所以默认登录方式 = 用户粘贴自己的令牌，前端拿它去 GET /profile 验明身份。
 *
 * 如果以后要「输账号密码登录」，需要一个小后端（与下载器推送同一个服务）：
 *   POST {loginEndpoint}/login   body { username, password }
 *   返回 { ok: true, token: "5|xxxx" } 或 { ok: false, message }
 * 后端可以复用原站的 /web/token/add（需要 web 会话）来创建令牌。
 */
import { settings } from './config';

export interface LoginResult { ok: boolean; token?: string; message?: string }

export function passwordLoginEnabled(): boolean {
  return !!settings().loginEndpoint;
}

export async function passwordLogin(username: string, password: string): Promise<LoginResult> {
  const base = settings().loginEndpoint;
  if (!base) throw new Error('尚未配置账号密码登录服务');
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  let json: LoginResult;
  try { json = JSON.parse(text) as LoginResult; }
  catch { throw new Error(`登录服务返回异常（HTTP ${res.status}）`); }
  if (!json.ok || !json.token) throw new Error(json.message || '账号或密码错误');
  return json;
}

/** 原站控制面板地址（用于「去创建令牌」链接） */
export function siteHome(): string {
  try {
    const u = new URL(settings().apiBase);
    return u.origin;
  } catch { return ''; }
}
export function tokenPage(): string {
  const h = siteHome();
  return h ? `${h}/usercp.php` : '';
}
