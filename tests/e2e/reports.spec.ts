import { expect, test } from '../../src/fixtures';
import { csvToRecords } from '../../src/utils/csv';
import { CATEGORIES, SEED, buildProduct, formatUsd } from '../../src/utils/testData';

test.describe('Reports', { tag: '@reports' }, () => {
  test('shows summary statistics for the workspace', { tag: '@smoke' }, async ({ reportsPage }) => {
    await reportsPage.goto();

    await expect(reportsPage.totalProducts).toHaveText(String(SEED.totalProducts));
    await expect(reportsPage.totalUnits).toHaveText(SEED.totalUnits.toLocaleString('en-US'));
    await expect(reportsPage.inventoryValue).toHaveText(formatUsd(SEED.inventoryValue));
    await expect(reportsPage.lowStock).toHaveText(String(SEED.lowStockCount));
    await expect(reportsPage.outOfStock).toHaveText(String(SEED.outOfStockCount));
  });

  test(
    'UI statistics match the summary API',
    { tag: '@regression' },
    async ({ reportsPage, authedApi }) => {
      await authedApi.createProduct(buildProduct({ price: 1000, quantity: 3 }));
      const { body: summary } = await authedApi.summary();

      await reportsPage.goto();

      await expect(reportsPage.totalProducts).toHaveText(String(summary.totalProducts));
      await expect(reportsPage.totalUnits).toHaveText(summary.totalUnits.toLocaleString('en-US'));
      await expect(reportsPage.inventoryValue).toHaveText(formatUsd(summary.inventoryValue));
    },
  );

  test(
    'category breakdown follows the configured order',
    { tag: '@regression' },
    async ({ reportsPage }) => {
      await reportsPage.goto();

      await expect(reportsPage.categoryRows.getByRole('rowheader')).toHaveText([...CATEGORIES]);
      await expect(reportsPage.categoryCell('Furniture', 'products')).toHaveText('2');
      await expect(reportsPage.categoryCell('Furniture', 'units')).toHaveText('19');
      await expect(reportsPage.categoryCell('Furniture', 'value')).toHaveText('$5,731.00');
      // Office Supplies has two products, but only one is active.
      await expect(reportsPage.categoryCell('Office Supplies', 'products')).toHaveText('1');
    },
  );

  test(
    'activity log records a product added in the UI',
    { tag: '@critical' },
    async ({ inventoryPage, reportsPage }) => {
      const product = buildProduct({ name: 'Activity Tracker Watch' });

      await inventoryPage.goto();
      await inventoryPage.addProduct({
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        quantity: product.quantity,
      });
      await inventoryPage.expectToast('Product added successfully');
      await inventoryPage.navigateTo('Reports');

      await expect(reportsPage.activityItems.first()).toContainText(
        `Added ${product.name} (${product.sku})`,
      );
      await expect(reportsPage.activityItems.first()).toHaveAttribute('data-action', 'create');
    },
  );

  test(
    'activity can be filtered by type',
    { tag: '@regression' },
    async ({ reportsPage, authedApi }) => {
      const created = await authedApi.createProduct(buildProduct());
      await authedApi.patchProduct(created.body.id, { quantity: 1 });
      await authedApi.deleteProduct(created.body.id);
      await reportsPage.goto();
      await expect(reportsPage.activityItems).toHaveCount(3);

      await reportsPage.filterActivity('Products deleted');

      await expect(reportsPage.activityItems).toHaveCount(1);
      await expect(reportsPage.activityItems).toHaveAttribute('data-action', 'delete');

      await reportsPage.filterActivity('Workspace resets');
      await expect(reportsPage.activityItems).toHaveCount(0);
      await expect(reportsPage.activityEmpty).toBeVisible();
    },
  );

  test(
    'a new workspace starts with an empty activity log',
    { tag: '@regression' },
    async ({ reportsPage }) => {
      await reportsPage.goto();

      await expect(reportsPage.activityEmpty).toBeVisible();
      await expect(reportsPage.activityItems).toHaveCount(0);
    },
  );

  test(
    'exports the inventory as a CSV download',
    { tag: '@regression' },
    async ({ reportsPage }) => {
      await reportsPage.goto();

      const { download, content } = await reportsPage.exportCsv();

      expect(download.suggestedFilename()).toMatch(/^stockpilot-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
      const records = csvToRecords(content);
      expect(records).toHaveLength(SEED.totalProducts);
      // Quotes and commas inside names survive the round trip.
      expect(records).toContainEqual(
        expect.objectContaining({ SKU: SEED.products.monitor.sku, Name: '27" 4K Monitor' }),
      );
      expect(records).toContainEqual(
        expect.objectContaining({ Name: 'Gel Pens, 12-pack', Status: 'archived' }),
      );
      expect(records.find((r) => r['SKU'] === SEED.products.keyboard.sku)?.['Stock level']).toBe(
        'Low stock',
      );
      await reportsPage.expectToast('Inventory exported');
    },
  );
});
