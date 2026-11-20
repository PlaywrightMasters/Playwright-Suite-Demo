import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { AppPage } from './BasePage';

export type ActivityFilter =
  | 'All activity'
  | 'Products added'
  | 'Products edited'
  | 'Products deleted'
  | 'Status changes'
  | 'Settings changes'
  | 'Workspace resets';

export class ReportsPage extends AppPage {
  readonly path = '/reports';
  readonly heading: Locator;
  readonly totalProducts: Locator;
  readonly totalUnits: Locator;
  readonly inventoryValue: Locator;
  readonly lowStock: Locator;
  readonly outOfStock: Locator;
  readonly categoryRows: Locator;
  readonly activityFilter: Locator;
  readonly activityItems: Locator;
  readonly activityEmpty: Locator;
  readonly exportButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Reports', level: 1 });
    this.totalProducts = page.getByTestId('stat-total-products');
    this.totalUnits = page.getByTestId('stat-total-units');
    this.inventoryValue = page.getByTestId('stat-inventory-value');
    this.lowStock = page.getByTestId('stat-low-stock');
    this.outOfStock = page.getByTestId('stat-out-of-stock');
    this.categoryRows = page.getByTestId('category-row');
    this.activityFilter = page.getByLabel('Filter activity');
    this.activityItems = page.getByTestId('activity-item');
    this.activityEmpty = page.getByTestId('activity-empty');
    this.exportButton = page.getByRole('button', { name: 'Export CSV' });
  }

  protected async waitUntilReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.totalProducts).not.toHaveText('–');
  }

  categoryRow(category: string): Locator {
    return this.categoryRows.filter({
      has: this.page.getByRole('rowheader', { name: category, exact: true }),
    });
  }

  categoryCell(category: string, column: 'products' | 'units' | 'value' | 'share'): Locator {
    return this.categoryRow(category).locator(`[data-col="${column}"]`);
  }

  async filterActivity(filter: ActivityFilter): Promise<void> {
    await test.step(`Show ${filter.toLowerCase()}`, async () => {
      const response = this.page.waitForResponse((r) => r.url().includes('/api/reports/activity'));
      await this.activityFilter.selectOption({ label: filter });
      await response;
    });
  }

  /** Clicks Export CSV and returns the download plus its text content. */
  async exportCsv(): Promise<{ download: Download; content: string }> {
    return test.step('Export inventory CSV', async () => {
      const downloadPromise = this.page.waitForEvent('download');
      await this.exportButton.click();
      const download = await downloadPromise;
      const content = await readFile(await download.path(), 'utf8');
      return { download, content };
    });
  }
}
