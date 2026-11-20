# Playwright Suite Demo

A production-style **Playwright + TypeScript** test suite, shipped together with the app it tests:
**StockPilot**, a small inventory admin app (Express 5 + vanilla JS). The repository shows how a
maintainable end-to-end suite is put together: page objects, custom fixtures, API seeding, test
tagging, `test.step()` reporting, accessibility scans, cross-browser projects and a tiered CI
pipeline.

|             |                                                                                       |
| ----------- | ------------------------------------------------------------------------------------- |
| **Tests**   | 114 test cases → 297 runs across 5 projects (Chromium, Firefox, WebKit, Pixel 7, API) |
| **Layers**  | UI end-to-end · REST API contract · WCAG 2.1 AA accessibility · responsive reflow     |
| **Runtime** | ~2 minutes for everything locally; `@smoke` in a few seconds                          |
| **Stack**   | Playwright 1.65 · TypeScript 6 · Express 5 · axe-core · ESLint 10 · Node 24           |

---

## Quick start

```bash
git clone https://github.com/PlaywrightMasters/Playwright-Suite-Demo.git
cd Playwright-Suite-Demo
npm ci
npx playwright install --with-deps   # browsers (+ OS deps on Linux)
npm test                              # starts the app automatically and runs everything
npm run test:report                   # open the HTML report
```

Playwright's `webServer` starts StockPilot on `http://localhost:3210` for you. To explore the app
yourself, run `npm start` and sign in with **admin / stockpilot123**.

Optional: copy `.env.example` to `.env` to change the port or credentials.

---

## Running tests

```bash
# Tiers
npm run test:smoke          # fastest signal: pages load, auth guard, seed data
npm run test:critical       # core flows: sign in/out, add/edit/delete, status, settings
npm run test:regression     # everything else

# Layers
npm run test:e2e            # browser tests (all browser projects)
npm run test:api            # API contract tests, no browser
npm run test:a11y           # axe-core WCAG 2.1 AA scans + keyboard + reflow (Chromium)

# Features
npx playwright test --grep @inventory
npx playwright test --grep "@edit|@status"

# Browsers
npx playwright test --project=chromium
npx playwright test --project=webkit
npx playwright test --project=mobile-chrome

# Debugging
npm run test:headed         # watch it run in Chromium
npm run test:ui             # Playwright UI mode with time-travel
npx playwright test --debug tests/e2e/inventory.spec.ts

# Quality gates (same as CI)
npm run check               # lint + typecheck + format:check
```

---

## Project structure

```
app/                         StockPilot, the application under test
├── server.ts                entry point (PORT, .env)
├── app.ts                   Express app: security headers, JSON errors
├── auth.ts                  session cookie / Bearer token auth, safe redirects
├── store.ts                 domain types, seed data, per-session workspaces
├── validation.ts            product and settings validation rules
├── csv.ts                   RFC 4180 CSV writer with formula-injection guard
├── routes/                  REST API and page routes
├── views/                   login, inventory, reports, settings (HTML)
└── public/                  CSS and browser ES modules

src/                         test framework
├── fixtures/index.ts        custom fixtures (session, authedApi, authedPage, page objects)
├── pages/                   page objects + components (ProductFormDialog, ConfirmDialog)
├── api/                     typed API client and the expected API contract
└── utils/                   test data builders, axe helpers, CSV parser

tests/
├── e2e/                     auth, inventory, edit, filters, status toggle, reports, settings
├── api/                     auth, products, reports & settings contracts
└── accessibility/           axe scans, keyboard/focus behaviour, 320 px reflow

scripts/demo.mjs             break/fix scenarios for live demos
.github/workflows/           tiered PR pipeline + nightly sharded run
```

---

## The app under test

StockPilot has four pages behind a sign-in:

| Page          | What it exercises                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Login**     | client + server validation, error alert, `?next=` redirect with open-redirect protection, expired-session notice                                                                                                 |
| **Inventory** | KPI cards, debounced search, category and status filters synced to the URL, sortable columns, add/edit modal (`<dialog>`), confirm-before-delete, optimistic status switch with rollback, empty and error states |
| **Reports**   | summary stats, stock by category, filterable activity log, CSV export as a file download                                                                                                                         |
| **Settings**  | range slider, select, radios, checkboxes, drag-and-drop **and** keyboard reordering, unsaved-changes tracking, collapsible danger zone with workspace reset                                                      |

The REST API lives under `/api` (`/health`, `/auth/*`, `/products`, `/reports/*`, `/settings`,
`/workspace/reset`). Browsers authenticate with an `HttpOnly; SameSite=Lax` cookie; API clients send
a Bearer token. Mutating requests must be JSON (`415` otherwise).

### Isolated sandbox workspaces

**Every sign-in gets its own freshly seeded workspace.** This is the key design decision that makes
the suite fast and reliable:

- tests run `fullyParallel` across workers and browsers without seeing each other's changes;
- there is no cleanup code, no test ordering, and no shared-state flakiness;
- every test can assert exact numbers (e.g. "8 products, inventory value $13,709.80").

---

## Test architecture

### Fixtures

`src/fixtures/index.ts` extends Playwright's `test` with:

| Fixture                                                     | Provides                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `api`                                                       | unauthenticated typed API client                                                     |
| `session`                                                   | a fresh signed-in session (API login → new seeded workspace); logged out on teardown |
| `authedApi`                                                 | API client bound to `session`: seed or verify data the browser will see              |
| `authedPage`                                                | the browser `page` carrying the same session cookie (no UI login needed)             |
| `loginPage`, `inventoryPage`, `reportsPage`, `settingsPage` | page objects on that page                                                            |

