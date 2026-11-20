import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_MS, getSession } from './store';

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** API clients send a Bearer token; the browser app relies on the HttpOnly cookie. */
export function readSessionToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;
  return parseCookies(req.get('cookie'))[SESSION_COOKIE];
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const session = getSession(readSessionToken(req));
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  res.locals['session'] = session;
  next();
}

/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNextPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return undefined;
  // Resolve with the WHATWG URL parser (as browsers do) against a placeholder origin:
  // anything that escapes it, e.g. "//evil", "/\\evil" or "/\t/evil", is rejected.
  const base = 'http://stockpilot.invalid';
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base || url.pathname.startsWith('/login')) return undefined;
  return url.pathname + url.search + url.hash;
}
