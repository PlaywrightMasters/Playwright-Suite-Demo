import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

export const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
export type AxeViolation = AxeResults['violations'][number];

export interface ScanOptions {
  /** CSS selectors to limit the scan to (e.g. an open dialog). */
  include?: string[];
  exclude?: string[];
  tags?: string[];
}

/**
 * Runs an axe-core scan and attaches the full JSON result to the test report,
 * so failures can be investigated without re-running the test.
 */
export async function scanA11y(
  page: Page,
  testInfo: TestInfo,
  options: ScanOptions = {},
): Promise<AxeViolation[]> {
  let builder = new AxeBuilder({ page }).withTags(options.tags ?? WCAG_21_AA);
  for (const selector of options.include ?? []) builder = builder.include(selector);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);

  const results = await builder.analyze();
  await testInfo.attach('axe-results.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  return results.violations;
}

/** One readable line per violation, used as the assertion message. */
export function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return 'No violations';
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => n.target.join(' ')).join(', ');
      return `[${v.impact ?? 'unknown'}] ${v.id}: ${v.help} (${v.nodes.length} node(s): ${targets})\n  ${v.helpUrl}`;
    })
    .join('\n');
}
