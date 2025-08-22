// tests/mantine-table.spec.js
const { test, expect } = require('@playwright/test');

// Debug artifacts
test.use({
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
});

// You can point to either the full UI or the iframe canvas URL.
// Full UI example (table is inside preview iframe):
const PAGE_URL = 'https://www.mantine-react-table.dev/?path=/story/prop-playground--default';
// If you want the iframe canvas instead, swap to:
// const PAGE_URL = 'https://www.mantine-react-table.dev/iframe.html?id=prop-playground--default&viewMode=story';

/** Return the correct root for queries:
 *  - full UI: the Storybook preview iframe
 *  - iframe canvas URL: the page itself
 */
async function canvas(page) {
  const hasPreview = await page.locator('iframe[title="storybook-preview-iframe"]').count();
  return hasPreview
    ? page.frameLocator('iframe[title="storybook-preview-iframe"]')
    : page;
}

// ---------- helpers that accept a "root" (Page or FrameLocator) ----------
function table(root) {
  return root.locator('table.mantine-Table-root').first();
}

async function columnValues(root, colIndex /* 1-based */, limit = 8) {
  const cells = table(root).locator(`tbody tr td:nth-child(${colIndex})`);
  const n = Math.min(limit, await cells.count());
  const vals = [];
  for (let i = 0; i < n; i++) vals.push((await cells.nth(i).innerText()).trim());
  return vals;
}

const nonDecreasing = (a) => a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) <= 0);
const nonIncreasing = (a) => a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) >= 0);
const sortDirection = (vals) => (nonDecreasing(vals) ? 'asc' : nonIncreasing(vals) ? 'desc' : null);

// Wait until at least one matching element is visible (scoped to root)
async function waitForAnyVisible(root, selector) {
  await expect(root.locator(selector).first()).toBeVisible();
}

/** Find a sort control for the "First Name" column (or closest match),
 *  and return { control, index } where index is 1-based column index.
 *  Returns null if nothing sortable is exposed in this story.
 */
async function findFirstNameSortControlAndIndex(root) {
  const namePatterns = [/first\s*name/i, /\bfirst\b/i, /\bname\b/i];

  for (const pat of namePatterns) {
    const header = root.getByRole('columnheader', { name: pat }).first();
    if (await header.count()) {
      const btn = header.getByRole('button');
      const control = (await btn.count()) ? btn.first() : header;
      const hHandle = await header.elementHandle();
      const index = (await hHandle.evaluate((el) => el.cellIndex)) + 1; // 1-based
      return { control, index };
    }
  }

  // Fallback: a named sort button anywhere (handles "Sort by..." and "Sorted by...")
  const byName = root.getByRole('button', { name: /sort(?:ed)? by first name/i });
  if (await byName.count()) {
    const btn = byName.first();
    const handle = await btn.elementHandle();
    const colIndex = (await handle.evaluate((el) => el.closest('th')?.cellIndex ?? 0)) + 1;
    return { control: btn, index: colIndex };
  }

  return null;
}

// ---------- beforeEach ----------
test.beforeEach(async ({ page }) => {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  const root = await canvas(page);
  await expect(table(root)).toBeVisible();

  const rowCount = await table(root).locator('tbody tr').count();
  expect(rowCount).toBeGreaterThan(0);
});

// 0) Page can be reached (table visible)
test('page loads and table is visible', async ({ page }) => {
  const root = await canvas(page);
  await expect(table(root)).toBeVisible();
});

// 1) Search toggle reveals the search input
test('clicking "Show/Hide search" reveals the search box', async ({ page }) => {
  const root = await canvas(page);
  const searchToggle = root.getByRole('button', { name: /show\/hide search/i });
  await expect(searchToggle).toBeVisible();
  await searchToggle.click();
  await waitForAnyVisible(root, 'input[placeholder*="Search" i]');
});

// 2) Filters toggle reveals header filter inputs
test('clicking "Show/Hide filters" reveals header filter inputs', async ({ page }) => {
  const root = await canvas(page);
  const filtersToggle = root.getByRole('button', { name: /show\/hide filters/i });
  await expect(filtersToggle).toBeVisible();
  await filtersToggle.click();
  await waitForAnyVisible(root, 'table.mantine-Table-root thead input');
});

// 3) Sort control toggles reliably across multiple clicks
test('sort on "First Name" stays consistent across 5 consecutive clicks', async ({ page }) => {
  const root = await canvas(page);
  const found = await findFirstNameSortControlAndIndex(root);

  if (!found) {
    test.skip('This story does not expose a sortable "First Name" column/control.');
    return;
  }

  const TOGGLES = 5;
  let lastDir = null;

  for (let i = 1; i <= TOGGLES; i++) {
    // Re-resolve the control & index each time in case of React re-renders
    const refound = await findFirstNameSortControlAndIndex(root);
    if (!refound) test.skip('Sort control disappeared mid-test.');
    const { control, index } = refound;

    await expect(control).toBeVisible();
    await control.click();

    // Wait until the column becomes clearly sorted (asc or desc)
    const dir = await expect
      .poll(async () => sortDirection(await columnValues(root, index)), {
        timeout: 5000,
        message: `After click #${i}, expected column to become sorted`,
      })
      .not.toBe(null);

    // Poll returns the result into the assertion chain; re-read to compare
    const vals = await columnValues(root, index);
    const newDir = sortDirection(vals);
    expect(newDir).not.toBe(null);

    if (lastDir) {
      // Require direction flip compared to the previous *sorted* state
      expect(newDir).not.toBe(lastDir);
    }

    lastDir = newDir;
  }
});
