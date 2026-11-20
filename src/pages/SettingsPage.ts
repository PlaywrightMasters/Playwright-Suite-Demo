import { expect, test, type Locator, type Page } from '@playwright/test';
import { AppPage } from './BasePage';
import { ConfirmDialog } from './components/ConfirmDialog';

export class SettingsPage extends AppPage {
  readonly path = '/settings';
  readonly heading: Locator;
  readonly threshold: Locator;
  readonly thresholdValue: Locator;
  readonly currency: Locator;
  readonly emailAlerts: Locator;
  readonly dailyDigest: Locator;
  readonly categoryItems: Locator;
  readonly categoryNames: Locator;
  readonly saveButton: Locator;
  readonly discardButton: Locator;
  readonly unsavedIndicator: Locator;
  readonly dangerZone: Locator;
  readonly dangerZoneToggle: Locator;
  readonly resetWorkspaceButton: Locator;
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Settings', level: 1 });
    this.threshold = page.getByRole('slider', { name: 'Low-stock threshold' });
    this.thresholdValue = page.getByTestId('threshold-value');
    this.currency = page.getByLabel('Display currency');
    this.emailAlerts = page.getByRole('checkbox', { name: 'Email me when items run low' });
    this.dailyDigest = page.getByRole('checkbox', { name: 'Send a daily stock digest' });
    this.categoryItems = page.getByTestId('category-order-item');
    this.categoryNames = page.getByTestId('category-name');
    this.saveButton = page.getByRole('button', { name: 'Save settings' });
    this.discardButton = page.getByRole('button', { name: 'Discard changes' });
    this.unsavedIndicator = page.getByTestId('unsaved-indicator');
    this.dangerZone = page.getByTestId('danger-zone');
    this.dangerZoneToggle = this.dangerZone.locator('summary');
    this.resetWorkspaceButton = this.dangerZone.getByRole('button', { name: 'Reset workspace' });
    this.confirmDialog = new ConfirmDialog(page);
  }

  protected async waitUntilReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.categoryItems).toHaveCount(4);
  }

  density(option: 'Comfortable' | 'Compact'): Locator {
    return this.page.getByRole('radio', { name: option });
  }

  categoryItem(category: string): Locator {
    return this.categoryItems.filter({
      has: this.page.getByTestId('category-name').getByText(category, { exact: true }),
    });
  }

  async setThreshold(value: number): Promise<void> {
    await test.step(`Set low-stock threshold to ${value}`, async () => {
      await this.threshold.fill(String(value));
      await expect(this.thresholdValue).toHaveText(String(value));
    });
  }

  async moveCategory(category: string, direction: 'up' | 'down'): Promise<void> {
    await test.step(`Move ${category} ${direction}`, async () => {
      await this.page.getByRole('button', { name: `Move ${category} ${direction}` }).click();
    });
  }

  async dragCategory(category: string, onto: string): Promise<void> {
    await test.step(`Drag ${category} onto ${onto}`, async () => {
      await this.categoryItem(category)
        .getByTestId('drag-handle')
        .dragTo(this.categoryItem(onto), { steps: 5 });
    });
  }

  async save(): Promise<void> {
    await test.step('Save settings', async () => {
      const response = this.page.waitForResponse(
        (r) => r.url().endsWith('/api/settings') && r.request().method() === 'PUT',
      );
      await this.saveButton.click();
      expect((await response).ok(), 'PUT /api/settings should succeed').toBe(true);
    });
  }

  async resetWorkspace(): Promise<void> {
    await test.step('Reset workspace from the danger zone', async () => {
      if (!(await this.resetWorkspaceButton.isVisible())) await this.dangerZoneToggle.click();
      await this.resetWorkspaceButton.click();
      await this.confirmDialog.confirm('Reset workspace');
    });
  }
}
