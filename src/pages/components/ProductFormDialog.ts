import { expect, test, type Locator, type Page } from '@playwright/test';
import { escapeRegExp } from '../BasePage';

export interface ProductFormValues {
  name?: string;
  sku?: string;
  category?: string;
  price?: string | number;
  quantity?: string | number;
  active?: boolean;
}

export type ProductField = 'name' | 'sku' | 'category' | 'price' | 'quantity';

/** The add/edit product modal (a native <dialog>). */
export class ProductFormDialog {
  readonly root: Locator;
  readonly title: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly formError: Locator;
  readonly activeCheckbox: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: /^(Add|Edit) product$/ });
    this.title = this.root.getByRole('heading', { level: 2 });
    this.saveButton = this.root.getByRole('button', { name: 'Save product' });
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' });
    this.formError = this.root.getByTestId('form-error');
    this.activeCheckbox = this.root.getByRole('checkbox', { name: /^Active/ });
  }

  field(name: ProductField): Locator {
    const labels: Record<ProductField, string> = {
      name: 'Name',
      sku: 'SKU',
      category: 'Category',
      price: 'Price',
      quantity: 'Quantity',
    };
    return this.root.getByLabel(labels[name], { exact: true });
  }

  async fill(values: ProductFormValues): Promise<void> {
    await test.step('Fill product form', async () => {
      if (values.name !== undefined) await this.field('name').fill(values.name);
      if (values.sku !== undefined) await this.field('sku').fill(values.sku);
      if (values.category !== undefined) {
        await this.field('category').selectOption(values.category);
      }
      if (values.price !== undefined) await this.field('price').fill(String(values.price));
      if (values.quantity !== undefined) {
        await this.field('quantity').fill(String(values.quantity));
      }
      if (values.active !== undefined) await this.activeCheckbox.setChecked(values.active);
    });
  }

  async save(): Promise<void> {
    await test.step('Save product form', async () => {
      await this.saveButton.click();
    });
  }

  async expectFieldError(field: ProductField, message: string): Promise<void> {
    const input = this.field(field);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    // The error is linked through aria-describedby, so assistive tech reads it too.
    await expect(input).toHaveAccessibleDescription(new RegExp(escapeRegExp(message)));
  }

  async expectValues(values: Required<Omit<ProductFormValues, 'active'>>): Promise<void> {
    await expect(this.field('name')).toHaveValue(values.name);
    await expect(this.field('sku')).toHaveValue(values.sku);
    await expect(this.field('category')).toHaveValue(values.category);
    await expect(this.field('price')).toHaveValue(String(values.price));
    await expect(this.field('quantity')).toHaveValue(String(values.quantity));
  }
}
