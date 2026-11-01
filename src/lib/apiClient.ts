import { safeFetchJson } from './api';

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return path;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const result = await safeFetchJson<T>(url, options);
  if (!result.ok) {
    throw new Error(result.error || `Request failed with status ${result.status}`);
  }
  return result.data as T;
}

export const apiClient = {
  get<T = any>(url: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return request<T>(buildUrl(url, params));
  },

  post<T = any>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T = any>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T = any>(url: string): Promise<T> {
    return request<T>(url, { method: 'DELETE' });
  },
};
