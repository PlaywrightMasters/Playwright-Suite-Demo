import { expect, test } from '../../src/fixtures';
import { SEED } from '../../src/utils/testData';

test.describe('Search and filters', { tag: '@filter' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('search narrows the table by product name', { tag: '@smoke' }, async ({ inventoryPage }) => {
    await inventoryPage.search('desk');

    await inventoryPage.expectRowCount(1);
    await expect(inventoryPage.cell(SEED.products.desk.sku, 'name')).toHaveText('Standing Desk');
  });

  test(
    'search matches SKUs and ignores case',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.search('sp-10');

      await inventoryPage.expectRowCount(3);
      for (const sku of await inventoryPage.columnValues('sku')) expect(sku).toMatch(/^SP-10/);
    },
  );

  test(
    'category filter shows only that category',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.filterByCategory('Office Supplies');

      await inventoryPage.expectRowCount(SEED.productsByCategory['Office Supplies']);
      const categories = await inventoryPage.columnValues('category');
      expect(new Set(categories)).toEqual(new Set(['Office Supplies']));
    },
  );

  test(
    'status filter shows only archived products',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.filterByStatus('Archived');

      await inventoryPage.expectRowCount(SEED.archivedProducts);
      await expect(inventoryPage.statusSwitch(SEED.products.pens.name)).toHaveAttribute(
        'aria-checked',
        'false',
      );
    },
  );

  test(
    'combined filters with no match show the empty state',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.filterByCategory('Apparel');
      await inventoryPage.search('keyboard');

      await expect(inventoryPage.emptyState).toBeVisible();
      await expect(inventoryPage.emptyState).toContainText('No products match your filters.');
      await expect(inventoryPage.resultCount).toHaveText('Showing 0 products');
      await expect(inventoryPage.table).toBeHidden();
    },
  );

  test(
    'clear filters restores the full list',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.filterByStatus('Active');
      await inventoryPage.search('zzz-no-match');
      await expect(inventoryPage.emptyState).toBeVisible();

      await inventoryPage.clearFiltersButton.click();

      await inventoryPage.expectRowCount(SEED.totalProducts);
      await expect(inventoryPage.searchInput).toHaveValue('');
      await expect(inventoryPage.statusFilter).toHaveValue('all');
      await expect(inventoryPage.clearFiltersButton).toBeHidden();
    },
  );

  test(
    'filters are kept in the URL and restored from a shared link',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      await inventoryPage.filterByCategory('Furniture');
      await inventoryPage.search('chair');
      await expect(page).toHaveURL(/[?&]category=Furniture/);
      await expect(page).toHaveURL(/[?&]q=chair/);

      // Open the same URL fresh: the filters should be applied on load.
      await page.goto(page.url());
      await expect(inventoryPage.categoryFilter).toHaveValue('Furniture');
      await expect(inventoryPage.searchInput).toHaveValue('chair');
      await inventoryPage.expectRowCount(1);
    },
  );

  test(
    'an unknown category in the URL falls back to all categories',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.goto('?category=Spaceships');

      await expect(inventoryPage.categoryFilter).toHaveValue('');
      await inventoryPage.expectRowCount(SEED.totalProducts);
    },
  );
});
