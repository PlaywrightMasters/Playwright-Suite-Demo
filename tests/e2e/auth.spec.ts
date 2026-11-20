import { expect, test } from '../../src/fixtures';
import { InventoryPage } from '../../src/pages/InventoryPage';
import { CREDENTIALS } from '../../src/utils/testData';

test.describe('Authentication', { tag: '@auth' }, () => {
  test(
    'redirects signed-out visitors to sign in and remembers the page',
    { tag: '@smoke' },
    async ({ page, loginPage }) => {
      await page.goto('/reports');

      await expect(page).toHaveURL('/login?next=%2Freports');
      await expect(loginPage.heading).toBeVisible();
      await expect(loginPage.username).toBeEditable();
      await expect(loginPage.submitButton).toBeEnabled();
    },
  );

  test(
    'signs in with valid credentials and lands on inventory',
    { tag: '@critical' },
    async ({ page, loginPage }) => {
      await loginPage.open();
      await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);

      const inventory = new InventoryPage(page);
      await expect(page).toHaveURL('/inventory');
      await expect(inventory.heading).toBeVisible();
      await expect(inventory.currentUser).toHaveText(CREDENTIALS.username);
    },
  );

  test(
    'rejects a wrong password without leaving the page',
    { tag: '@critical' },
    async ({ page, loginPage }) => {
      await loginPage.open();
      await loginPage.login(CREDENTIALS.username, 'not-the-password');

      await expect(loginPage.errorAlert).toHaveText('Invalid username or password');
      await expect(page).toHaveURL(/\/login/);
      await expect(loginPage.password).toHaveValue('');
      await expect(loginPage.password).toBeFocused();
    },
  );

  test(
    'validates empty fields in the browser before calling the API',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      let loginRequests = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/api/auth/login')) loginRequests++;
      });

      await loginPage.open();
      await loginPage.submitButton.click();

      await loginPage.expectFieldError('username', 'Enter your username');
      await loginPage.expectFieldError('password', 'Enter your password');
      await expect(loginPage.username).toBeFocused();
      expect(loginRequests, 'no login request should be sent').toBe(0);
    },
  );

  test(
    'returns to the requested page after signing in',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      await loginPage.open('/settings');
      await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);

      await expect(page).toHaveURL('/settings');
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    },
  );

  // Open redirect protection: none of these may leave the site after sign-in.
  const hostileTargets = [
    { name: 'absolute URL', next: 'https://evil.example/phish' },
    { name: 'protocol-relative URL', next: '//evil.example/phish' },
    // Browsers strip tabs and newlines from URLs, turning this into //evil.example.
    { name: 'tab-smuggled URL', next: '/\t/evil.example/phish' },
    // Browsers treat "\" like "/" in URLs, turning this into //evil.example too.
    { name: 'backslash URL', next: '/\\evil.example/phish' },
  ];
  for (const { name, next } of hostileTargets) {
    test(
      `ignores a hostile redirect target: ${name}`,
      { tag: '@regression' },
      async ({ page, loginPage }) => {
        await loginPage.open(next);
        await loginPage.login(CREDENTIALS.username, CREDENTIALS.password);

        await expect(page).toHaveURL('/inventory');
      },
    );
  }

  test(
    'a signed-in user with ?next=/login is not caught in a redirect loop',
    { tag: '@regression' },
    async ({ authedPage }) => {
      await authedPage.goto('/login?next=%2Flogin');

      await expect(authedPage).toHaveURL('/inventory');
    },
  );

  test(
    'sends already signed-in users from /login to inventory',
    { tag: '@regression' },
    async ({ authedPage }) => {
      await authedPage.goto('/login');

      await expect(authedPage).toHaveURL('/inventory');
    },
  );

  test('signing out ends the session', { tag: '@critical' }, async ({ inventoryPage, page }) => {
    await inventoryPage.goto();
    await inventoryPage.signOut();

    const loginNotice = page.getByTestId('session-notice');
    await expect(loginNotice).toHaveText('You have been signed out.');

    // The old session cookie is gone, so protected pages bounce back to sign in.
    await page.goto('/inventory');
    await expect(page).toHaveURL('/login?next=%2Finventory');
  });

  test(
    'an expired session sends the user to sign in with a notice',
    { tag: '@regression' },
    async ({ inventoryPage, authedApi, loginPage, page }) => {
      await inventoryPage.goto();

      // Simulate the session ending server-side (expiry, revocation, sign-out elsewhere).
      await authedApi.logout();
      await inventoryPage.addProductButton.click();
      await inventoryPage.productForm.fill({
        name: 'Should not save',
        sku: 'QA-100001',
        category: 'Apparel',
        price: 1,
        quantity: 1,
      });
      await inventoryPage.productForm.save();

      await expect(page).toHaveURL(/\/login\?.*expired=1/);
      await expect(loginPage.notice).toHaveText('Your session has expired. Please sign in again.');
    },
  );
});
