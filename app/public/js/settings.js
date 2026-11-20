import { api, confirmDialog, el, initShell, toast } from './common.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#settings-form');
const threshold = $('#threshold');
const thresholdValue = $('#threshold-value');
const currency = $('#currency');
const emailAlerts = $('#email-alerts');
const dailyDigest = $('#daily-digest');
const orderList = $('#category-order');
const orderStatus = $('#order-status');
const saveButton = $('#save-settings');
const discardButton = $('#discard-settings');
const unsaved = $('#unsaved-indicator');
const resetButton = $('#reset-workspace');

let saved = null;

// ── Form <-> settings ───────────────────────────────────────────────────────

function currentOrder() {
  return [...orderList.children].map((li) => li.dataset.category);
}

function readForm() {
  return {
    lowStockThreshold: Number(threshold.value),
    currency: currency.value,
    density: form.elements.density.value,
    emailAlerts: emailAlerts.checked,
    dailyDigest: dailyDigest.checked,
    categoryOrder: currentOrder(),
  };
}

function populate(settings) {
  threshold.value = String(settings.lowStockThreshold);
  thresholdValue.textContent = String(settings.lowStockThreshold);
  currency.value = settings.currency;
  form.elements.density.value = settings.density;
  emailAlerts.checked = settings.emailAlerts;
  dailyDigest.checked = settings.dailyDigest;
  renderOrder(settings.categoryOrder);
  updateDirty();
}

function isDirty() {
  if (!saved) return false;
  const current = readForm();
  return Object.keys(current).some(
    (key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]),
  );
}

function updateDirty() {
  const dirty = isDirty();
  unsaved.hidden = !dirty;
  discardButton.disabled = !dirty;
}

// ── Sortable category list (pointer drag + keyboard buttons) ────────────────

function renderOrder(order) {
  orderList.replaceChildren(
    ...order.map((category, index) =>
      el(
        'li',
        { 'data-testid': 'category-order-item', 'data-category': category },
        el(
          'span',
          {
            class: 'drag-handle',
            'data-drag-handle': true,
            'data-testid': 'drag-handle',
            'aria-hidden': 'true',
          },
          '⠿',
        ),
        el('span', { class: 'item-name', 'data-testid': 'category-name' }, category),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'data-move': 'up',
            'aria-label': `Move ${category} up`,
            disabled: index === 0,
          },
          '↑',
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'data-move': 'down',
            'aria-label': `Move ${category} down`,
            disabled: index === order.length - 1,
          },
          '↓',
        ),
      ),
    ),
  );
}

function announceMove(category) {
  const order = currentOrder();
  orderStatus.textContent = `${category} moved to position ${order.indexOf(category) + 1} of ${order.length}`;
}

orderList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-move]');
  if (!button) return;
  const item = button.closest('li');
  const category = item.dataset.category;
  const direction = button.dataset.move;
  const order = currentOrder();
  const from = order.indexOf(category);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= order.length) return;
  order.splice(from, 1);
  order.splice(to, 0, category);
  renderOrder(order);

  // Keep keyboard focus on the moved item, falling back to its other arrow.
  const moved = orderList.querySelector(`li[data-category="${CSS.escape(category)}"]`);
  const same = moved.querySelector(`button[data-move="${direction}"]`);
  const other = moved.querySelector(`button[data-move="${direction === 'up' ? 'down' : 'up'}"]`);
  (same.disabled ? other : same).focus();
  announceMove(category);
  updateDirty();
});

let dragging = null;

orderList.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle) return;
  event.preventDefault();
  dragging = handle.closest('li');
  dragging.classList.add('is-dragging');
  handle.setPointerCapture(event.pointerId);
});

orderList.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const over = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest('#category-order > li');
  if (!over || over === dragging) return;
  const items = [...orderList.children];
  if (items.indexOf(over) > items.indexOf(dragging)) over.after(dragging);
  else over.before(dragging);
});

function endDrag() {
  if (!dragging) return;
  const category = dragging.dataset.category;
  dragging.classList.remove('is-dragging');
  dragging = null;
  renderOrder(currentOrder()); // refresh disabled state of the arrow buttons
  announceMove(category);
  updateDirty();
}

orderList.addEventListener('pointerup', endDrag);
orderList.addEventListener('pointercancel', endDrag);

// ── Save, discard, reset ────────────────────────────────────────────────────

threshold.addEventListener('input', () => {
  thresholdValue.textContent = threshold.value;
  updateDirty();
});
form.addEventListener('change', updateDirty);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  try {
    saved = await api('/api/settings', { method: 'PUT', body: readForm() });
    populate(saved);
    toast('Settings saved');
  } catch (error) {
    if (error.status !== 401) toast(error.message, 'error');
  } finally {
    saveButton.disabled = false;
  }
});

discardButton.addEventListener('click', () => {
  populate(saved);
  toast('Changes discarded');
});

resetButton.addEventListener('click', async () => {
  const confirmed = await confirmDialog({
    title: 'Reset workspace?',
    message:
      'All products, activity and settings return to the sample data. This cannot be undone.',
    confirmLabel: 'Reset workspace',
    trigger: resetButton,
  });
  if (!confirmed) return;
  try {
    await api('/api/workspace/reset', { method: 'POST', body: {} });
    saved = await api('/api/settings');
    populate(saved);
    toast('Workspace reset to sample data');
  } catch (error) {
    if (error.status !== 401) toast(error.message, 'error');
  }
});

async function init() {
  void initShell();
  try {
    saved = await api('/api/settings');
    populate(saved);
  } catch (error) {
    if (error.status !== 401) toast("Couldn't load settings. Refresh to try again.", 'error');
  }
}

void init();
