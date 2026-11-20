// Shared helpers for the signed-in pages. Plain ES module, no build step.

export class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function redirectToLogin({ expired = false } = {}) {
  const params = new URLSearchParams({ next: location.pathname + location.search });
  if (expired) params.set('expired', '1');
  location.assign(`/login?${params.toString()}`);
}

/** JSON fetch wrapper. A 401 means the session ended, so we send the user to sign in. */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }

  if (response.status === 401) {
    redirectToLogin({ expired: true });
    throw new ApiError(401, 'Your session has expired');
  }

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? `Request failed (${response.status})`,
      data?.details ?? {},
    );
  }
  return data;
}

/** Tiny DOM builder. Children are appended as nodes or text, never parsed as HTML. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

export function toast(message, variant = 'success') {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = el('div', { id: 'toast-region', class: 'toast-region', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const node = el(
    'div',
    {
      class: 'toast',
      'data-testid': 'toast',
      'data-variant': variant,
      role: variant === 'error' ? 'alert' : undefined,
    },
    message,
  );
  region.append(node);
  setTimeout(() => node.remove(), variant === 'error' ? 8000 : 6000);
}

export function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export const STOCK_LABELS = { in: 'In stock', low: 'Low stock', out: 'Out of stock' };

/** Mirrors the server rule: zero is "out", at or below the threshold is "low". */
export function stockLevel(quantity, threshold) {
  if (quantity === 0) return 'out';
  if (quantity <= threshold) return 'low';
  return 'in';
}

let confirmEl;

/**
 * Accessible confirmation built on a native modal <dialog>. Resolves true when confirmed.
 * Pass `trigger` so focus returns to it: Safari does not focus buttons on click, so
 * document.activeElement is not a reliable record of what opened the dialog.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', trigger }) {
  if (!confirmEl) {
    confirmEl = el(
      'dialog',
      {
        id: 'confirm-dialog',
        class: 'confirm',
        role: 'alertdialog',
        'aria-labelledby': 'confirm-title',
        'aria-describedby': 'confirm-message',
      },
      el(
        'div',
        { class: 'dialog-body' },
        el('h2', { id: 'confirm-title' }),
        el('p', { id: 'confirm-message' }),
      ),
      el(
        'div',
        { class: 'dialog-actions' },
        el(
          'button',
          { type: 'button', class: 'btn', value: 'cancel', id: 'confirm-cancel' },
          'Cancel',
        ),
        el('button', { type: 'button', class: 'btn btn-danger', value: 'ok', id: 'confirm-ok' }),
      ),
    );
    document.body.append(confirmEl);
  }

  const returnFocus = trigger ?? document.activeElement;
  confirmEl.querySelector('#confirm-title').textContent = title;
  confirmEl.querySelector('#confirm-message').textContent = message;
  confirmEl.querySelector('#confirm-ok').textContent = confirmLabel;

  return new Promise((resolve) => {
    const onClick = (event) => {
      const button = event.target.closest('button[value]');
      if (button) confirmEl.close(button.value);
    };
    const onClose = () => {
      confirmEl.removeEventListener('click', onClick);
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
      resolve(confirmEl.returnValue === 'ok');
    };
    confirmEl.returnValue = '';
    confirmEl.addEventListener('click', onClick);
    confirmEl.addEventListener('close', onClose, { once: true });
    confirmEl.showModal();
    confirmEl.querySelector('#confirm-cancel').focus();
  });
}

/** Wires the shared header: current user name and sign-out. */
export async function initShell() {
  const logout = document.getElementById('logout-btn');
  logout?.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
    } finally {
      location.assign('/login?signedOut=1');
    }
  });

  try {
    const me = await api('/api/auth/me');
    const name = document.querySelector('[data-testid="current-user"]');
    if (name) name.textContent = me.username;
  } catch {
    // A 401 already redirected to sign in; other failures leave the placeholder.
  }
}
