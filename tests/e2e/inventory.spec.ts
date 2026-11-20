import { expect, test } from '../../src/fixtures';
import { SEED, buildProduct, formatUsd, uniqueSku } from '../../src/utils/testData';

test.describe('Inventory', { tag: '@inventory' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('shows the seeded catalogue and summary', { tag: '@smoke' }, async ({ inventoryPage }) => {
    await inventoryPage.expectRowCount(SEED.totalProducts);
    await expect(inventoryPage.kpiTotal).toHaveText(String(SEED.totalProducts));
    await expect(inventoryPage.kpiLow).toHaveText(String(SEED.lowStockCount));
    await expect(inventoryPage.kpiOut).toHaveText(String(SEED.outOfStockCount));
    await expect(inventoryPage.kpiValue).toHaveText(formatUsd(SEED.inventoryValue));
  });

  test(
    'stock badges reflect quantity against the low-stock threshold',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      const { mouse, keyboard, monitor } = SEED.products;
      await expect(inventoryPage.stockBadge(mouse.sku)).toHaveText('In stock');
      await expect(inventoryPage.stockBadge(keyboard.sku)).toHaveText('Low stock');
      await expect(inventoryPage.stockBadge(monitor.sku)).toHaveText('Out of stock');
    },
  );

  test(
    'adds a new product and shows a success toast',
    { tag: '@critical' },
    async ({ inventoryPage }) => {
      const sku = uniqueSku();
      await inventoryPage.addProduct({
        name: 'Noise-Cancelling Headset',
        sku,
        category: 'Electronics',
        price: '149.50',
        quantity: '6',
      });

      await inventoryPage.expectToast('Product added successfully');
      await expect(inventoryPage.productForm.root).toBeHidden();
      await expect(inventoryPage.cell(sku, 'name')).toHaveText('Noise-Cancelling Headset');
      await expect(inventoryPage.cell(sku, 'price')).toHaveText('$149.50');
      await expect(inventoryPage.stockBadge(sku)).toHaveText('Low stock');
      await expect(inventoryPage.kpiTotal).toHaveText(String(SEED.totalProducts + 1));
    },
  );

  test('uppercases SKUs as they are typed', { tag: '@regression' }, async ({ inventoryPage }) => {
    await inventoryPage.addProductButton.click();
    await inventoryPage.productForm.field('sku').fill('qa-123456');

    await expect(inventoryPage.productForm.field('sku')).toHaveValue('QA-123456');
  });

  test(
    'blocks invalid input in the browser with field-level errors',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      let createRequests = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/api/products'))
          createRequests++;
      });

      await inventoryPage.addProduct({ name: 'A', sku: 'BAD', price: '-5', quantity: '2.5' });

      const form = inventoryPage.productForm;
      await form.expectFieldError('name', 'Name must be between 2 and 80 characters');
      await form.expectFieldError('sku', 'SKU must look like SP-1234');
      await form.expectFieldError('category', 'Category is required');
      await form.expectFieldError('price', 'Price must be between 0 and 1,000,000');
      await form.expectFieldError('quantity', 'Quantity must be a whole number');
      await expect(form.field('name')).toBeFocused();
      await expect(form.root).toBeVisible();
      expect(createRequests, 'invalid data must not reach the API').toBe(0);
    },
  );

  test(
    'shows the API error when the SKU already exists',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      const existing = SEED.products.mouse;
      await inventoryPage.addProduct({
        name: 'Duplicate Mouse',
        sku: existing.sku,
        category: 'Electronics',
        price: 10,
        quantity: 1,
      });

      const form = inventoryPage.productForm;
      await expect(form.formError).toHaveText(`A product with SKU ${existing.sku} already exists`);
      await form.expectFieldError('sku', 'SKU is already in use');
      await expect(form.root).toBeVisible();
    },
  );

  test(
    'cancelling the dialog discards the draft',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      const sku = uniqueSku();
      await inventoryPage.addProductButton.click();
      await inventoryPage.productForm.fill({ name: 'Draft product', sku });
      await inventoryPage.productForm.cancelButton.click();

      await expect(inventoryPage.productForm.root).toBeHidden();
      await expect(inventoryPage.addProductButton).toBeFocused();
      await expect(inventoryPage.row(sku)).toHaveCount(0);
      await inventoryPage.expectRowCount(SEED.totalProducts);
    },
  );

  test(
    'deletes a product after confirmation',
    { tag: '@critical' },
    async ({ inventoryPage, authedApi }) => {
      const product = buildProduct({ name: 'Disposable Item' });
      await authedApi.createProduct(product);
      await inventoryPage.goto();

      await inventoryPage.deleteButton(product.name).click();
      await expect(inventoryPage.confirmDialog.message).toContainText(
        `${product.name} (${product.sku})`,
      );
      await inventoryPage.confirmDialog.confirm('Delete product');

      await inventoryPage.expectToast(`${product.name} deleted`);
      await expect(inventoryPage.row(product.sku)).toHaveCount(0);
      const remaining = await authedApi.listProducts({ search: product.sku });
      expect(remaining.body).toHaveLength(0);
    },
  );

  test(
    'cancelling a delete keeps the product',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      const { hoodie } = SEED.products;
      await inventoryPage.deleteButton(hoodie.name).click();
      await inventoryPage.confirmDialog.cancel();

      await expect(inventoryPage.confirmDialog.root).toBeHidden();
      await expect(inventoryPage.row(hoodie.sku)).toBeVisible();
      await expect(inventoryPage.deleteButton(hoodie.name)).toBeFocused();
    },
  );

  test('sorts by price in both directions', { tag: '@regression' }, async ({ inventoryPage }) => {
    const toNumbers = (values: string[]): number[] =>
      values.map((v) => Number(v.replace(/[^0-9.]/g, '')));

    await inventoryPage.sortBy('Price');
    await expect(inventoryPage.columnHeader('Price')).toHaveAttribute('aria-sort', 'ascending');
    const ascending = toNumbers(await inventoryPage.columnValues('price'));
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    await inventoryPage.sortBy('Price');
    await expect(inventoryPage.columnHeader('Price')).toHaveAttribute('aria-sort', 'descending');
    const descending = toNumbers(await inventoryPage.columnValues('price'));
    expect(descending).toEqual([...ascending].reverse());
  });

  test(
    'shows an error state when products fail to load, and recovers on retry',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      let failNext = true;
      await page.route(
        (url) => url.pathname === '/api/products',
        async (route) => {
          if (failNext) {
            failNext = false;
            await route.fulfill({ status: 503, json: { error: 'Service unavailable' } });
          } else {
            await route.fallback();
          }
        },
      );

      await page.reload();
      await expect(inventoryPage.errorState).toBeVisible();
      await expect(inventoryPage.resultCount).toHaveText('Products unavailable');

      await inventoryPage.retryButton.click();
      await expect(inventoryPage.errorState).toBeHidden();
      await inventoryPage.expectRowCount(SEED.totalProducts);
    },
  );
});
