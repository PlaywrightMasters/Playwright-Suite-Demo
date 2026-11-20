const params = new URLSearchParams(location.search);

const form = document.getElementById('login-form');
const username = document.getElementById('username');
const password = document.getElementById('password');
const submit = document.getElementById('login-submit');
const formError = document.getElementById('login-error');
const notice = document.getElementById('session-notice');

/**
 * Only same-origin destinations are allowed, which prevents open redirects via ?next=.
 * The value is resolved with the browser's own URL parser, so tricks it would normalise
 * ("/\t/evil.example", "/\\evil.example") are judged by where they really lead.
 */
function safeNext(raw) {
  if (!raw || !raw.startsWith('/')) return null;
  let url;
  try {
    url = new URL(raw, location.origin);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/login')) return null;
  return url.pathname + url.search + url.hash;
}

if (params.get('expired') === '1') {
  notice.textContent = 'Your session has expired. Please sign in again.';
  notice.hidden = false;
} else if (params.get('signedOut') === '1') {
  notice.textContent = 'You have been signed out.';
  notice.hidden = false;
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  error.textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

  const user = username.value.trim();
  const pass = password.value;
  setFieldError(username, user ? '' : 'Enter your username');
  setFieldError(password, pass ? '' : 'Enter your password');
  if (!user || !pass) {
    (user ? password : username).focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (response.ok) {
      location.assign(safeNext(params.get('next')) ?? '/inventory');
      return;
    }
    const data = await response.json().catch(() => ({}));
    formError.textContent =
      response.status === 401
        ? (data.error ?? 'Invalid username or password')
        : 'Something went wrong. Please try again.';
    password.value = '';
    password.focus();
  } catch {
    formError.textContent = 'Network error. Check your connection and try again.';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});
