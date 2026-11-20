import { randomUUID } from 'node:crypto';

// ── Domain types ────────────────────────────────────────────────────────────

export const CATEGORIES = ['Electronics', 'Furniture', 'Office Supplies', 'Apparel'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['active', 'archived'] as const;
export type ProductStatus = (typeof STATUSES)[number];

export const CURRENCIES = ['USD', 'EUR', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: Category;
  price: number;
  quantity: number;
  status: ProductStatus;
  updatedAt: string;
}

export type ActivityAction = 'create' | 'update' | 'delete' | 'status' | 'settings' | 'reset';

export interface ActivityEntry {
  id: number;
  action: ActivityAction;
  message: string;
  actor: string;
  timestamp: string;
}

export interface Settings {
  lowStockThreshold: number;
  currency: Currency;
  density: Density;
  emailAlerts: boolean;
  dailyDigest: boolean;
  categoryOrder: Category[];
}

/**
 * Every signed-in session gets its own sandbox workspace seeded with sample
 * data. Sessions never share state, so tests can run fully parallel across
 * browsers and workers without cleanup code or ordering assumptions.
 */
export interface Workspace {
  products: Product[];
  activity: ActivityEntry[];
  settings: Settings;
  nextProductId: number;
  nextActivityId: number;
}

export interface Session {
  token: string;
  username: string;
  workspace: Workspace;
  expiresAt: number;
}

// ── Seed data ───────────────────────────────────────────────────────────────

const SEED_PRODUCTS: ReadonlyArray<Omit<Product, 'id' | 'updatedAt'>> = [
  {
    sku: 'SP-1001',
    name: 'Wireless Mouse',
    category: 'Electronics',
    price: 24.99,
    quantity: 120,
    status: 'active',
  },
  {
    sku: 'SP-1002',
    name: 'Mechanical Keyboard',
    category: 'Electronics',
    price: 89,
    quantity: 8,
    status: 'active',
  },
  {
    sku: 'SP-1003',
    name: '27" 4K Monitor',
    category: 'Electronics',
    price: 329,
    quantity: 0,
    status: 'active',
  },
  {
    sku: 'SP-2001',
    name: 'Ergonomic Office Chair',
    category: 'Furniture',
    price: 249,
    quantity: 15,
    status: 'active',
  },
  {
    sku: 'SP-2002',
    name: 'Standing Desk',
    category: 'Furniture',
    price: 499,
    quantity: 4,
    status: 'active',
  },
  {
    sku: 'SP-3001',
    name: 'Recycled Notebook (A5)',
    category: 'Office Supplies',
    price: 3.5,
    quantity: 640,
    status: 'active',
  },
  {
    sku: 'SP-3002',
    name: 'Gel Pens, 12-pack',
    category: 'Office Supplies',
    price: 7.25,
    quantity: 0,
    status: 'archived',
  },
  {
    sku: 'SP-4001',
    name: 'Team Hoodie',
    category: 'Apparel',
    price: 39,
    quantity: 52,
    status: 'active',
  },
];

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  lowStockThreshold: 10,
  currency: 'USD',
  density: 'comfortable',
  emailAlerts: true,
  dailyDigest: false,
  categoryOrder: [...CATEGORIES],
});

export function createWorkspace(): Workspace {
  const now = new Date().toISOString();
  return {
    products: SEED_PRODUCTS.map((p, i) => ({ id: i + 1, ...p, updatedAt: now })),
    activity: [],
    settings: { ...DEFAULT_SETTINGS, categoryOrder: [...DEFAULT_SETTINGS.categoryOrder] },
    nextProductId: SEED_PRODUCTS.length + 1,
    nextActivityId: 1,
  };
}

export function resetWorkspace(workspace: Workspace): void {
  Object.assign(workspace, createWorkspace());
}

export function logActivity(
  workspace: Workspace,
  action: ActivityAction,
  message: string,
  actor: string,
): ActivityEntry {
  const entry: ActivityEntry = {
    id: workspace.nextActivityId++,
    action,
    message,
    actor,
    timestamp: new Date().toISOString(),
  };
  workspace.activity.unshift(entry);
  workspace.activity.length = Math.min(workspace.activity.length, 200);
  return entry;
}

// ── Stock rules ─────────────────────────────────────────────────────────────

export type StockLevel = 'in' | 'low' | 'out';

/** Zero units is "out"; anything at or below the threshold is "low". */
export function stockLevel(quantity: number, threshold: number): StockLevel {
  if (quantity === 0) return 'out';
  if (quantity <= threshold) return 'low';
  return 'in';
}

export const STOCK_LABELS: Record<StockLevel, string> = {
  in: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

// ── Sessions ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'sp_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 2000;

const sessions = new Map<string, Session>();

export function createSession(username: string): Session {
  pruneSessions();
  const session: Session = {
    token: randomUUID(),
    username,
    workspace: createWorkspace(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(session.token, session);
  return session;
}

export function getSession(token: string | undefined): Session | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function destroySession(token: string): boolean {
  return sessions.delete(token);
}

function pruneSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  // Map iterates in insertion order, so the oldest sessions go first.
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}
