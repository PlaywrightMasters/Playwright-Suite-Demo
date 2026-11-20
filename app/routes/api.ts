import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  authenticate,
  readSessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from '../auth';
import {
  CATEGORIES,
  STATUSES,
  STOCK_LABELS,
  createSession,
  destroySession,
  logActivity,
  resetWorkspace,
  stockLevel,
  type ActivityAction,
  type Product,
  type Session,
  type Workspace,
} from '../store';
import { isRecord, validateProduct, validateSettings } from '../validation';
import { toCsv } from '../csv';

export const apiRouter = Router();

const APP_VERSION = '1.0.0';
const startedAt = Date.now();

function credentials(): { username: string; password: string } {
  return {
    username: process.env['APP_USERNAME'] ?? 'admin',
    password: process.env['APP_PASSWORD'] ?? 'stockpilot123',
  };
}

function session(res: Response): Session {
  return res.locals['session'] as Session;
}

function findProduct(workspace: Workspace, rawId: unknown): Product | undefined {
  const id = Number(rawId);
  return Number.isInteger(id) ? workspace.products.find((p) => p.id === id) : undefined;
}

function notFound(res: Response, what = 'Product'): void {
  res.status(404).json({ error: `${what} not found` });
}

function validationError(res: Response, details: Record<string, string>): void {
  res.status(400).json({ error: 'Validation failed', details });
}

// Mutating requests must be JSON. Together with SameSite=Lax cookies this
// blocks cross-site form posts from riding on a signed-in browser session.
apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  const mutating = ['POST', 'PUT', 'PATCH'].includes(req.method);
  if (mutating && !req.is('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json' });
    return;
  }
  next();
});

// ── Public endpoints ────────────────────────────────────────────────────────

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: APP_VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

apiRouter.post('/auth/login', (req, res) => {
  const body: unknown = req.body;
  const username = isRecord(body) && typeof body['username'] === 'string' ? body['username'] : '';
  const password = isRecord(body) && typeof body['password'] === 'string' ? body['password'] : '';

  if (!username.trim() || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  const expected = credentials();
  if (username.trim() !== expected.username || password !== expected.password) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const created = createSession(expected.username);
  res.setHeader('Set-Cookie', sessionCookieHeader(created.token, req.secure));
  res.json({
    token: created.token,
    username: created.username,
    expiresAt: new Date(created.expiresAt).toISOString(),
  });
});

// ── Everything below requires a session (cookie or Bearer token) ────────────

apiRouter.use(authenticate);

apiRouter.post('/auth/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) destroySession(token);
  res.setHeader('Set-Cookie', clearSessionCookieHeader());
  res.status(204).end();
});

apiRouter.get('/auth/me', (_req, res) => {
  const s = session(res);
  res.json({ username: s.username, expiresAt: new Date(s.expiresAt).toISOString() });
});

// ── Products ────────────────────────────────────────────────────────────────

const SORTABLE = ['sku', 'name', 'category', 'price', 'quantity'] as const;
type SortKey = (typeof SORTABLE)[number];

apiRouter.get('/products', (req, res) => {
  const { workspace } = session(res);
  const search =
    typeof req.query['search'] === 'string' ? req.query['search'].trim().toLowerCase() : '';
  const category = typeof req.query['category'] === 'string' ? req.query['category'] : '';
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : 'all';
  const sort = typeof req.query['sort'] === 'string' ? req.query['sort'] : 'name';
  const order = req.query['order'] === 'desc' ? 'desc' : 'asc';

  const errors: Record<string, string> = {};
  if (category && !(CATEGORIES as readonly string[]).includes(category)) {
    errors['category'] = `Unknown category. Use one of: ${CATEGORIES.join(', ')}`;
  }
  if (status !== 'all' && !(STATUSES as readonly string[]).includes(status)) {
    errors['status'] = 'Status must be all, active or archived';
  }
  if (!(SORTABLE as readonly string[]).includes(sort)) {
    errors['sort'] = `Sort must be one of: ${SORTABLE.join(', ')}`;
  }
  if (Object.keys(errors).length > 0) {
    validationError(res, errors);
    return;
  }

  const key = sort as SortKey;
  const direction = order === 'desc' ? -1 : 1;
  const results = workspace.products
    .filter((p) => !category || p.category === category)
    .filter((p) => status === 'all' || p.status === status)
    .filter(
      (p) =>
        !search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search),
    )
    .sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'en', { sensitivity: 'base' });
      return (cmp || a.id - b.id) * direction;
    });

  res.json(results);
});

apiRouter.get('/products/:id', (req, res) => {
  const product = findProduct(session(res).workspace, req.params['id']);
  if (!product) return notFound(res);
  res.json(product);
});

apiRouter.post('/products', (req, res) => {
  const s = session(res);
  const result = validateProduct(req.body, 'create');
  if (!result.ok) return validationError(res, result.errors);

  if (s.workspace.products.some((p) => p.sku === result.value.sku)) {
    res.status(409).json({
      error: `A product with SKU ${result.value.sku} already exists`,
      details: { sku: 'SKU is already in use' },
    });
    return;
  }

  const product: Product = {
    id: s.workspace.nextProductId++,
    ...result.value,
    updatedAt: new Date().toISOString(),
  };
  s.workspace.products.push(product);
  logActivity(s.workspace, 'create', `Added ${product.name} (${product.sku})`, s.username);
  res.status(201).location(`/api/products/${product.id}`).json(product);
});

