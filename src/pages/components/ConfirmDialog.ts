import { test, type Locator, type Page } from '@playwright/test';

/** Shared confirmation modal (role="alertdialog") used for destructive actions. */
export class ConfirmDialog {
  readonly root: Locator;
  readonly message: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog');
    this.message = this.root.locator('#confirm-message');
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' });
  }

  async confirm(label: string): Promise<void> {
    await test.step(`Confirm "${label}"`, async () => {
      await this.root.getByRole('button', { name: label }).click();
    });
  }

  async cancel(): Promise<void> {
    await test.step('Cancel confirmation', async () => {
      await this.cancelButton.click();
    });
  }
}
