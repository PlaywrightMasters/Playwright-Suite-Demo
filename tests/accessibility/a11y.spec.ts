import type { Page } from '@playwright/test';
import { expect, test } from '../../src/fixtures';
import { formatViolations, scanA11y } from '../../src/utils/accessibility';

test.describe('Accessibility (WCAG 2.1 AA)', { tag: ['@a11y', '@regression'] }, () => {
  test('login page has no violations', async ({ loginPage, page }, testInfo) => {
    await loginPage.open();

    const violations = await scanA11y(page, testInfo);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('login page with validation errors has no violations', async ({
    loginPage,
    page,
  }, testInfo) => {
    await loginPage.open();
    await loginPage.login('admin', 'wrong-password');
    await expect(loginPage.errorAlert).toBeVisible();

    const violations = await scanA11y(page, testInfo);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('inventory page has no violations', async ({ inventoryPage, page }, testInfo) => {
    await inventoryPage.goto();

    const violations = await scanA11y(page, testInfo);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('add product dialog with errors has no violations', async ({
    inventoryPage,
    page,
  }, testInfo) => {
    await inventoryPage.goto();
    await inventoryPage.addProductButton.click();
    await inventoryPage.productForm.save();
    await inventoryPage.productForm.expectFieldError('name', 'Name is required');

    const violations = await scanA11y(page, testInfo, { include: ['#product-dialog'] });
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('reports page has no violations', async ({ reportsPage, page }, testInfo) => {
    await reportsPage.goto();

    const violations = await scanA11y(page, testInfo);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('settings page has no violations', async ({ settingsPage, page }, testInfo) => {
    await settingsPage.goto();
    await settingsPage.dangerZoneToggle.click();

    const violations = await scanA11y(page, testInfo);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('skip link moves focus to the main content', async ({ inventoryPage, page }) => {
    await inventoryPage.goto();

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
  });

  test('the product dialog keeps focus off the page behind it and restores it on close', async ({
    inventoryPage,
    page,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addProductButton.click();

    const dialog = inventoryPage.productForm.root;
    await expect(inventoryPage.productForm.field('name')).toBeFocused();
    // A modal makes the rest of the page inert: tabbing must never reach it.
    const backgroundFocus = page.locator('header :focus, main :focus');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await expect(backgroundFocus).toHaveCount(0);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(inventoryPage.addProductButton).toBeFocused();
  });

  test.describe('reflow at 320 CSS pixels (WCAG 1.4.10)', () => {
    test.use({ viewport: { width: 320, height: 720 } });

    const horizontalOverflow = (page: Page): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

    test('login page does not scroll horizontally', async ({ loginPage, page }) => {
      await loginPage.open();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    // Each page is measured after its data has rendered (the test id marks loaded content).
    const pages = [
      { path: '/inventory', loaded: 'product-row' },
      { path: '/reports', loaded: 'category-row' },
      { path: '/settings', loaded: 'category-order-item' },
    ];
    for (const { path, loaded } of pages) {
      test(`${path} does not scroll horizontally`, async ({ authedPage }) => {
        await authedPage.goto(path);
        await expect(authedPage.getByTestId(loaded).first()).toBeVisible();
        expect(await horizontalOverflow(authedPage)).toBeLessThanOrEqual(0);
      });
    }
  });
});
