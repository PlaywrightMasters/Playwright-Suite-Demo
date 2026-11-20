import { expect, test, type Locator, type Page } from '@playwright/test';

export abstract class BasePage {
  abstract readonly path: string;
  readonly toasts: Locator;

  constructor(readonly page: Page) {
    this.toasts = page.getByTestId('toast');
  }

  /** Opens the page (optionally with a query string) and waits until it is usable. */
  async goto(query = ''): Promise<void> {
    await test.step(`Open ${this.path}${query}`, async () => {
      await this.page.goto(`${this.path}${query}`);
      await this.waitUntilReady();
    });
  }

  protected abstract waitUntilReady(): Promise<void>;

  /** Asserts on the most recent toast, so the report shows expected vs. received copy. */
  async expectToast(text: string | RegExp): Promise<void> {
    await test.step(`Expect toast: ${String(text)}`, async () => {
      await expect(this.toasts.last()).toHaveText(text);
    });
  }
}

export type Section = 'Inventory' | 'Reports' | 'Settings';

/** Pages behind sign-in share the header: navigation, current user and sign out. */
export abstract class AppPage extends BasePage {
  readonly nav: Locator;
  readonly currentUser: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.getByRole('navigation', { name: 'Main' });
    this.currentUser = page.getByTestId('current-user');
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
  }

  navLink(section: Section): Locator {
    return this.nav.getByRole('link', { name: section, exact: true });
  }

  async navigateTo(section: Section): Promise<void> {
    await test.step(`Navigate to ${section}`, async () => {
      await this.navLink(section).click();
      await expect(this.page).toHaveURL(new RegExp(`/${section.toLowerCase()}(\\?|$)`));
    });
  }

  async signOut(): Promise<void> {
    await test.step('Sign out', async () => {
      await this.signOutButton.click();
      await expect(this.page).toHaveURL(/\/login\?signedOut=1$/);
    });
  }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
