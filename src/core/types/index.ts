// =============================================================================
// CORE TYPES - BARREL EXPORT
// =============================================================================
// This file provides a single import point for all core types.
// Example: import type { GameState, CardInstance, Player } from "../core/types/index.js";

// Player types
export type {
  PlayerSlot,
  LegacyPlayer,
  Player,
  PlayerState,
} from "./player.js";

// Card types
export type { KeywordEntry, CardTemplate, CardInstance } from "./cards.js";

// Effect types (type-only to avoid circular dep)
export type { EffectOp } from "./effects.js";
export type {
  BaseEffect,
  Effect,
  EffectResult,
  EffectQueue,
  EffectCondition,
  EffectContext,
  EffectByOp,
  // Combat ops
  DamageOps,
  DamageEffect,
  DestroyOps,
  DestroyEffect,
  BanishOps,
  BanishEffect,
  RestoreOps,
  RestoreEffect,
  LeaderOps,
  // Resource ops
  ResourceOps,
  ResourceEffect,
  GateOps,
  GateEffect,
  DrawOps,
  DrawEffect,
  HandOps,
  HandEffect,
  DeckOps,
  DeckEffect,
  CrestOps,
  CrestEffect,
  // Fuse ops
  FuseOps,
  FuseEffect,
  // Board ops
  SummonOps,
  SummonEffect,
  ReturnOps,
  ReturnEffect,
  AmuletOps,
  AmuletEffect,
  TransformOps,
  TransformEffect,
  // Buff ops
  BuffOps,
  BuffEffect,
  AttacksOps,
  AttacksEffect,
  KeywordOps,
  KeywordEffect,
  CostOps,
  CostEffect,
  CounterOps,
  CounterEffect,
  SpellboostOps,
  SpellboostEffect,
  CountdownOps,
  CountdownEffect,
  // Misc ops
  MiscOps,
  MiscEffect,
  EvolveOps,
  EvolveEffect,
  SpecialOps,
  SpecialEffect,
} from "./effects.js";

// Game types
export type { GameState, StartGameOptions } from "./game.js";

// Action types
export type {
  TargetSpec,
  PlayCardAction,
  AttackAction,
  ChooseTargetAction,
  ActionType,
  ActionByType,
  PlayerAction,
  HistoryAction,
  GameAction,
} from "./actions.js";
