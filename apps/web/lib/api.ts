// Thin client for the ToD API. Requests go through Next's /api rewrite, so the
// httpOnly session cookie travels with them.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function api<T = any>(path: string, opts: { method?: Method; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.form ? undefined : { 'Content-Type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(' ') : data?.message ?? res.statusText;
    throw new ApiError(res.status, data?.code ?? String(res.status), msg);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: 'POST', body });
export const put = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: 'PUT', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

export async function upload(file: File, purpose: 'PORTFOLIO' | 'DELIVERY' | 'MESSAGE' | 'EVIDENCE' | 'TICKET' | 'PHOTO') {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);
  return api<{ id: string; name: string }>('/files', { method: 'POST', form });
}
