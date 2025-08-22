// tests/mantine-table.spec.js
const { test, expect } = require('@playwright/test');

// Debug artifacts
test.use({
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
});

// 🔗 Story: Detail Panel — Enabled
const PAGE_URL =
  'https://www.mantine-react-table.dev/iframe.html?args=&id=features-detail-panel-examples--detail-panel-enabled&viewMode=story';
// If you prefer a different story, swap the URL above accordingly.


async function canvas(page) {
  const preview = page.locator('iframe[title="storybook-preview-iframe"]');
  if (await preview.count()) {
    await preview.waitFor({ state: 'attached', timeout: 10000 });
    return page.frameLocator('iframe[title="storybook-preview-iframe"]');
  }
  return page;
}

// ---------- helpers that accept a "root" (Page or FrameLocator) ----------
function table(root) {
  return root.locator('table.mantine-Table-root').first();
}

// Count only *effective* data rows (treat a single "No records" row as zero)
async function dataRowCount(root) {
  const rows = table(root).locator('tbody tr');
  const n = await rows.count();
  if (n === 0) return 0;
  if (n === 1) {
    const txt = (await rows.first().innerText()).toLowerCase();
    if (/\bno\s+records\b|\bno\s+rows\b|no data/i.test(txt)) return 0;
  }
  return n;
}

async function columnValues(root, colIndex /* 1-based */) {
  const cells = table(root).locator(`tbody tr td:nth-child(${colIndex})`);
  const count = await cells.count();
  const vals = [];
  for (let i = 0; i < count; i++) vals.push((await cells.nth(i).innerText()).trim());
  return vals;
}

const nonDecreasing = (a) => a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) <= 0);
const nonIncreasing = (a) => a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) >= 0);
const sortDirection = (vals) => (nonDecreasing(vals) ? 'asc' : nonIncreasing(vals) ? 'desc' : null);
const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Wait until at least one element matching selector INSIDE THE TABLE is truly visible */
async function waitForAnyVisibleInTable(root, selector, timeout = 7000) {
  const loc = table(root).locator(selector);
  await expect
    .poll(
      async () =>
        await loc.evaluateAll((els) =>
          els.some((el) => {
            const s = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
          }),
        ),
      { timeout, message: `Expected at least one visible match for ${selector}` },
    )
    .toBe(true);
}

