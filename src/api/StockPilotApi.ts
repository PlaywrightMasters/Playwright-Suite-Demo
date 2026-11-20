import { BaseApiClient, type ApiResponse } from './BaseApiClient';
import type {
  ActivityAction,
  ActivityEntry,
  ApiErrorBody,
  LoginResponse,
  Product,
  ProductInput,
  ProductQuery,
  Settings,
  Summary,
} from './types';

type Result<T> = ApiResponse<T & Partial<ApiErrorBody>>;

/** Typed client for every StockPilot endpoint the suite exercises. */
export class StockPilotApi extends BaseApiClient {
  // ── Auth ──────────────────────────────────────────────────────────────────

  health(): Promise<ApiResponse<{ status: string; version: string; uptimeSeconds: number }>> {
    return this.send('GET', '/api/health');
  }

  login(username: string, password: string): Promise<Result<LoginResponse>> {
    return this.send('POST', '/api/auth/login', { data: { username, password } });
  }

  logout(): Promise<ApiResponse<null | ApiErrorBody>> {
    return this.send('POST', '/api/auth/logout', { data: {} });
  }

  me(): Promise<Result<{ username: string; expiresAt: string }>> {
    return this.send('GET', '/api/auth/me');
  }

  // ── Products ──────────────────────────────────────────────────────────────

  listProducts(query: ProductQuery = {}): Promise<ApiResponse<Product[] & Partial<ApiErrorBody>>> {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    ) as Record<string, string>;
    return this.send('GET', '/api/products', { params });
  }

  getProduct(id: number): Promise<Result<Product>> {
    return this.send('GET', `/api/products/${id}`);
  }

  /** Accepts `unknown` on purpose so negative tests can send malformed payloads. */
  createProduct(input: ProductInput | Record<string, unknown>): Promise<Result<Product>> {
    return this.send('POST', '/api/products', { data: input });
  }

  replaceProduct(
    id: number,
    input: ProductInput | Record<string, unknown>,
  ): Promise<Result<Product>> {
    return this.send('PUT', `/api/products/${id}`, { data: input });
  }

  patchProduct(id: number, changes: Record<string, unknown>): Promise<Result<Product>> {
    return this.send('PATCH', `/api/products/${id}`, { data: changes });
  }

  deleteProduct(id: number): Promise<ApiResponse<null | ApiErrorBody>> {
    return this.send('DELETE', `/api/products/${id}`);
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  summary(): Promise<Result<Summary>> {
    return this.send('GET', '/api/reports/summary');
  }

  activity(action?: ActivityAction | (string & {})): Promise<ApiResponse<ActivityEntry[]>> {
    return this.send('GET', '/api/reports/activity', action ? { params: { action } } : {});
  }

  exportCsv(): Promise<ApiResponse<string>> {
    return this.send('GET', '/api/reports/inventory.csv');
  }

  // ── Settings & workspace ──────────────────────────────────────────────────

  getSettings(): Promise<Result<Settings>> {
    return this.send('GET', '/api/settings');
  }

  updateSettings(changes: Partial<Settings> | Record<string, unknown>): Promise<Result<Settings>> {
    return this.send('PUT', '/api/settings', { data: changes });
  }

  resetWorkspace(): Promise<Result<{ ok: boolean }>> {
    return this.send('POST', '/api/workspace/reset', { data: {} });
  }
}
