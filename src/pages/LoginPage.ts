import { expect, test, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly path = '/login';
  readonly heading: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly notice: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Sign in', level: 1 });
    this.username = page.getByLabel('Username');
    this.password = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorAlert = page.getByRole('alert');
    this.notice = page.getByTestId('session-notice');
  }

  protected async waitUntilReady(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
  }

  /** Opens /login with an optional post-login destination. */
  async open(next?: string): Promise<void> {
    await this.goto(next === undefined ? '' : `?next=${encodeURIComponent(next)}`);
  }

  async login(username: string, password: string): Promise<void> {
    await test.step(`Sign in as "${username}"`, async () => {
      await this.username.fill(username);
      await this.password.fill(password);
      await this.submitButton.click();
    });
  }

  async expectFieldError(field: 'username' | 'password', message: string): Promise<void> {
    const input = field === 'username' ? this.username : this.password;
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(message);
  }
}