function applyUpdate(req: Request, res: Response, mode: 'replace' | 'patch'): void {
  const s = session(res);
  const product = findProduct(s.workspace, req.params['id']);
  if (!product) return notFound(res);

  const result =
    mode === 'replace' ? validateProduct(req.body, 'replace') : validateProduct(req.body, 'patch');
  if (!result.ok) return validationError(res, result.errors);

  const changes = result.value;
  if (
    changes.sku &&
    s.workspace.products.some((p) => p.sku === changes.sku && p.id !== product.id)
  ) {
    res.status(409).json({
      error: `A product with SKU ${changes.sku} already exists`,
      details: { sku: 'SKU is already in use' },
    });
    return;
  }

  const statusOnly = Object.keys(changes).length === 1 && changes.status !== undefined;
  const statusChanged = changes.status !== undefined && changes.status !== product.status;
  Object.assign(product, changes, { updatedAt: new Date().toISOString() });

  let action: ActivityAction = 'update';
  let message = `Updated ${product.name} (${product.sku})`;
  if (statusOnly) {
    action = 'status';
    message = `${product.status === 'archived' ? 'Archived' : 'Reactivated'} ${product.name} (${product.sku})`;
  }
  if (!statusOnly || statusChanged) logActivity(s.workspace, action, message, s.username);
  res.json(product);
}

apiRouter.put('/products/:id', (req, res) => applyUpdate(req, res, 'replace'));
apiRouter.patch('/products/:id', (req, res) => applyUpdate(req, res, 'patch'));

apiRouter.delete('/products/:id', (req, res) => {
  const s = session(res);
  const product = findProduct(s.workspace, req.params['id']);
  if (!product) return notFound(res);
  s.workspace.products = s.workspace.products.filter((p) => p.id !== product.id);
  logActivity(s.workspace, 'delete', `Deleted ${product.name} (${product.sku})`, s.username);
  res.status(204).end();
});

// ── Reports ─────────────────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

apiRouter.get('/reports/summary', (_req, res) => {
  const { workspace } = session(res);
  const { lowStockThreshold, currency, categoryOrder } = workspace.settings;
  const active = workspace.products.filter((p) => p.status === 'active');

  res.json({
    currency,
    lowStockThreshold,
    totalProducts: workspace.products.length,
    activeProducts: active.length,
    archivedProducts: workspace.products.length - active.length,
    totalUnits: active.reduce((sum, p) => sum + p.quantity, 0),
    inventoryValue: round2(active.reduce((sum, p) => sum + p.price * p.quantity, 0)),
    lowStockCount: active.filter((p) => stockLevel(p.quantity, lowStockThreshold) === 'low').length,
    outOfStockCount: active.filter((p) => stockLevel(p.quantity, lowStockThreshold) === 'out')
      .length,
    byCategory: categoryOrder.map((category) => {
      const items = active.filter((p) => p.category === category);
      return {
        category,
        products: items.length,
        units: items.reduce((sum, p) => sum + p.quantity, 0),
        value: round2(items.reduce((sum, p) => sum + p.price * p.quantity, 0)),
      };
    }),
  });
});

const ACTIVITY_ACTIONS: readonly ActivityAction[] = [
  'create',
  'update',
  'delete',
  'status',
  'settings',
  'reset',
];

apiRouter.get('/reports/activity', (req, res) => {
  const { workspace } = session(res);
  const action = typeof req.query['action'] === 'string' ? req.query['action'] : '';
  if (action && !(ACTIVITY_ACTIONS as readonly string[]).includes(action)) {
    return validationError(res, {
      action: `Action must be one of: ${ACTIVITY_ACTIONS.join(', ')}`,
    });
  }
  res.json(workspace.activity.filter((e) => !action || e.action === action).slice(0, 50));
});

apiRouter.get('/reports/inventory.csv', (_req, res) => {
  const { workspace } = session(res);
  const threshold = workspace.settings.lowStockThreshold;
  const rows = [...workspace.products]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((p) => [
      p.sku,
      p.name,
      p.category,
      p.price.toFixed(2),
      String(p.quantity),
      p.status,
      STOCK_LABELS[stockLevel(p.quantity, threshold)],
    ]);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stockpilot-inventory-${date}.csv"`);
  res.send(
    toCsv([['SKU', 'Name', 'Category', 'Price', 'Quantity', 'Status', 'Stock level'], ...rows]),
  );
});

// ── Settings & workspace ────────────────────────────────────────────────────

apiRouter.get('/settings', (_req, res) => {
  res.json(session(res).workspace.settings);
});

apiRouter.put('/settings', (req, res) => {
  const s = session(res);
  const result = validateSettings(req.body);
  if (!result.ok) return validationError(res, result.errors);
  Object.assign(s.workspace.settings, result.value);
  logActivity(
    s.workspace,
    'settings',
    `Updated settings: ${Object.keys(result.value).join(', ')}`,
    s.username,
  );
  res.json(s.workspace.settings);
});

apiRouter.post('/workspace/reset', (_req, res) => {
  const s = session(res);
  resetWorkspace(s.workspace);
  logActivity(s.workspace, 'reset', 'Workspace reset to sample data', s.username);
  res.json({ ok: true });
});

apiRouter.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
