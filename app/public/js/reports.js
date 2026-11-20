import { api, el, formatMoney, formatNumber, initShell, redirectToLogin, toast } from './common.js';

const ACTION_LABELS = {
  create: 'Added',
  update: 'Edited',
  delete: 'Deleted',
  status: 'Status',
  settings: 'Settings',
  reset: 'Reset',
};

const $ = (selector) => document.querySelector(selector);
const activityFilter = $('#activity-filter');
const activityList = $('#activity-list');
const activityEmpty = $('#activity-empty');
const exportButton = $('#export-btn');

function setStat(testId, text) {
  $(`[data-testid="${testId}"]`).textContent = text;
}

async function loadSummary() {
  const summary = await api('/api/reports/summary');
  setStat('stat-total-products', formatNumber(summary.totalProducts));
  setStat('stat-total-units', formatNumber(summary.totalUnits));
  setStat('stat-inventory-value', formatMoney(summary.inventoryValue, summary.currency));
  setStat('stat-low-stock', formatNumber(summary.lowStockCount));
  setStat('stat-out-of-stock', formatNumber(summary.outOfStockCount));

  const total = summary.inventoryValue || 1;
  $('#category-body').replaceChildren(
    ...summary.byCategory.map((row) => {
      const share = Math.round((row.value / total) * 100);
      const bar = el('span', { class: 'bar', 'aria-hidden': 'true' });
      bar.style.width = `${Math.max(share, 1)}%`;
      return el(
        'tr',
        { 'data-testid': 'category-row', 'data-category': row.category },
        el('th', { scope: 'row' }, row.category),
        el('td', { class: 'num', 'data-col': 'products' }, formatNumber(row.products)),
        el('td', { class: 'num', 'data-col': 'units' }, formatNumber(row.units)),
        el('td', { class: 'num', 'data-col': 'value' }, formatMoney(row.value, summary.currency)),
        el('td', { class: 'bar-cell', 'data-col': 'share' }, bar, ` ${share}%`),
      );
    }),
  );
}

async function loadActivity() {
  const action = activityFilter.value;
  const entries = await api(`/api/reports/activity${action ? `?action=${action}` : ''}`);
  activityList.replaceChildren(
    ...entries.map((entry) =>
      el(
        'li',
        { 'data-testid': 'activity-item', 'data-action': entry.action },
        el('span', { class: 'badge badge-neutral' }, ACTION_LABELS[entry.action] ?? entry.action),
        el('span', { class: 'activity-message' }, entry.message),
        el(
          'time',
          { class: 'activity-time', datetime: entry.timestamp },
          new Date(entry.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        ),
      ),
    ),
  );
  activityList.hidden = entries.length === 0;
  activityEmpty.hidden = entries.length !== 0;
}

async function exportCsv() {
  exportButton.disabled = true;
  try {
    const response = await fetch('/api/reports/inventory.csv', { credentials: 'same-origin' });
    if (response.status === 401) return redirectToLogin({ expired: true });
    if (!response.ok) throw new Error(`Export failed (${response.status})`);

    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'stockpilot-inventory.csv';
    const url = URL.createObjectURL(await response.blob());
    const link = el('a', { href: url, download: filename, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Inventory exported');
  } catch {
    toast("Couldn't export inventory. Please try again.", 'error');
  } finally {
    exportButton.disabled = false;
  }
}

async function init() {
  void initShell();
  activityFilter.addEventListener('change', () => void loadActivity().catch(() => {}));
  exportButton.addEventListener('click', () => void exportCsv());
  await Promise.all([loadSummary(), loadActivity()]).catch((error) => {
    if (error.status !== 401) toast("Couldn't load reports. Refresh to try again.", 'error');
  });
}

void init();
