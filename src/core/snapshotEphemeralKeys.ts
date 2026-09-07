/**
 * Root keys excluded from history snapshots (implementation caches / transient flags).
 * Must also appear in gameState KNOWN_ROOT_KEYS so resetStateInstance does not
 * delete them as unknown ad-hoc keys.
 */
export const INTERNAL_CACHE_KEYS = new Set([
  "_triggerCache",
  "_runEffectsDepth",
  "deferDeathTriggers",
  "sotBoundaryDeferDrain",
  "turnBoundaryInvokePhase",
  "_reactiveCollector",
  "_drainingResolutionQueue",
  "__resolutionDrainDepth",
  "playSequenceDepth",
]);
