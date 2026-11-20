import { expect, test } from '../../src/fixtures';
import { StockPilotApi } from '../../src/api/StockPilotApi';
import { CREDENTIALS, buildProduct } from '../../src/utils/testData';

test.describe('Auth API', { tag: ['@api', '@auth'] }, () => {
  test('health check is public and reports ok', { tag: '@smoke' }, async ({ api }) => {
    const response = await api.health();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', version: expect.any(String) });
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test(
    'login returns a token and sets a hardened session cookie',
    { tag: '@critical' },
    async ({ api }) => {
      const response = await api.login(CREDENTIALS.username, CREDENTIALS.password);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        token: expect.stringMatching(/^[0-9a-f-]{36}$/),
        username: CREDENTIALS.username,
      });
      expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());

      const cookie = response.headers['set-cookie'] ?? '';
      expect(cookie).toContain(`sp_session=${response.body.token}`);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    },
  );

  test('login rejects wrong credentials with 401', { tag: '@regression' }, async ({ api }) => {
    const response = await api.login(CREDENTIALS.username, 'wrong-password');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid username or password' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('login requires both fields', { tag: '@regression' }, async ({ api }) => {
    const response = await api.login('', '');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Username and password are required');
  });

  test(
    'protected endpoints reject missing and invalid tokens',
    { tag: '@critical' },
    async ({ api }) => {
      expect((await api.listProducts()).status).toBe(401);

      api.setToken('00000000-0000-0000-0000-000000000000');
      const response = await api.listProducts();
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    },
  );

  test('/auth/me identifies the signed-in user', { tag: '@regression' }, async ({ authedApi }) => {
    const response = await authedApi.me();

    expect(response.status).toBe(200);
    expect(response.body.username).toBe(CREDENTIALS.username);
  });

  test('logout revokes the token', { tag: '@regression' }, async ({ authedApi }) => {
    expect((await authedApi.logout()).status).toBe(204);

    expect((await authedApi.me()).status).toBe(401);
  });

  test(
    'every session gets its own isolated workspace',
    { tag: '@regression' },
    async ({ authedApi, request }) => {
      const product = buildProduct();
      expect((await authedApi.createProduct(product)).status).toBe(201);

      const other = new StockPilotApi(request);
      const login = await other.login(CREDENTIALS.username, CREDENTIALS.password);
      other.setToken(login.body.token);

      const fromOtherSession = await other.listProducts({ search: product.sku });
      expect(fromOtherSession.body).toEqual([]);
      await other.logout();
    },
  );

  test('mutations must be sent as JSON', { tag: '@regression' }, async ({ request, session }) => {
    const response = await request.post('/api/products', {
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: 'name=Sneaky&sku=QA-123',
    });

    expect(response.status()).toBe(415);
    expect(await response.json()).toEqual({ error: 'Content-Type must be application/json' });
  });

  test(
    'malformed JSON returns 400 without leaking internals',
    { tag: '@regression' },
    async ({ request, session }) => {
      const response = await request.post('/api/products', {
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        data: '{"name": ',
      });

      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: 'Malformed JSON body' });
    },
  );
});
