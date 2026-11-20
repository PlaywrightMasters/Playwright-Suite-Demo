import { expect, test } from '../../src/fixtures';
import { CATEGORIES, SEED, buildProduct } from '../../src/utils/testData';

test.describe('Settings', { tag: '@settings' }, () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.goto();
  });

  test('loads the default preferences', { tag: '@smoke' }, async ({ settingsPage }) => {
    await expect(settingsPage.threshold).toHaveValue(String(SEED.lowStockThreshold));
    await expect(settingsPage.thresholdValue).toHaveText(String(SEED.lowStockThreshold));
    await expect(settingsPage.currency).toHaveValue('USD');
    await expect(settingsPage.density('Comfortable')).toBeChecked();
    await expect(settingsPage.emailAlerts).toBeChecked();
    await expect(settingsPage.dailyDigest).not.toBeChecked();
    await expect(settingsPage.categoryNames).toHaveText([...CATEGORIES]);
    await expect(settingsPage.unsavedIndicator).toBeHidden();
  });

  test(
    'the threshold slider updates its value as it moves',
    { tag: '@regression' },
    async ({ settingsPage }) => {
      await settingsPage.setThreshold(25);
      await expect(settingsPage.threshold).toHaveValue('25');

      // Keyboard support comes from the native range input.
      await settingsPage.threshold.press('ArrowRight');
      await expect(settingsPage.thresholdValue).toHaveText('26');
      await settingsPage.threshold.press('Home');
      await expect(settingsPage.thresholdValue).toHaveText('0');
    },
  );

  test(
    'a higher threshold re-labels stock on the inventory page',
    { tag: '@critical' },
    async ({ settingsPage, inventoryPage }) => {
      const { chair } = SEED.products; // 15 units: "In stock" at the default threshold of 10

      await settingsPage.setThreshold(20);
      await settingsPage.save();
      await settingsPage.expectToast('Settings saved');

      await settingsPage.navigateTo('Inventory');
      await expect(inventoryPage.stockBadge(chair.sku)).toHaveText('Low stock');
      await expect(inventoryPage.kpiLow).toHaveText(String(SEED.lowStockCount + 1));
    },
  );

  test(
    'currency and density preferences apply to the inventory table',
    { tag: '@regression' },
    async ({ settingsPage, inventoryPage }) => {
      await settingsPage.currency.selectOption('EUR');
      await settingsPage.density('Compact').check();
      await settingsPage.save();

      await inventoryPage.goto();
      await expect(inventoryPage.cell(SEED.products.mouse.sku, 'price')).toHaveText('€24.99');
      await expect(inventoryPage.table).toHaveAttribute('data-density', 'compact');
    },
  );

  test(
    'tracks unsaved changes and can discard them',
    { tag: '@regression' },
    async ({ settingsPage }) => {
      await expect(settingsPage.discardButton).toBeDisabled();

      await settingsPage.dailyDigest.check();
      await expect(settingsPage.unsavedIndicator).toBeVisible();
      await expect(settingsPage.discardButton).toBeEnabled();

      await settingsPage.discardButton.click();
      await expect(settingsPage.dailyDigest).not.toBeChecked();
      await expect(settingsPage.unsavedIndicator).toBeHidden();

      // Reverting a change by hand also clears the indicator.
      await settingsPage.emailAlerts.uncheck();
      await expect(settingsPage.unsavedIndicator).toBeVisible();
      await settingsPage.emailAlerts.check();
      await expect(settingsPage.unsavedIndicator).toBeHidden();
    },
  );

  test(
    'reorders categories with the arrow buttons',
    { tag: '@regression' },
    async ({ settingsPage, inventoryPage, authedApi }) => {
      await expect(
        settingsPage.page.getByRole('button', { name: 'Move Electronics up' }),
      ).toBeDisabled();

      await settingsPage.moveCategory('Apparel', 'up');
      await settingsPage.moveCategory('Apparel', 'up');
      await expect(settingsPage.categoryNames).toHaveText([
        'Electronics',
        'Apparel',
        'Furniture',
        'Office Supplies',
      ]);
      await expect(
        settingsPage.page.getByRole('button', { name: 'Move Apparel up' }),
      ).toBeFocused();

      await settingsPage.save();
      expect((await authedApi.getSettings()).body.categoryOrder).toEqual([
        'Electronics',
        'Apparel',
        'Furniture',
        'Office Supplies',
      ]);

      await inventoryPage.goto();
      await expect(inventoryPage.categoryFilter.locator('option')).toHaveText([
        'All categories',
        'Electronics',
        'Apparel',
        'Furniture',
        'Office Supplies',
      ]);
    },
  );

  test('reorders categories by drag and drop', { tag: '@regression' }, async ({ settingsPage }) => {
    await settingsPage.dragCategory('Office Supplies', 'Electronics');

    await expect(settingsPage.categoryNames).toHaveText([
      'Office Supplies',
      'Electronics',
      'Furniture',
      'Apparel',
    ]);
    await expect(settingsPage.unsavedIndicator).toBeVisible();
  });

  test(
    'the danger zone is collapsed until opened',
    { tag: '@regression' },
    async ({ settingsPage }) => {
      await expect(settingsPage.resetWorkspaceButton).toBeHidden();

      await settingsPage.dangerZoneToggle.click();
      await expect(settingsPage.resetWorkspaceButton).toBeVisible();

      await settingsPage.dangerZoneToggle.click();
      await expect(settingsPage.resetWorkspaceButton).toBeHidden();
    },
  );

  test(
    'resetting the workspace restores sample data and defaults',
    { tag: '@regression' },
    async ({ settingsPage, authedApi }) => {
      await authedApi.createProduct(buildProduct());
      await authedApi.updateSettings({ lowStockThreshold: 30, currency: 'INR' });
      await settingsPage.page.reload();
      await expect(settingsPage.thresholdValue).toHaveText('30');

      await settingsPage.resetWorkspace();

      await settingsPage.expectToast('Workspace reset to sample data');
      await expect(settingsPage.thresholdValue).toHaveText(String(SEED.lowStockThreshold));
      await expect(settingsPage.currency).toHaveValue('USD');
      const { body: products } = await authedApi.listProducts();
      expect(products).toHaveLength(SEED.totalProducts);
    },
  );
});
