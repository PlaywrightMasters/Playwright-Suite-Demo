import {
  api,
  confirmDialog,
  el,
  formatMoney,
  formatNumber,
  initShell,
  stockLevel,
  STOCK_LABELS,
  toast,
} from './common.js';

const DEFAULT_SETTINGS = {
  lowStockThreshold: 10,
  currency: 'USD',
  density: 'comfortable',
  categoryOrder: ['Electronics', 'Furniture', 'Office Supplies', 'Apparel'],
};
const SORTABLE = ['sku', 'name', 'price', 'quantity'];
const STATUSES = ['all', 'active', 'archived'];
const SKU_PATTERN = /^[A-Z]{2,4}-\d{3,6}$/;

const state = {
  settings: DEFAULT_SETTINGS,
  products: [],
  filters: { search: '', category: '', status: 'all' },
  sort: { by: 'name', order: 'asc' },
  loadSeq: 0,
  editing: null,
  dialogTrigger: null,
};

const $ = (selector) => document.querySelector(selector);
const refs = {
  search: $('#search'),
  category: $('#category-filter'),
  status: $('#status-filter'),
  addButton: $('#add-product-btn'),
  clearFilters: $('#clear-filters-btn'),
  resultCount: $('#result-count'),
  table: $('#products-table'),
  tableWrap: $('#table-wrap'),
  body: $('#products-body'),
  empty: $('#empty-state'),
  error: $('#error-state'),
  retry: $('#retry-btn'),
  dialog: $('#product-dialog'),
  dialogTitle: $('#product-dialog-title'),
  form: $('#product-form'),
  formError: $('#product-form-error'),
  save: $('#product-save'),
  cancel: $('#product-cancel'),
  fields: {
    name: $('#product-name'),
    sku: $('#product-sku'),
    category: $('#product-category'),
    price: $('#product-price'),
    quantity: $('#product-quantity'),
  },
  active: $('#product-active'),
};

// ── URL <-> filter state ────────────────────────────────────────────────────

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.filters.search = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  state.filters.category = state.settings.categoryOrder.includes(category) ? category : '';
  const status = params.get('status') ?? 'all';
  state.filters.status = STATUSES.includes(status) ? status : 'all';
  const sort = params.get('sort') ?? 'name';
  state.sort.by = SORTABLE.includes(sort) ? sort : 'name';
  state.sort.order = params.get('order') === 'desc' ? 'desc' : 'asc';
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.filters.search) params.set('q', state.filters.search);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.status !== 'all') params.set('status', state.filters.status);
  if (state.sort.by !== 'name' || state.sort.order !== 'asc') {
    params.set('sort', state.sort.by);
    params.set('order', state.sort.order);
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
}

function hasActiveFilters() {
  return Boolean(state.filters.search || state.filters.category || state.filters.status !== 'all');
}

// ── Data loading ────────────────────────────────────────────────────────────

async function loadProducts() {
  const seq = ++state.loadSeq;
  const params = new URLSearchParams({
    status: state.filters.status,
    sort: state.sort.by,
    order: state.sort.order,
  });
  if (state.filters.search) params.set('search', state.filters.search);
  if (state.filters.category) params.set('category', state.filters.category);

  refs.table.setAttribute('aria-busy', 'true');
  try {
    const products = await api(`/api/products?${params.toString()}`);
    if (seq !== state.loadSeq) return; // a newer request superseded this one
    state.products = products;
    refs.error.hidden = true;
    renderTable();
  } catch (error) {
    if (seq !== state.loadSeq || error.status === 401) return;
    state.products = [];
    refs.body.replaceChildren();
    refs.tableWrap.hidden = true;
    refs.empty.hidden = true;
    refs.error.hidden = false;
    refs.resultCount.textContent = 'Products unavailable';
  } finally {
    if (seq === state.loadSeq) refs.table.removeAttribute('aria-busy');
  }
}

async function loadSummary() {
  try {
    const summary = await api('/api/reports/summary');
    $('[data-testid="kpi-total"]').textContent = formatNumber(summary.totalProducts);
    $('[data-testid="kpi-low"]').textContent = formatNumber(summary.lowStockCount);
    $('[data-testid="kpi-out"]').textContent = formatNumber(summary.outOfStockCount);
    $('[data-testid="kpi-value"]').textContent = formatMoney(
      summary.inventoryValue,
      summary.currency,
    );
  } catch {
    // KPIs are supplementary; the table shows its own error state.
  }
}

