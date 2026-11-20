import { expect, test } from '../../src/fixtures';
import { CATEGORIES, SEED, buildProduct, uniqueSku } from '../../src/utils/testData';

test.describe('Products API', { tag: '@api' }, () => {
  test('lists the seeded products sorted by name', { tag: '@smoke' }, async ({ authedApi }) => {
    const response = await authedApi.listProducts();

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(SEED.totalProducts);
    const names = response.body.map((p) => p.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    );
  });

  test(
    'creates a product and returns its location',
    { tag: '@critical' },
    async ({ authedApi }) => {
      const input = buildProduct({ category: 'Apparel', price: 12.5, quantity: 3 });
      const response = await authedApi.createProduct(input);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ ...input, id: expect.any(Number) });
      expect(response.headers['location']).toBe(`/api/products/${response.body.id}`);

      const fetched = await authedApi.getProduct(response.body.id);
      expect(fetched.body).toEqual(response.body);
    },
  );

  test(
    'defaults status to active and trims text',
    { tag: '@regression' },
    async ({ authedApi }) => {
      const sku = uniqueSku();
      const response = await authedApi.createProduct({
        sku,
        name: '  Padded Name  ',
        category: 'Furniture',
        price: 5,
        quantity: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('active');
      expect(response.body.name).toBe('Padded Name');
    },
  );

  // Data-driven negative tests: one payload per rule, each asserting the exact field error.
  const invalidCases: Array<{
    title: string;
    patch: Record<string, unknown>;
    field: string;
    error: string;
  }> = [
    { title: 'missing name', patch: { name: undefined }, field: 'name', error: 'Name is required' },
    {
      title: 'one-letter name',
      patch: { name: 'X' },
      field: 'name',
      error: 'Name must be between 2 and 80 characters',
    },
    {
      title: 'lowercase SKU',
      patch: { sku: 'qa-123' },
      field: 'sku',
      error: 'SKU must look like SP-1234 (2–4 capital letters, a dash, 3–6 digits)',
    },
    {
      title: 'unknown category',
      patch: { category: 'Toys' },
      field: 'category',
      error: 'Choose a valid category',
    },
    {
      title: 'negative price',
      patch: { price: -1 },
      field: 'price',
      error: 'Price must be between 0 and 1,000,000',
    },
    {
      title: 'price as a string',
      patch: { price: '9.99' },
      field: 'price',
      error: 'Price must be between 0 and 1,000,000',
    },
    {
      title: 'three-decimal price',
      patch: { price: 1.999 },
      field: 'price',
      error: 'Price can have at most 2 decimal places',
    },
    {
      title: 'fractional quantity',
      patch: { quantity: 1.5 },
      field: 'quantity',
      error: 'Quantity must be a whole number between 0 and 100,000',
    },
    {
      title: 'quantity over the limit',
      patch: { quantity: 100_001 },
      field: 'quantity',
      error: 'Quantity must be a whole number between 0 and 100,000',
    },
    {
      title: 'unknown status',
      patch: { status: 'deleted' },
      field: 'status',
      error: 'Status must be active or archived',
    },
  ];

  for (const { title, patch, field, error } of invalidCases) {
    test(`rejects ${title}`, { tag: '@regression' }, async ({ authedApi }) => {
      const response = await authedApi.createProduct({ ...buildProduct(), ...patch });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual({ [field]: error });
    });
  }

  test('rejects a duplicate SKU with 409', { tag: '@regression' }, async ({ authedApi }) => {
    const response = await authedApi.createProduct(buildProduct({ sku: SEED.products.mouse.sku }));

    expect(response.status).toBe(409);
    expect(response.body.details).toEqual({ sku: 'SKU is already in use' });
  });

  test(
    'PUT replaces a product and requires every field',
    { tag: '@regression' },
    async ({ authedApi }) => {
      const { body: created } = await authedApi.createProduct(buildProduct());
      const replacement = buildProduct({ sku: created.sku, name: 'Replaced', status: 'archived' });

      const ok = await authedApi.replaceProduct(created.id, replacement);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject(replacement);

      const partial = await authedApi.replaceProduct(created.id, { name: 'Only a name' });
      expect(partial.status).toBe(400);
      expect(Object.keys(partial.body.details ?? {})).toEqual(
        expect.arrayContaining(['sku', 'category', 'price', 'quantity', 'status']),
      );
    },
  );

  test('PATCH updates only the given fields', { tag: '@regression' }, async ({ authedApi }) => {
    const { body: created } = await authedApi.createProduct(buildProduct({ quantity: 50 }));

    const response = await authedApi.patchProduct(created.id, { quantity: 7 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ...created, quantity: 7, updatedAt: expect.any(String) });
  });

  test('PATCH with no known fields is a 400', { tag: '@regression' }, async ({ authedApi }) => {
    const { body: created } = await authedApi.createProduct(buildProduct());

    const response = await authedApi.patchProduct(created.id, { colour: 'red' });

    expect(response.status).toBe(400);
    expect(response.body.details?.['body']).toMatch(/^Provide at least one of/);
  });

  test('DELETE removes the product', { tag: '@critical' }, async ({ authedApi }) => {
    const { body: created } = await authedApi.createProduct(buildProduct());

    expect((await authedApi.deleteProduct(created.id)).status).toBe(204);
    expect((await authedApi.getProduct(created.id)).status).toBe(404);
    expect((await authedApi.deleteProduct(created.id)).status).toBe(404);
  });

  test('unknown or malformed ids return 404', { tag: '@regression' }, async ({ authedApi }) => {
    expect((await authedApi.getProduct(999_999)).status).toBe(404);
    expect((await authedApi.patchProduct(Number.NaN, { quantity: 1 })).status).toBe(404);
  });

  test.describe('querying', () => {
    test('filters by category', { tag: '@regression' }, async ({ authedApi }) => {
      for (const category of CATEGORIES) {
        const { body } = await authedApi.listProducts({ category });
        expect(body, category).toHaveLength(SEED.productsByCategory[category]);
        expect(body.every((p) => p.category === category)).toBe(true);
      }
    });

    test('filters by status', { tag: '@regression' }, async ({ authedApi }) => {
      const archived = await authedApi.listProducts({ status: 'archived' });
      expect(archived.body.map((p) => p.sku)).toEqual([SEED.products.pens.sku]);

      const active = await authedApi.listProducts({ status: 'active' });
      expect(active.body).toHaveLength(SEED.activeProducts);
    });

    test(
      'searches name and SKU case-insensitively',
      { tag: '@regression' },
      async ({ authedApi }) => {
        const byName = await authedApi.listProducts({ search: 'HOODIE' });
        expect(byName.body.map((p) => p.sku)).toEqual([SEED.products.hoodie.sku]);

        const bySku = await authedApi.listProducts({ search: 'sp-20' });
        expect(bySku.body).toHaveLength(2);
      },
    );

    test('sorts by quantity descending', { tag: '@regression' }, async ({ authedApi }) => {
      const { body } = await authedApi.listProducts({ sort: 'quantity', order: 'desc' });
      const quantities = body.map((p) => p.quantity);

      expect(quantities).toEqual([...quantities].sort((a, b) => b - a));
      expect(body[0]?.sku).toBe(SEED.products.notebook.sku);
    });

    test('rejects unknown filter values', { tag: '@regression' }, async ({ authedApi }) => {
      const response = await authedApi.listProducts({ category: 'Toys', sort: 'colour' });

      expect(response.status).toBe(400);
      expect(Object.keys(response.body.details ?? {}).sort()).toEqual(['category', 'sort']);
    });
  });
});
