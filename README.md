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

1. **Page loads** – table renders and has rows.
2. **Search toggle** – clicking **“Show/Hide search”** makes a search box appear.
3. **Filters toggle** – clicking **“Show/Hide filters”** makes header filter inputs appear.
4. **Sorting (First Name)** – click the sort control **5 times**; after **each** click the test detects whether the column is **ascending** or **descending** and asserts the direction **flips** every time (asc ↔︎ desc).
5. **Name search** – types **`ali`** in the global search and verifies the total count (the `1–10 of N` status, or visible row count as a fallback) **decreases**, then **restores** after clearing.

## Target page

Edit `PAGE_URL` near the top of `tests/mantine-table.spec.js` to point at the story you want to test.

* **Full Storybook UI:**
  `https://www.mantine-react-table.dev/?path=/story/prop-playground--default`

* **Iframe canvas:**
  `https://www.mantine-react-table.dev/iframe.html?id=prop-playground--default&viewMode=story`

> The tests auto-scope queries to the Storybook preview iframe when using the full UI. If your `PAGE_URL` is set to a different story (e.g., Aggregation), just replace it here with the link you want to run against.
