# datavisyn-task

Playwright tests for a Mantine React Table story.

## Setup

```bash
npm ci
npx playwright install --with-deps
```

## Run

```bash
npx playwright test
npx playwright show-report
```

## What’s tested

### What’s tested

* **Page loads** – table renders and has rows.
* **Search toggle** – clicking **“Show/Hide search”** shows the global search box.
* **Filters toggle** – clicking **“Show/Hide filters”** shows header filter inputs.
* **Sorting (First Name)** – verifies sort behavior across clicks (handles both two-state flip and tri-state restore; asserts direction changes appropriately).
* **Name search** – types **`ali`** in the global search and verifies the total count (the “1–10 of N” status, or visible row count as a fallback) **decreases**, then **restores** after clearing.
* **Detail panel** – expands the first row’s detail panel and asserts a visible panel appears, then collapses and asserts it disappears.


## Target page

Edit `PAGE_URL` near the top of `tests/mantine-table.spec.js` to point at the story you want to test.

* **Full Storybook UI:**
  `https://www.mantine-react-table.dev/?path=/story/prop-playground--default`

* **Iframe canvas:**
  `https://www.mantine-react-table.dev/iframe.html?id=prop-playground--default&viewMode=story`

> The tests auto-scope queries to the Storybook preview iframe when using the full UI. If your `PAGE_URL` is set to a different story (e.g., Aggregation), just replace it here with the link you want to run against.
