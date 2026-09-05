import type { Page } from "@playwright/test";

/** 1×1 transparent PNG — satisfies img requests without egress. */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function isIgnorableConsoleError(text: string): boolean {
  if (!text.startsWith("Failed to load resource")) return false;
  return !text.includes("localhost") && !text.includes("127.0.0.1");
}

/** Route external card art to a local placeholder so tests stay hermetic. */
export async function routeExternalCardArt(page: Page): Promise<void> {
  await page.route("https://static.dotgg.gg/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: PLACEHOLDER_PNG,
    });
  });
}

/** Track console/page errors; ignores external image load failures as a backstop. */
export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** Hermetic setup: stub external art and return a console error collector. */
export async function setupHermeticPage(page: Page): Promise<string[]> {
  await routeExternalCardArt(page);
  return trackConsole(page);
}
