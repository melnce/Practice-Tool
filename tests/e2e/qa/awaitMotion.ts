/** No-op on main; ui-overhaul branch will await motion settle. */
export async function awaitMotionSettled(
  _page: import("@playwright/test").Page,
): Promise<void> {
  // stub
}
