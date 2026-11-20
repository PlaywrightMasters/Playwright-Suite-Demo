import { randomInt } from 'node:crypto';
import type { Category, ProductInput } from '../api/types';

export const CREDENTIALS = {
  username: process.env['APP_USERNAME'] ?? 'admin',
  password: process.env['APP_PASSWORD'] ?? 'stockpilot123',
} as const;

export const CATEGORIES: readonly Category[] = [
  'Electronics',
  'Furniture',
  'Office Supplies',
  'Apparel',
];

/** Sample data every new workspace starts with (mirrors app/store.ts seed). */
export const SEED = {
  totalProducts: 8,
  activeProducts: 7,
  archivedProducts: 1,
  totalUnits: 839,
  inventoryValue: 13709.8,
  lowStockCount: 2,
  outOfStockCount: 1,
  lowStockThreshold: 10,
  products: {
    mouse: { sku: 'SP-1001', name: 'Wireless Mouse', price: 24.99, quantity: 120 },
    keyboard: { sku: 'SP-1002', name: 'Mechanical Keyboard', price: 89, quantity: 8 },
    monitor: { sku: 'SP-1003', name: '27" 4K Monitor', price: 329, quantity: 0 },
    chair: { sku: 'SP-2001', name: 'Ergonomic Office Chair', price: 249, quantity: 15 },
    desk: { sku: 'SP-2002', name: 'Standing Desk', price: 499, quantity: 4 },
    notebook: { sku: 'SP-3001', name: 'Recycled Notebook (A5)', price: 3.5, quantity: 640 },
    pens: { sku: 'SP-3002', name: 'Gel Pens, 12-pack', price: 7.25, quantity: 0 },
    hoodie: { sku: 'SP-4001', name: 'Team Hoodie', price: 39, quantity: 52 },
  },
  productsByCategory: {
    Electronics: 3,
    Furniture: 2,
    'Office Supplies': 2,
    Apparel: 1,
  } satisfies Record<Category, number>,
} as const;

/** A SKU that cannot collide with seed data (seed SKUs all start with SP-). */
export function uniqueSku(prefix = 'QA'): string {
  return `${prefix}-${randomInt(100_000, 1_000_000)}`;
}

/** Builds a valid product payload; override only what the test cares about. */
export function buildProduct(overrides: Partial<ProductInput> = {}): ProductInput {
  const sku = overrides.sku ?? uniqueSku();
  return {
    sku,
    name: `QA Product ${sku}`,
    category: 'Electronics',
    price: 19.99,
    quantity: 42,
    status: 'active',
    ...overrides,
  };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
