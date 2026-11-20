import { test as base, expect, type Page } from '@playwright/test';
import { StockPilotApi } from '../api/StockPilotApi';
import type { LoginResponse } from '../api/types';
import { InventoryPage } from '../pages/InventoryPage';
import { LoginPage } from '../pages/LoginPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { CREDENTIALS } from '../utils/testData';

export const SESSION_COOKIE = 'sp_session';

type Fixtures = {
  /** API client without credentials, for auth and contract tests. */
  api: StockPilotApi;
  /**
   * A fresh signed-in session. The app gives every session its own seeded
   * workspace, so each test starts from identical data and never sees
   * changes made by tests running in parallel.
   */
  session: LoginResponse;
  /** API client bound to `session`: seed or inspect data the browser will see. */
  authedApi: StockPilotApi;
  /** Browser page carrying the same session cookie as `authedApi`. */
  authedPage: Page;
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  reportsPage: ReportsPage;
  settingsPage: SettingsPage;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new StockPilotApi(request));
  },

  session: async ({ request }, use) => {
    const api = new StockPilotApi(request);
    const response = await api.login(CREDENTIALS.username, CREDENTIALS.password);
    expect(response.status, `fixture login failed: ${response.body.error ?? ''}`).toBe(200);

    await use(response.body);

    // Free the workspace. Ignore 401: the test itself may have signed out.
    api.setToken(response.body.token);
    await api.logout();
  },

  authedApi: async ({ request, session }, use) => {
    await use(new StockPilotApi(request, session.token));
  },

  authedPage: async ({ page, session, baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL must be configured in playwright.config.ts');
    // Sign in by cookie instead of the UI: faster, and the login form has its own tests.
    await page.context().addCookies([
      {
        name: SESSION_COOKIE,
        value: session.token,
        url: baseURL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  inventoryPage: async ({ authedPage }, use) => {
    await use(new InventoryPage(authedPage));
  },

  reportsPage: async ({ authedPage }, use) => {
    await use(new ReportsPage(authedPage));
  },

  settingsPage: async ({ authedPage }, use) => {
    await use(new SettingsPage(authedPage));
  },
});

export { expect };
