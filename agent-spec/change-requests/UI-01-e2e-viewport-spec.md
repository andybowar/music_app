# CR UI-01 · Let UI-01 own a Playwright viewport spec

**Status:** proposed

## Problem

The UI-01 acceptance criteria say "ResponsivePanel switches mode at 768px (Playwright viewport test)". Playwright's `testDir` is `tests/e2e/`, and UI-01 owns only `components/ui/` and `components/ResponsivePanel.tsx` (plus `app/globals.css` as a touch). So UI-01 can't add the spec without editing a path it doesn't own.

What UI-01 did instead:

- The unit test `components/ResponsivePanel.test.tsx` covers 767px → sheet, 768px → popover, a live resize across the breakpoint, and keyboard open, focus-in and Escape/focus-return in both modes. It uses a fake `matchMedia`.
- A manual Chromium run against `/dev/tokens` at 360, 767, 768 and 1280px gave sheet, sheet, popover, popover. Focus moved into the panel and came back to the trigger each time. There were no console errors or hydration warnings, and no horizontal scroll at 360px.

## Proposed change

`agent-spec/tasks/UI-01.md` frontmatter (and `tasks.json`):

```diff
-owns: ["components/ui/", "components/ResponsivePanel.tsx"]
+owns: ["components/ui/", "components/ResponsivePanel.tsx", "tests/e2e/responsive-panel.spec.ts"]
```

Then add this spec, either in a UI-01 follow-up or directly from this CR:

```ts
// tests/e2e/responsive-panel.spec.ts
import { expect, test } from '@playwright/test';

for (const [width, mode] of [
  [767, 'sheet'],
  [768, 'popover'],
] as const) {
  test(`ResponsivePanel is a ${mode} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dev/tokens');
    const trigger = page.getByRole('button', { name: 'Key D' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: 'Keys' });
    await expect(panel).toHaveAttribute('data-mode', mode);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
```

`/dev/tokens` returns 404 in production, and CI runs e2e against `next start`. So in CI this spec needs a dev server, or the gallery has to be enabled for e2e builds. Whoever owns the e2e harness should decide which.

## Affects

UI-01 only. No contract change.
