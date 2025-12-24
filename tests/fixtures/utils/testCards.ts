import { CardInstance } from "../../../src/core/types";

/**
 * A minimal vanilla follower: 1/1, 1 PP.
 */
export const vanillaFollower: CardInstance = {
  uid: "test_vanilla_1",
  name: "Vanilla Follower",
  type: "Follower",
  cost: 1,
  base_cost: 1,
  attack: 1,
  defense: 1,
  base_attack: 1,
  base_defense: 1,
  can_attack: false,
  description: "A vanilla 1/1 follower.",
};

/**
 * A damage spell: Deal 3 damage to enemy follower.
 */
export const damageSpell: CardInstance = {
  uid: "test_damage_spell_1",
  name: "Damage Spell",
  type: "Spell",
  cost: 2,
  base_cost: 2,
  description: "Deal 3 damage to an enemy follower.",
  spell: [
    {
      op: "damage",
      target: "enemy:follower",
      amount: 3,
    },
  ],
};

/**
 * A leader barrier spell: Give leader a barrier.
 */
export const barrierSpell: CardInstance = {
  uid: "test_barrier_spell_1",
  name: "Barrier Spell",
  type: "Spell",
  cost: 1,
  base_cost: 1,
  description: "Give your leader a barrier.",
  spell: [
    {
      op: "leader_barrier",
      count: 1,
    },
  ],
};

/**
 * An evolve-capable follower: 2/2 -> 4/4.
 */
export const evolveFollower: CardInstance = {
  uid: "test_evolve_follower_1",
  name: "Evolve User",
  type: "Follower",
  cost: 2,
  base_cost: 2,
  attack: 2,
  defense: 2,
  base_attack: 2,
  base_defense: 2,
  can_evolve: true,
  evos: {
    attack: 2,
    defense: 2,
  },
  description: "Can evolve to gain +2/+2.",
};

/**
 * A summon spell: Summons a "Fairy".
 */
export const summonSpell: CardInstance = {
  uid: "test_summon_spell_1",
  name: "Summon Spell",
  type: "Spell",
  cost: 1,
  base_cost: 1,
  description: "Summon a Fairy.",
  spell: [
    {
      op: "summon",
      name: "Fairy",
      count: 1,
    },
  ],
};

/**
 * A fuse component (Gear of Ambition-like).
 */
export const fuseEnabler: CardInstance = {
  uid: "test_fuse_enabler_1",
  name: "Fuse Enabler",
  type: "Spell",
  cost: 0,
  base_cost: 0,
  description: "Can be fused.",
};

/**
 * A card with Spellboost cost reduction.
 */
export const spellboostCard: CardInstance = {
  uid: "test_spellboost_1",
  name: "Spellboost User",
  type: "Spell",
  cost: 10,
  base_cost: 10,
  description: "Spellboost: Subtract 1 from cost.",
  keywords: [
    {
      name: "Spellboost",
      reduceCostBy: 1,
      minCost: 0,
    },
  ],
};






