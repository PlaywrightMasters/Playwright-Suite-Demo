#!/usr/bin/env node
// Introduces (and reverts) realistic regressions for live demos of the suite.
//
//   npm run demo:break -- toast        UI copy regression, caught by @critical E2E tests
//   npm run demo:break -- validation   API rule regression, caught by @api tests only
//   npm run demo:fix                   revert every scenario
//   npm run demo:status                show which scenarios are active

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCENARIOS = {
  toast: {
    file: 'app/public/js/inventory.js',
    good: "toast('Product added successfully');",
    bad: "toast('Product created successfully');",
    summary: "Success toast copy changes from 'Product added…' to 'Product created…'.",
    impact: [
      'The product still saves, so every API test stays green.',
      '@critical E2E tests that assert the toast wording fail:',
      '  • Inventory › adds a new product and shows a success toast',
      '  • Reports › activity log records a product added in the UI',
      'Run: npx playwright test --grep @critical --project=chromium',
    ],
  },
  validation: {
    file: 'app/validation.ts',
    good: "typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_PRICE",
    bad: "typeof v !== 'number' || !Number.isFinite(v) || v > MAX_PRICE",
    summary: 'The API stops rejecting negative prices.',
    impact: [
      'The browser form still blocks negative prices, so every E2E test stays green.',
      'Only the API contract test notices:',
      '  • Products API › rejects negative price',
      'Run: npm run test:api',
      'Restart a running dev server so the change is picked up.',
    ],
  },
};

function read(scenario) {
  return readFileSync(join(root, scenario.file), 'utf8');
}

function state(scenario) {
  const source = read(scenario);
  if (source.includes(scenario.bad)) return 'broken';
  if (source.includes(scenario.good)) return 'fixed';
  return 'unknown';
}

function apply(name, from, to) {
  const scenario = SCENARIOS[name];
  const source = read(scenario);
  if (!source.includes(from)) return false;
  writeFileSync(join(root, scenario.file), source.replace(from, to));
  return true;
}

const [command = 'status', name] = process.argv.slice(2);

if (name && !SCENARIOS[name]) {
  console.error(`Unknown scenario "${name}". Choose one of: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

switch (command) {
  case 'break': {
    const target = name ?? 'toast';
    const scenario = SCENARIOS[target];
    if (state(scenario) === 'unknown') {
      console.error(`Cannot find the expected code in ${scenario.file}; has it been edited?`);
      process.exit(1);
    }
    if (!apply(target, scenario.good, scenario.bad)) {
      console.info(`Scenario "${target}" is already broken.`);
      break;
    }
    console.info(`Broke "${target}": ${scenario.summary}\n  file: ${scenario.file}\n`);
    for (const line of scenario.impact) console.info(`  ${line}`);
    console.info('\n  Revert with: npm run demo:fix');
    break;
  }
  case 'fix': {
    const targets = name ? [name] : Object.keys(SCENARIOS);
    for (const target of targets) {
      const scenario = SCENARIOS[target];
      const fixed = apply(target, scenario.bad, scenario.good);
      console.info(`${target}: ${fixed ? 'reverted' : `nothing to revert (${state(scenario)})`}`);
    }
    break;
  }
  case 'status': {
    for (const [target, scenario] of Object.entries(SCENARIOS)) {
      console.info(`${target.padEnd(11)} ${state(scenario).padEnd(8)} ${scenario.file}`);
    }
    break;
  }
  default:
    console.error('Usage: node scripts/demo.mjs <break|fix|status> [toast|validation]');
    process.exit(1);
}
