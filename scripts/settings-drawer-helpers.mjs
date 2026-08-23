/**
 * Playwright helpers for the phase-3 settings drawer (controls live inside when closed).
 */

export async function isSettingsDrawerOpen(page) {
  return page.evaluate(() =>
    document.getElementById("settingsDrawer")?.classList.contains("open"),
  );
}

/** Open the settings drawer and wait until it is interactive. */
export async function openSettingsDrawer(page) {
  if (await isSettingsDrawerOpen(page)) return;
  await page.locator("#settingsToggle").click();
  await page.waitForSelector("#settingsDrawer.open", { timeout: 5000 });
}

/** Close the settings drawer (Escape). No-op if already closed. */
export async function closeSettingsDrawer(page) {
  if (!(await isSettingsDrawerOpen(page))) return;
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      !document.getElementById("settingsDrawer")?.classList.contains("open"),
    { timeout: 5000 },
  );
}

/**
 * Run fn with the settings drawer open; closes afterwards when `closeAfter` is true.
 */
export async function withSettingsDrawer(page, fn, { closeAfter = true } = {}) {
  await openSettingsDrawer(page);
  try {
    return await fn();
  } finally {
    if (closeAfter) await closeSettingsDrawer(page);
  }
}
