import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { AppPage } from './BasePage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ProductFormDialog, type ProductFormValues } from './components/ProductFormDialog';

export type ProductColumn = 'sku' | 'name' | 'category' | 'price' | 'quantity' | 'stock';
export type SortableColumn = 'SKU' | 'Name' | 'Price' | 'Qty';
export type StatusFilter = 'All statuses' | 'Active' | 'Archived';

export class InventoryPage extends AppPage {
  readonly path = '/inventory';
  readonly heading: Locator;
  readonly kpiTotal: Locator;
  readonly kpiLow: Locator;
  readonly kpiOut: Locator;
  readonly kpiValue: Locator;
  readonly filters: Locator;
  readonly searchInput: Locator;
  readonly categoryFilter: Locator;
  readonly statusFilter: Locator;
  readonly addProductButton: Locator;
  readonly clearFiltersButton: Locator;
  readonly resultCount: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;
  readonly retryButton: Locator;
  readonly productForm: ProductFormDialog;
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Inventory', level: 1 });
    this.kpiTotal = page.getByTestId('kpi-total');
    this.kpiLow = page.getByTestId('kpi-low');
    this.kpiOut = page.getByTestId('kpi-out');
    this.kpiValue = page.getByTestId('kpi-value');
    this.filters = page.getByRole('region', { name: 'Filters' });
    this.searchInput = this.filters.getByRole('searchbox', { name: 'Search' });
    this.categoryFilter = this.filters.getByLabel('Category');
    this.statusFilter = this.filters.getByLabel('Status');
    this.addProductButton = page.getByRole('button', { name: 'Add product' });
    this.clearFiltersButton = page.getByRole('button', { name: 'Clear filters' });
    this.resultCount = page.getByTestId('result-count');
    this.table = page.getByTestId('products-table');
    this.rows = page.getByTestId('product-row');
    this.emptyState = page.getByTestId('empty-state');
    this.errorState = page.getByTestId('error-state');
    this.retryButton = page.getByRole('button', { name: 'Try again' });
    this.productForm = new ProductFormDialog(page);
    this.confirmDialog = new ConfirmDialog(page);
  }

  protected async waitUntilReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.resultCount).not.toHaveText('Loading products…');
  }

  // ── Locators for a single product ─────────────────────────────────────────

  /** The table row whose SKU cell matches exactly. */
  row(sku: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: sku, exact: true }) });
  }

  cell(sku: string, column: ProductColumn): Locator {
    return this.row(sku).locator(`[data-col="${column}"]`);
  }

  stockBadge(sku: string): Locator {
    return this.row(sku).getByTestId('stock-badge');
  }

  statusSwitch(productName: string): Locator {
    return this.page.getByRole('switch', { name: `Active: ${productName}`, exact: true });
  }

  editButton(productName: string): Locator {
    return this.page.getByRole('button', { name: `Edit ${productName}`, exact: true });
  }

  deleteButton(productName: string): Locator {
    return this.page.getByRole('button', { name: `Delete ${productName}`, exact: true });
  }

  columnHeader(column: SortableColumn): Locator {
    return this.page.getByRole('columnheader', { name: column, exact: true });
  }

  /** Text of one column across all visible rows, in display order. */
  columnValues(column: ProductColumn): Promise<string[]> {
    return this.rows.locator(`[data-col="${column}"]`).allTextContents();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async addProduct(values: ProductFormValues): Promise<void> {
    await test.step(`Add product ${values.sku ?? ''}`.trim(), async () => {
      await this.addProductButton.click();
      await expect(this.productForm.title).toHaveText('Add product');
      await this.productForm.fill(values);
      await this.productForm.save();
    });
  }

  async openEdit(productName: string): Promise<void> {
    await test.step(`Open edit dialog for ${productName}`, async () => {
      await this.editButton(productName).click();
      await expect(this.productForm.title).toHaveText('Edit product');
    });
  }

  async editProduct(productName: string, changes: ProductFormValues): Promise<void> {
    await test.step(`Edit ${productName}`, async () => {
      await this.openEdit(productName);
      await this.productForm.fill(changes);
      await this.productForm.save();
    });
  }

  async deleteProduct(productName: string): Promise<void> {
    await test.step(`Delete ${productName}`, async () => {
      await this.deleteButton(productName).click();
      await this.confirmDialog.confirm('Delete product');
    });
  }

  async toggleStatus(productName: string): Promise<void> {
    await test.step(`Toggle active status of ${productName}`, async () => {
      await this.statusSwitch(productName).click();
    });
  }

  /** Types a search term and waits for the matching (debounced) API response. */
  async search(term: string): Promise<void> {
    await test.step(`Search for "${term}"`, async () => {
      const response = this.waitForProductsQuery('search', term.trim());
      await this.searchInput.fill(term);
      await response;
    });
  }

  async filterByCategory(category: string): Promise<void> {
    await test.step(`Filter by category "${category || 'All'}"`, async () => {
      const response = this.waitForProductsQuery('category', category);
      await this.categoryFilter.selectOption(category === '' ? '' : { label: category });
      await response;
    });
  }

  async filterByStatus(status: StatusFilter): Promise<void> {
    await test.step(`Filter by status "${status}"`, async () => {
      const value = status === 'All statuses' ? 'all' : status.toLowerCase();
      const response = this.waitForProductsQuery('status', value);
      await this.statusFilter.selectOption({ label: status });
      await response;
    });
  }

  async sortBy(column: SortableColumn): Promise<void> {
    await test.step(`Sort by ${column}`, async () => {
      const response = this.page.waitForResponse(
        (r) => r.url().includes('/api/products?') && r.request().method() === 'GET',
      );
      await this.columnHeader(column).getByRole('button').click();
      await response;
    });
  }

  private waitForProductsQuery(param: string, expected: string): Promise<Response> {
    return this.page.waitForResponse((response) => {
      if (response.request().method() !== 'GET') return false;
      const url = new URL(response.url());
      return url.pathname === '/api/products' && (url.searchParams.get(param) ?? '') === expected;
    });
  }

  async expectRowCount(count: number): Promise<void> {
    await expect(this.rows).toHaveCount(count);
    await expect(this.resultCount).toHaveText(
      `Showing ${count} ${count === 1 ? 'product' : 'products'}`,
    );
  }
}
