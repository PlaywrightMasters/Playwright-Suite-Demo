import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResponse<T> {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body, raw text for non-JSON responses, or null when empty (e.g. 204). */
  body: T;
}

type RequestOptions = {
  data?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
};

/**
 * Thin typed wrapper over Playwright's APIRequestContext.
 * Paths are relative, so `use.baseURL` from playwright.config.ts decides the host.
 */
export class BaseApiClient {
  constructor(
    protected readonly request: APIRequestContext,
    private token?: string,
  ) {}

  setToken(token: string | undefined): void {
    this.token = token;
  }

  protected async send<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await this.request.fetch(path, {
      method,
      headers,
      params: options.params,
      // Passing an object makes Playwright serialise it and set Content-Type: application/json.
      data: options.data,
      failOnStatusCode: false,
    });
    return {
      status: response.status(),
      headers: response.headers(),
      body: (await parseBody(response)) as T,
    };
  }
}

async function parseBody(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers()['content-type'] ?? '';
  return contentType.includes('application/json') ? (JSON.parse(text) as unknown) : text;
}