Because `authedApi` and `authedPage` share one workspace, a test can **arrange through the API and
assert through the UI** (or the reverse):

```ts
test('deletes a product after confirmation', async ({ inventoryPage, authedApi }) => {
  const product = buildProduct({ name: 'Disposable Item' });
  await authedApi.createProduct(product); // arrange via API
  await inventoryPage.goto();

  await inventoryPage.deleteProduct(product.name); // act via UI

  await inventoryPage.expectToast(`${product.name} deleted`);
  expect((await authedApi.listProducts({ search: product.sku })).body).toHaveLength(0);
});
```

### Page objects and `test.step()`

Page objects in `src/pages/` expose intent-level methods (`addProduct`, `filterByCategory`,
`resetWorkspace`). Each is wrapped in `test.step()`, so the HTML report and trace viewer show a
readable story instead of raw locator calls. Methods that trigger requests wait on the specific
response (`page.waitForResponse`) instead of sleeping.

### Locator strategy

1. Role and label first: `getByRole('switch', { name: 'Active: Team Hoodie' })`, `getByLabel('SKU')`.
2. `data-testid` only for structure without a good accessible name (rows, KPI values, toasts).
3. Field errors are asserted with `toHaveAccessibleDescription`, which also proves they are wired
   to the input through `aria-describedby`.

### Other techniques on show

- **Network mocking** with `page.route`: forcing 503/500 responses to test error states and
  optimistic-update rollback, and holding a request open to observe pending UI.
- **Downloads**: capturing the CSV with `waitForEvent('download')` and parsing it.
- **Data-driven tests**: one generated API test per validation rule.
- **Keyboard and focus**: skip link, modal focus containment, focus return after dialogs.
- **Drag and drop** with `locator.dragTo()` alongside the keyboard alternative.

---

## Tag taxonomy

Every test has exactly one **tier** tag plus one or more **feature** tags.

| Tier          | Meaning                                             | Count    |
| ------------- | --------------------------------------------------- | -------- |
| `@smoke`      | is the app alive? pages load, auth guard, seed data | 23 runs  |
| `@critical`   | core flows that block all other work if broken      | 45 runs  |
| `@regression` | everything else, the broad safety net               | 229 runs |

| Feature      | Scope                             |
| ------------ | --------------------------------- |
| `@auth`      | sign in/out, redirects, sessions  |
| `@inventory` | inventory table, KPIs, add/delete |
| `@edit`      | edit dialog                       |
| `@filter`    | search, filters, URL state        |
| `@status`    | active/archived switch            |
| `@reports`   | reports page and CSV export       |
| `@settings`  | preferences, reordering, reset    |
| `@api`       | REST contract tests               |
| `@a11y`      | accessibility                     |

---

## Accessibility

`tests/accessibility/a11y.spec.ts` uses [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm)
to scan every page, including states that are easy to miss (the login error, the product dialog
with validation errors, the open danger zone). The full axe JSON is attached to the report. The
suite also checks keyboard behaviour and that every page reflows at **320 CSS px** without
horizontal scrolling (WCAG 1.4.10). That reflow check caught a real bug while this suite was being
built: a visually hidden table header escaped its scroll container and widened the page on phones.

---

## CI/CD

`.github/workflows/playwright.yml`:

| Job                           | Runs on                                           | Scope                                                      |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **Lint · typecheck · format** | every push and PR                                 | ESLint (incl. `eslint-plugin-playwright`), `tsc`, Prettier |
| **Smoke**                     | every push and PR                                 | `@smoke` on Chromium + API                                 |
| **Critical**                  | PRs and `main`                                    | `@critical` on all 5 projects (matrix)                     |
| **Regression**                | PRs into `main` and `main`, after Critical passes | `@regression` on all 5 projects                            |

`.github/workflows/nightly.yml` runs the whole suite every night in 3 shards and merges the blob
reports into one HTML report. Every job uploads its report as an artifact, including on failure.
On CI, failed tests retry twice and record a trace on the first retry. Make **Critical** a required
status check in branch protection to block merges on core-flow failures.

---

## Demo: break it, catch it, fix it

`scripts/demo.mjs` introduces realistic regressions to show which layer catches what:

```bash
npm run demo:break -- toast        # UI copy regression
npm run demo:break -- validation   # API rule regression
npm run demo:status
npm run demo:fix                   # revert everything
```

| Scenario     | What changes                                                      | What catches it                                                                                                   |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `toast`      | success toast says "Product created…" instead of "Product added…" | 2 `@critical` E2E tests; all API tests stay green                                                                 |
| `validation` | the API stops rejecting negative prices                           | `Products API › rejects negative price`; all E2E tests stay green because the form still validates in the browser |

A typical live demo: break → push → smoke passes → open a PR → **Critical** fails and blocks the
merge → open the report artifact and read the step tree ("Expected: Product added successfully /
Received: Product created successfully") → fix → green.

---

## Troubleshooting

- **Port already in use**: set `PORT` in `.env`. Locally an already-running server is reused.
- **Browsers missing**: `npx playwright install --with-deps`.
- **Investigating a failure**: `npm run test:report`, then open the trace, screenshot and video
  attached to the failed test.

## License

[MIT](LICENSE)