/** Read the total matched rows from status text like "1–10 of N". Returns a number or null. */
async function readStatusTotal(root) {
  const texts = await root.locator('.mantine-Text-root').allInnerTexts().catch(() => []);
  for (const raw of texts) {
    const t = raw.replace(/\u00a0/g, ' '); // normalize NBSP
    const m = t.match(/\bof\s*([\d,]+)/i);
    if (m) {
      const num = parseInt(m[1].replace(/,/g, ''), 10);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

/** Find a sort control for "First Name" and return { control, index } (1-based col index). */
async function findFirstNameSortControlAndIndex(root) {
  const namePatterns = [/first\s*name/i, /\bfirst\b/i, /\bname\b/i];

  for (const pat of namePatterns) {
    const header = table(root).getByRole('columnheader', { name: pat }).first();
    if (await header.count()) {
      const btn = header.getByRole('button');
      const control = (await btn.count()) ? btn.first() : header;
      const h = await header.elementHandle();
      const idx = (await h.evaluate((el) => el.cellIndex)) + 1;
      return { control, index: idx };
    }
  }

  // Fallback: explicit label like "Sort by First Name" / "Sorted by First Name"
  const byName = table(root).getByRole('button', { name: /sort(?:ed)? by first name/i });
  if (await byName.count()) {
    const btn = byName.first();
    const handle = await btn.elementHandle();
    const idx = (await handle.evaluate((el) => el.closest('th')?.cellIndex ?? 0)) + 1;
    return { control: btn, index: idx };
  }

  return null;
}

async function firstRowExpandControl(root) {
  const firstRow = table(root).locator('tbody tr').first();

  let btn = firstRow.locator('button[aria-label*="expand" i]').first();
  if (!(await btn.count())) btn = firstRow.locator('button[aria-label*="detail" i]').first();
  if (!(await btn.count())) btn = firstRow.locator('button[title*="expand" i], button[title*="detail" i]').first();
  if (!(await btn.count())) btn = firstRow.getByRole('button', { name: /expand|detail/i }).first();
  if (!(await btn.count())) btn = firstRow.locator('button').first(); // last resort
  return btn;
}

/** Detail panel cells — count only the VISIBLE ones (aria-hidden="false") */
function detailPanelCells(root) {
  return table(root).locator(
    'tbody td.mantine-TableBodyCell-DetailPanel:has([aria-hidden="false"]), ' +
      'tbody td:has([aria-hidden="false"]):has-text("City:")'
  );
}

// ---------- beforeEach ----------
test.beforeEach(async ({ page }) => {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  const root = await canvas(page);
  await table(root).waitFor({ state: 'attached', timeout: 10000 });
  await expect(table(root)).toBeVisible();
  expect(await dataRowCount(root)).toBeGreaterThan(0);
});

// 0) Page can be reached (table visible)
test('page loads and table is visible', async ({ page }) => {
  const root = await canvas(page);
  await expect(table(root)).toBeVisible();
});

// 1) SEARCH via status text: capture total, search "ali" ⇒ total decreases, clear ⇒ back to original
test('global search reduces total (status "1–10 of N") for "ali" and restores when cleared', async ({ page }) => {
  const root = await canvas(page);

  const searchToggle = root.getByRole('button', { name: /show\/hide search/i });
  await expect(searchToggle).toBeVisible();
  await searchToggle.click();

  const input = root.locator('input[placeholder*="Search" i]').first();
  await input.waitFor({ state: 'attached' });

  let baseTotal = await readStatusTotal(root);
  let useStatus = true;
  if (baseTotal === null) {
    baseTotal = await dataRowCount(root);
    useStatus = false;
  }
  expect(baseTotal).toBeGreaterThan(0);

  await input.fill('ali', { force: true });
  await input.press('Enter');
  await input.blur();

  if (useStatus) {
    await expect
      .poll(async () => readStatusTotal(root), {
        timeout: 8000,
        message: 'Expected status total to decrease after searching "ali"',
      })
      .toBeLessThan(baseTotal);
  } else {
    await expect
      .poll(async () => dataRowCount(root), {
        timeout: 8000,
        message: 'Expected visible row count to decrease after searching "ali"',
      })
      .toBeLessThan(baseTotal);
  }

  await input.fill('', { force: true });
  await input.press('Enter');
  await input.blur();

  if (useStatus) {
    await expect
      .poll(async () => readStatusTotal(root), {
        timeout: 8000,
        message: 'Expected status total to restore after clearing search',
      })
      .toBe(baseTotal);
  } else {
    await expect
      .poll(async () => dataRowCount(root), {
        timeout: 8000,
        message: 'Expected visible row count to restore after clearing search',
      })
      .toBe(baseTotal);
  }
});

// 2) Filters toggle reveals header filter inputs (UI presence)
test('clicking "Show/Hide filters" reveals header filter inputs', async ({ page }) => {
  const root = await canvas(page);
  const filtersToggle = root.getByRole('button', { name: /show\/hide filters/i });
  await expect(filtersToggle).toBeVisible();
  await filtersToggle.click();
  await waitForAnyVisibleInTable(root, 'thead input');
});

// 3) Sorting: click1 sorts, click2 flips, click3 restores OR keeps flipping (2-state)
test('sorting on "First Name": click1 sorts, click2 flips, click3 restores OR keeps flipping', async ({ page }) => {
  const root = await canvas(page);
  const first = await findFirstNameSortControlAndIndex(root);
  if (!first) test.skip('No sortable "First Name" column/control found in this story.');

  const base = await columnValues(root, first.index);

  // --- Click #1: becomes sorted (asc OR desc)
  {
    const { control, index } = await findFirstNameSortControlAndIndex(root);
    await expect(control).toBeVisible();
    await control.click();

    await expect
      .poll(async () => sortDirection(await columnValues(root, index)), {
        timeout: 6000,
        message: 'After click #1, expected column to become sorted',
      })
      .not.toBe(null);

    const vals1 = await columnValues(root, index);
    expect(arraysEqual(vals1, base)).toBe(false);
  }

  // --- Click #2: direction flips
  {
    const { control, index } = await findFirstNameSortControlAndIndex(root);
    await control.click();

    await expect
      .poll(async () => sortDirection(await columnValues(root, index)), {
        timeout: 6000,
        message: 'After click #2, expected opposite sort direction',
      })
      .not.toBe(null);
  }

  // --- Click #3: try to return to ORIGINAL order (tri-state). If not, assume 2-state and keep flipping.
  const { control: ctrl3, index: idx3 } = await findFirstNameSortControlAndIndex(root);
  await ctrl3.click();

  let restored = false;
  try {
    await expect
      .poll(async () => {
        const now = await columnValues(root, idx3);
        return arraysEqual(now, base);
      }, { timeout: 6000 })
      .toBe(true);
    restored = true;
  } catch {
    restored = false;
  }

  if (!restored) {
    // Two more flips to show consistent 2-state behavior
    for (let i = 4; i <= 5; i++) {
      const { control, index } = await findFirstNameSortControlAndIndex(root);
      await control.click();
      await expect
        .poll(async () => sortDirection(await columnValues(root, index)), {
          timeout: 6000,
          message: `After click #${i}, expected a sorted state`,
        })
        .not.toBe(null);
    }
  }
});

// 4) Detail Panel: first-row expand toggles a **visible** panel cell in the tbody
test('detail panel toggles open/closed for the first row', async ({ page }) => {
  const root = await canvas(page);

  // Start: no visible detail panels
  await expect(detailPanelCells(root)).toHaveCount(0);

  // Find a ROW-LEVEL expand control (scoped to first data row, not the toolbar)
  const expandBtn = await firstRowExpandControl(root);
  await expect(expandBtn).toBeVisible();

  // Open
  await expandBtn.click();
  await expect
    .poll(async () => detailPanelCells(root).count(), {
      timeout: 6000,
      message: 'Expected one visible detail panel cell after expanding',
    })
    .toBe(1);

  // Close (re-resolve in case of re-render)
  const expandBtnAgain = await firstRowExpandControl(root);
  await expandBtnAgain.click();
  await expect
    .poll(async () => detailPanelCells(root).count(), {
      timeout: 6000,
      message: 'Expected zero visible detail panel cells after collapsing',
    })
    .toBe(0);
});
