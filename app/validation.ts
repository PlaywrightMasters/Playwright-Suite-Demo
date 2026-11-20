import {
  CATEGORIES,
  CURRENCIES,
  DENSITIES,
  STATUSES,
  type Category,
  type Currency,
  type Density,
  type ProductStatus,
  type Settings,
} from './store';

export type FieldErrors = Record<string, string>;
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export interface ProductInput {
  sku: string;
  name: string;
  category: Category;
  price: number;
  quantity: number;
  status: ProductStatus;
}

export const SKU_PATTERN = /^[A-Z]{2,4}-\d{3,6}$/;
export const MAX_PRICE = 1_000_000;
export const MAX_QUANTITY = 100_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

type FieldValidator = (value: unknown) => string | undefined;

const PRODUCT_FIELDS: Record<keyof ProductInput, { label: string; check: FieldValidator }> = {
  sku: {
    label: 'SKU',
    check: (v) =>
      typeof v === 'string' && SKU_PATTERN.test(v.trim())
        ? undefined
        : 'SKU must look like SP-1234 (2–4 capital letters, a dash, 3–6 digits)',
  },
  name: {
    label: 'Name',
    check: (v) =>
      typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 80
        ? undefined
        : 'Name must be between 2 and 80 characters',
  },
  category: {
    label: 'Category',
    check: (v) => (includes(CATEGORIES, v) ? undefined : 'Choose a valid category'),
  },
  price: {
    label: 'Price',
    check: (v) =>
      typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_PRICE
        ? 'Price must be between 0 and 1,000,000'
        : hasAtMostTwoDecimals(v)
          ? undefined
          : 'Price can have at most 2 decimal places',
  },
  quantity: {
    label: 'Quantity',
    check: (v) =>
      typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_QUANTITY
        ? undefined
        : 'Quantity must be a whole number between 0 and 100,000',
  },
  status: {
    label: 'Status',
    check: (v) => (includes(STATUSES, v) ? undefined : 'Status must be active or archived'),
  },
};

const PRODUCT_KEYS = Object.keys(PRODUCT_FIELDS) as Array<keyof ProductInput>;

/**
 * Validates a product payload.
 * - `create`: every field except `status` is required (status defaults to active).
 * - `replace`: every field is required (PUT semantics).
 * - `patch`: only provided fields are validated; at least one must be present.
 */
export function validateProduct(
  body: unknown,
  mode: 'create' | 'replace',
): Validation<ProductInput>;
export function validateProduct(body: unknown, mode: 'patch'): Validation<Partial<ProductInput>>;
export function validateProduct(
  body: unknown,
  mode: 'create' | 'replace' | 'patch',
): Validation<Partial<ProductInput>> {
  if (!isRecord(body)) return { ok: false, errors: { body: 'Request body must be a JSON object' } };

  const input: Record<string, unknown> = { ...body };
  if (mode === 'create' && input['status'] === undefined) input['status'] = 'active';

  const errors: FieldErrors = {};
  const value: Record<string, unknown> = {};

  for (const key of PRODUCT_KEYS) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') {
      if (mode !== 'patch') errors[key] = `${PRODUCT_FIELDS[key].label} is required`;
      continue;
    }
    const message = PRODUCT_FIELDS[key].check(raw);
    if (message) errors[key] = message;
    else value[key] = typeof raw === 'string' ? raw.trim() : raw;
  }

  if (mode === 'patch' && Object.keys(value).length === 0 && Object.keys(errors).length === 0) {
    errors['body'] = `Provide at least one of: ${PRODUCT_KEYS.join(', ')}`;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function validateSettings(body: unknown): Validation<Partial<Settings>> {
  if (!isRecord(body)) return { ok: false, errors: { body: 'Request body must be a JSON object' } };

  const errors: FieldErrors = {};
  const value: Partial<Settings> = {};

  if ('lowStockThreshold' in body) {
    const v = body['lowStockThreshold'];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 50)
      value.lowStockThreshold = v;
    else errors['lowStockThreshold'] = 'Low-stock threshold must be a whole number from 0 to 50';
  }
  if ('currency' in body) {
    const v = body['currency'];
    if (includes<Currency>(CURRENCIES, v)) value.currency = v;
    else errors['currency'] = `Currency must be one of ${CURRENCIES.join(', ')}`;
  }
  if ('density' in body) {
    const v = body['density'];
    if (includes<Density>(DENSITIES, v)) value.density = v;
    else errors['density'] = `Density must be one of ${DENSITIES.join(', ')}`;
  }
  for (const key of ['emailAlerts', 'dailyDigest'] as const) {
    if (key in body) {
      const v = body[key];
      if (typeof v === 'boolean') value[key] = v;
      else errors[key] = `${key} must be true or false`;
    }
  }
  if ('categoryOrder' in body) {
    const v = body['categoryOrder'];
    const isPermutation =
      Array.isArray(v) &&
      v.length === CATEGORIES.length &&
      new Set(v).size === CATEGORIES.length &&
      v.every((c) => includes(CATEGORIES, c));
    if (isPermutation) value.categoryOrder = [...v];
    else errors['categoryOrder'] = 'Category order must list every category exactly once';
  }

  if (Object.keys(errors).length === 0 && Object.keys(value).length === 0) {
    errors['body'] = 'Provide at least one setting to update';
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
