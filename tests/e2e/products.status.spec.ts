import { expect, test } from '../../src/fixtures';
import { SEED } from '../../src/utils/testData';

test.describe('Active status toggle', { tag: '@status' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test(
    'archiving a product persists the change',
    { tag: '@critical' },
    async ({ inventoryPage, authedApi }) => {
      const { hoodie } = SEED.products;
      await expect(inventoryPage.statusSwitch(hoodie.name)).toHaveAttribute('aria-checked', 'true');

      await inventoryPage.toggleStatus(hoodie.name);

      await expect(inventoryPage.statusSwitch(hoodie.name)).toHaveAttribute(
        'aria-checked',
        'false',
      );
      await inventoryPage.expectToast(`${hoodie.name} archived`);
      const [stored] = (await authedApi.listProducts({ search: hoodie.sku })).body;
      expect(stored?.status).toBe('archived');
    },
  );

  test('reactivating an archived product', { tag: '@regression' }, async ({ inventoryPage }) => {
    const { pens } = SEED.products;
    await inventoryPage.toggleStatus(pens.name);

    await expect(inventoryPage.statusSwitch(pens.name)).toHaveAttribute('aria-checked', 'true');
    await inventoryPage.expectToast(`${pens.name} reactivated`);
    // Pens have zero units, so reactivating them adds one out-of-stock item.
    await expect(inventoryPage.kpiOut).toHaveText(String(SEED.outOfStockCount + 1));
  });

  test(
    'the switch flips immediately, before the server answers',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      const { mouse } = SEED.products;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/products/*', async (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        await gate;
        await route.fallback();
      });

      await inventoryPage.toggleStatus(mouse.name);

      const toggle = inventoryPage.statusSwitch(mouse.name);
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(toggle).toBeDisabled();

      release();
      await expect(toggle).toBeEnabled();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    },
  );

  test(
    'reverts the optimistic update when the server fails',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      const { mouse } = SEED.products;
      await page.route('**/api/products/*', (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 500, json: { error: 'Database unavailable' } })
          : route.fallback(),
      );

      await inventoryPage.toggleStatus(mouse.name);

      await inventoryPage.expectToast(`Couldn't update ${mouse.name}. Please try again.`);
      await expect(inventoryPage.toasts.last()).toHaveAttribute('role', 'alert');
      await expect(inventoryPage.statusSwitch(mouse.name)).toHaveAttribute('aria-checked', 'true');
    },
  );

  test(
    'archived products are excluded from stock KPIs',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      // The keyboard is one of the two low-stock items.
      await inventoryPage.toggleStatus(SEED.products.keyboard.name);

      await expect(inventoryPage.kpiLow).toHaveText(String(SEED.lowStockCount - 1));
      await expect(inventoryPage.kpiTotal).toHaveText(String(SEED.totalProducts));
    },
  );

  test(
    'with the Active filter on, an archived product leaves the list',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      const { chair } = SEED.products;
      await inventoryPage.filterByStatus('Active');
      await inventoryPage.expectRowCount(SEED.activeProducts);

      await inventoryPage.toggleStatus(chair.name);

      await inventoryPage.expectRowCount(SEED.activeProducts - 1);
      await expect(inventoryPage.row(chair.sku)).toHaveCount(0);
    },
  );
});
