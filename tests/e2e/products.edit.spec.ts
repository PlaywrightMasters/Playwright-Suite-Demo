import { expect, test } from '../../src/fixtures';
import type { Product } from '../../src/api/types';
import { SEED, buildProduct } from '../../src/utils/testData';

test.describe('Edit product', { tag: '@edit' }, () => {
  let product: Product;

  // Each test edits its own product, seeded through the API into this test's workspace.
  test.beforeEach(async ({ authedApi, inventoryPage }) => {
    const created = await authedApi.createProduct(
      buildProduct({ name: 'Desk Lamp', category: 'Furniture', price: 45, quantity: 30 }),
    );
    expect(created.status).toBe(201);
    product = created.body;
    await inventoryPage.goto();
  });

  test(
    'pre-fills the dialog with the current values',
    { tag: '@critical' },
    async ({ inventoryPage }) => {
      await inventoryPage.openEdit(product.name);

      await inventoryPage.productForm.expectValues({
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        quantity: product.quantity,
      });
      await expect(inventoryPage.productForm.activeCheckbox).toBeChecked();
    },
  );

  test(
    'saving a valid edit updates the row',
    { tag: '@critical' },
    async ({ inventoryPage, authedApi }) => {
      await inventoryPage.editProduct(product.name, { name: 'Desk Lamp Pro', price: '59.90' });

      await inventoryPage.expectToast('Product updated successfully');
      await expect(inventoryPage.cell(product.sku, 'name')).toHaveText('Desk Lamp Pro');
      await expect(inventoryPage.cell(product.sku, 'price')).toHaveText('$59.90');

      const stored = await authedApi.getProduct(product.id);
      expect(stored.body).toMatchObject({ name: 'Desk Lamp Pro', price: 59.9 });
    },
  );

  test(
    'setting quantity to zero marks the product out of stock',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.editProduct(product.name, { quantity: '0' });

      await expect(inventoryPage.stockBadge(product.sku)).toHaveText('Out of stock');
      await expect(inventoryPage.kpiOut).toHaveText(String(SEED.outOfStockCount + 1));
    },
  );

  test(
    'quantity equal to the threshold counts as low stock',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.editProduct(product.name, { quantity: String(SEED.lowStockThreshold) });

      await expect(inventoryPage.stockBadge(product.sku)).toHaveText('Low stock');
    },
  );

  test(
    'invalid edits are rejected and the row is unchanged',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.editProduct(product.name, { name: '', price: '10.999' });

      await inventoryPage.productForm.expectFieldError('name', 'Name is required');
      await inventoryPage.productForm.expectFieldError(
        'price',
        'Price can have at most 2 decimal places',
      );

      await inventoryPage.productForm.cancelButton.click();
      await expect(inventoryPage.cell(product.sku, 'name')).toHaveText(product.name);
    },
  );

  test(
    'Escape closes the dialog without saving',
    { tag: '@regression' },
    async ({ inventoryPage, page }) => {
      await inventoryPage.openEdit(product.name);
      await inventoryPage.productForm.fill({ name: 'Never saved' });
      await page.keyboard.press('Escape');

      await expect(inventoryPage.productForm.root).toBeHidden();
      await expect(inventoryPage.cell(product.sku, 'name')).toHaveText(product.name);
      await expect(inventoryPage.editButton(product.name)).toBeFocused();
    },
  );

  test(
    'unticking Active archives the product',
    { tag: '@regression' },
    async ({ inventoryPage }) => {
      await inventoryPage.editProduct(product.name, { active: false });

      await expect(inventoryPage.statusSwitch(product.name)).toHaveAttribute(
        'aria-checked',
        'false',
      );
    },
  );
});