function refresh() {
  return Promise.all([loadProducts(), loadSummary()]);
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderTable() {
  const { products } = state;
  refs.body.replaceChildren(...products.map(renderRow));
  refs.tableWrap.hidden = products.length === 0;
  refs.empty.hidden = products.length !== 0;
  refs.resultCount.textContent = `Showing ${products.length} ${products.length === 1 ? 'product' : 'products'}`;
  refs.clearFilters.hidden = !hasActiveFilters();

  for (const th of document.querySelectorAll('th[data-sort-col]')) {
    if (th.dataset.sortCol === state.sort.by) {
      th.setAttribute('aria-sort', state.sort.order === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  }
}

function renderRow(product) {
  const level = stockLevel(product.quantity, state.settings.lowStockThreshold);
  const isActive = product.status === 'active';

  const toggle = el(
    'button',
    {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(isActive),
      'aria-label': `Active: ${product.name}`,
      onclick: (event) => toggleStatus(product, event.currentTarget),
    },
    el('span', { class: 'switch-track', 'aria-hidden': 'true' }),
  );

  return el(
    'tr',
    {
      'data-testid': 'product-row',
      'data-sku': product.sku,
      'data-id': product.id,
      class: isActive ? '' : 'is-archived',
    },
    el('td', { class: 'sku', 'data-col': 'sku' }, product.sku),
    el('td', { 'data-col': 'name' }, product.name),
    el('td', { 'data-col': 'category' }, product.category),
    el(
      'td',
      { class: 'num', 'data-col': 'price' },
      formatMoney(product.price, state.settings.currency),
    ),
    el('td', { class: 'num', 'data-col': 'quantity' }, formatNumber(product.quantity)),
    el(
      'td',
      { 'data-col': 'stock' },
      el(
        'span',
        { class: `badge badge-${level}`, 'data-testid': 'stock-badge' },
        STOCK_LABELS[level],
      ),
    ),
    el('td', { 'data-col': 'status' }, toggle),
    el(
      'td',
      {},
      el(
        'div',
        { class: 'row-actions' },
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'aria-label': `Edit ${product.name}`,
            onclick: (event) => openProductDialog(product, event.currentTarget),
          },
          'Edit',
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'aria-label': `Delete ${product.name}`,
            onclick: (event) => deleteProduct(product, event.currentTarget),
          },
          'Delete',
        ),
      ),
    ),
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function toggleStatus(product, button) {
  const previous = product.status;
  const next = previous === 'active' ? 'archived' : 'active';

  // Optimistic update: flip the switch now, revert if the server rejects it.
  const row = button.closest('tr');
  const apply = (status) => {
    button.setAttribute('aria-checked', String(status === 'active'));
    row.classList.toggle('is-archived', status !== 'active');
  };
  apply(next);
  button.disabled = true;

  try {
    const updated = await api(`/api/products/${product.id}`, {
      method: 'PATCH',
      body: { status: next },
    });
    Object.assign(product, updated);
    toast(next === 'archived' ? `${product.name} archived` : `${product.name} reactivated`);
    if (state.filters.status !== 'all') void loadProducts();
    void loadSummary();
  } catch (error) {
    if (error.status === 401) return;
    product.status = previous;
    apply(previous);
    toast(`Couldn't update ${product.name}. Please try again.`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteProduct(product, trigger) {
  const confirmed = await confirmDialog({
    title: 'Delete product?',
    message: `This permanently removes ${product.name} (${product.sku}) from the workspace.`,
    confirmLabel: 'Delete product',
    trigger,
  });
  if (!confirmed) return;
  try {
    await api(`/api/products/${product.id}`, { method: 'DELETE' });
    toast(`${product.name} deleted`);
    await refresh();
  } catch (error) {
    if (error.status !== 401) toast(error.message, 'error');
  }
}

// ── Add / edit dialog ───────────────────────────────────────────────────────

function setFieldError(field, message) {
  const input = refs.fields[field];
  const error = document.getElementById(`${input.id}-error`);
  error.textContent = message ?? '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function clearErrors() {
  refs.formError.textContent = '';
  for (const field of Object.keys(refs.fields)) setFieldError(field, '');
}

function openProductDialog(product, trigger) {
  state.editing = product ?? null;
  state.dialogTrigger = trigger ?? null;
  refs.form.reset();
  clearErrors();
  refs.dialogTitle.textContent = product ? 'Edit product' : 'Add product';

  if (product) {
    refs.fields.name.value = product.name;
    refs.fields.sku.value = product.sku;
    refs.fields.category.value = product.category;
    refs.fields.price.value = String(product.price);
    refs.fields.quantity.value = String(product.quantity);
    refs.active.checked = product.status === 'active';
  } else {
    refs.active.checked = true;
  }

  refs.dialog.showModal();
  refs.fields.name.focus();
}

function closeProductDialog() {
  if (refs.dialog.open) refs.dialog.close();
}

function readForm() {
  return {
    name: refs.fields.name.value.trim(),
    sku: refs.fields.sku.value.trim().toUpperCase(),
    category: refs.fields.category.value,
    price: refs.fields.price.value.trim(),
    quantity: refs.fields.quantity.value.trim(),
    status: refs.active.checked ? 'active' : 'archived',
  };
}

/** Client-side checks mirror the API rules so most mistakes never leave the browser. */
function validate(values) {
  const errors = {};
  if (!values.name) errors.name = 'Name is required';
  else if (values.name.length < 2 || values.name.length > 80) {
    errors.name = 'Name must be between 2 and 80 characters';
  }

  if (!values.sku) errors.sku = 'SKU is required';
  else if (!SKU_PATTERN.test(values.sku)) {
    errors.sku = 'SKU must look like SP-1234 (2–4 capital letters, a dash, 3–6 digits)';
  }

  if (!values.category) errors.category = 'Category is required';

  const price = Number(values.price);
  if (values.price === '') errors.price = 'Price is required';
  else if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
    errors.price = 'Price must be between 0 and 1,000,000';
  } else if (Math.abs(Math.round(price * 100) - price * 100) > 1e-6) {
    errors.price = 'Price can have at most 2 decimal places';
  }

  const quantity = Number(values.quantity);
  if (values.quantity === '') errors.quantity = 'Quantity is required';
  else if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) {
    errors.quantity = 'Quantity must be a whole number between 0 and 100,000';
  }
  return errors;
}

async function submitProduct(event) {
  event.preventDefault();
  clearErrors();

  const values = readForm();
  const errors = validate(values);
  if (Object.keys(errors).length > 0) {
    for (const [field, message] of Object.entries(errors)) setFieldError(field, message);
    refs.fields[Object.keys(errors)[0]].focus();
    return;
  }

  const payload = { ...values, price: Number(values.price), quantity: Number(values.quantity) };
  const editing = state.editing;
  refs.save.disabled = true;
  try {
    if (editing) {
      await api(`/api/products/${editing.id}`, { method: 'PUT', body: payload });
      toast('Product updated successfully');
    } else {
      await api('/api/products', { method: 'POST', body: payload });
      toast('Product added successfully');
    }
    closeProductDialog();
    await refresh();
  } catch (error) {
    if (error.status === 401) return;
    for (const [field, message] of Object.entries(error.details ?? {})) {
      if (refs.fields[field]) setFieldError(field, message);
    }
    refs.formError.textContent =
      error.status === 400 ? 'Please fix the highlighted fields.' : error.message;
  } finally {
    refs.save.disabled = false;
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function populateCategorySelects() {
  for (const select of [refs.category, refs.fields.category]) {
    const first = select.options[0];
    select.replaceChildren(
      first,
      ...state.settings.categoryOrder.map((c) => el('option', { value: c }, c)),
    );
  }
}

function bindEvents() {
  let searchTimer;
  refs.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = refs.search.value.trim();
      writeUrl();
      void loadProducts();
    }, 250);
  });

  refs.category.addEventListener('change', () => {
    state.filters.category = refs.category.value;
    writeUrl();
    void loadProducts();
  });

  refs.status.addEventListener('change', () => {
    state.filters.status = refs.status.value;
    writeUrl();
    void loadProducts();
  });

  refs.clearFilters.addEventListener('click', () => {
    clearTimeout(searchTimer);
    state.filters = { search: '', category: '', status: 'all' };
    refs.search.value = '';
    refs.category.value = '';
    refs.status.value = 'all';
    writeUrl();
    void loadProducts();
    refs.search.focus();
  });

  for (const button of document.querySelectorAll('.sort-btn')) {
    button.addEventListener('click', () => {
      const column = button.dataset.sort;
      if (state.sort.by === column) {
        state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { by: column, order: 'asc' };
      }
      writeUrl();
      void loadProducts();
    });
  }

  refs.retry.addEventListener('click', () => void refresh());
  refs.addButton.addEventListener('click', (event) => openProductDialog(null, event.currentTarget));
  refs.cancel.addEventListener('click', closeProductDialog);
  refs.form.addEventListener('submit', submitProduct);
  refs.dialog.addEventListener('close', () => {
    state.editing = null;
    if (state.dialogTrigger?.isConnected) state.dialogTrigger.focus();
    else refs.addButton.focus();
  });
  refs.fields.sku.addEventListener('input', () => {
    const input = refs.fields.sku;
    const upper = input.value.toUpperCase();
    if (upper !== input.value) input.value = upper;
  });
}

async function init() {
  void initShell();
  try {
    state.settings = { ...DEFAULT_SETTINGS, ...(await api('/api/settings')) };
  } catch {
    state.settings = DEFAULT_SETTINGS;
  }
  populateCategorySelects();
  refs.table.dataset.density = state.settings.density;

  readUrl();
  refs.search.value = state.filters.search;
  refs.category.value = state.filters.category;
  refs.status.value = state.filters.status;

  bindEvents();
  await refresh();
}

void init();
