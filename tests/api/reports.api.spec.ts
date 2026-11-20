import { expect, test } from '../../src/fixtures';
import { csvToRecords } from '../../src/utils/csv';
import { CATEGORIES, SEED, buildProduct } from '../../src/utils/testData';

test.describe('Reports & settings API', { tag: '@api' }, () => {
  test('summary reflects the seeded workspace', { tag: '@smoke' }, async ({ authedApi }) => {
    const { status, body } = await authedApi.summary();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      currency: 'USD',
      lowStockThreshold: SEED.lowStockThreshold,
      totalProducts: SEED.totalProducts,
      activeProducts: SEED.activeProducts,
      archivedProducts: SEED.archivedProducts,
      totalUnits: SEED.totalUnits,
      inventoryValue: SEED.inventoryValue,
      lowStockCount: SEED.lowStockCount,
      outOfStockCount: SEED.outOfStockCount,
    });
    expect(body.byCategory.map((c) => c.category)).toEqual(CATEGORIES);
  });

  test('summary updates when products change', { tag: '@regression' }, async ({ authedApi }) => {
    await authedApi.createProduct(buildProduct({ price: 10, quantity: 5 }));

    const { body } = await authedApi.summary();
    expect(body.totalProducts).toBe(SEED.totalProducts + 1);
    expect(body.totalUnits).toBe(SEED.totalUnits + 5);
    expect(body.inventoryValue).toBeCloseTo(SEED.inventoryValue + 50, 2);
    expect(body.lowStockCount).toBe(SEED.lowStockCount + 1);
  });

  test(
    'activity lists newest first and can be filtered',
    { tag: '@regression' },
    async ({ authedApi }) => {
      const { body: product } = await authedApi.createProduct(buildProduct());
      await authedApi.patchProduct(product.id, { status: 'archived' });

      const all = await authedApi.activity();
      expect(all.body.map((e) => e.action)).toEqual(['status', 'create']);
      expect(all.body[0]?.message).toBe(`Archived ${product.name} (${product.sku})`);

      const created = await authedApi.activity('create');
      expect(created.body).toHaveLength(1);

      expect((await authedApi.activity('explode')).status).toBe(400);
    },
  );

  test(
    'CSV export is an attachment with escaped cells',
    { tag: '@regression' },
    async ({ authedApi }) => {
      await authedApi.createProduct(buildProduct({ name: '=HYPERLINK("http://x")' }));

      const response = await authedApi.exportCsv();

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="stockpilot-inventory-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      const records = csvToRecords(response.body);
      expect(records).toHaveLength(SEED.totalProducts + 1);
      // Formula-like text is neutralised so spreadsheets do not execute it.
      expect(records.map((r) => r['Name'])).toContain(`'=HYPERLINK("http://x")`);
    },
  );

  test(
    'settings can be read and partially updated',
    { tag: '@critical' },
    async ({ authedApi }) => {
      const before = await authedApi.getSettings();
      expect(before.body).toEqual({
        lowStockThreshold: 10,
        currency: 'USD',
        density: 'comfortable',
        emailAlerts: true,
        dailyDigest: false,
        categoryOrder: CATEGORIES,
      });

      const after = await authedApi.updateSettings({ lowStockThreshold: 20, currency: 'INR' });
      expect(after.status).toBe(200);
      expect(after.body).toEqual({ ...before.body, lowStockThreshold: 20, currency: 'INR' });

      const { body: summary } = await authedApi.summary();
      expect(summary.lowStockCount).toBe(SEED.lowStockCount + 1); // the chair (15 units)
    },
  );

  test(
    'invalid settings are rejected field by field',
    { tag: '@regression' },
    async ({ authedApi }) => {
      const response = await authedApi.updateSettings({
        lowStockThreshold: 51,
        currency: 'GBP',
        categoryOrder: ['Electronics', 'Electronics', 'Furniture', 'Apparel'],
      });

      expect(response.status).toBe(400);
      expect(Object.keys(response.body.details ?? {}).sort()).toEqual([
        'categoryOrder',
        'currency',
        'lowStockThreshold',
      ]);
    },
  );

  test('workspace reset restores seed data', { tag: '@regression' }, async ({ authedApi }) => {
    await authedApi.createProduct(buildProduct());
    await authedApi.updateSettings({ density: 'compact' });

    expect((await authedApi.resetWorkspace()).status).toBe(200);

    expect((await authedApi.listProducts()).body).toHaveLength(SEED.totalProducts);
    expect((await authedApi.getSettings()).body.density).toBe('comfortable');
    expect((await authedApi.activity()).body.map((e) => e.action)).toEqual(['reset']);
  });
});
