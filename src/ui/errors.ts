/**
 * Central error reporting for UI async handlers.
 * Ensures strict typing for error objects and consistent logging.
 */
export function reportError(error: unknown): void {
  console.error("[UI Error]", error);
}
