// src/bench/trace/types.ts — JSONL trace contract types (v1)

export type TracePlayer = "a" | "b";

export type Pick =
  | { what: "draw"; chose: string }
  | { what: "coin"; chose: TracePlayer }
  | {
      what: "random_target";
      among?: string;
      chose: { slot: number } | "leader";
    }
  | { what: "random_card"; chose: string }
  | { what: "random_split"; chose: number[] }
  | { what: "random_unused"; chose: { mode: number } }
  | { what: "reanimate"; chose: string }
  | { what: "multiset_pick"; among: string; chose: string }
  | { what: "raw"; site: string; n: number; k: number; kind?: "shuffle" };

export type NeutralAction =
  | {
      mulligan: {
        player: TracePlayer;
        swap: [boolean, boolean, boolean, boolean];
      };
    }
  | { play: { player: TracePlayer; hand_pos: number; card: string } }
  | {
      attack: {
        player: TracePlayer;
        attacker_slot: number;
        target: { slot: number } | "leader";
      };
    }
  | { evolve: { player: TracePlayer; slot: number; super: boolean } }
  | { engage: { player: TracePlayer; slot: number } }
  | {
      fuse: {
        player: TracePlayer;
        host_pos: number;
        partner_pos: number[];
      };
    }
  | { bonus_pp: { player: TracePlayer } }
  | {
      choose: {
        player: TracePlayer;
        option:
          | { card: string }
          | { slot: number }
          | "leader"
          | { mode: number };
      };
    }
  | { confirm: { player: TracePlayer } }
  | { end_turn: { player: TracePlayer } };

export type FieldSlot = {
  attack: number;
  attacks_left: number;
  can_attack: boolean;
  card: string;
  countdown: number | null;
  defense: number;
  evolved: boolean;
  max_defense: number;
  super: boolean;
  traits: string[];
  vars?: Record<string, number>;
  granted?: string[];
};

export type HandEntry = {
  card: string;
  cost: number;
  vars?: Record<string, number>;
  skybound?: number;
};

export type PlayerCanonical = {
  banished: Record<string, number>;
  cemetery: Record<string, number>;
  combo: number;
  crests: Array<{ countdown?: number; id: string }>;
  deck: Record<string, number>;
  earth: number;
  ep: number;
  evolves_used: number;
  faith: number;
  field: (FieldSlot | null)[];
  hand: HandEntry[];
  leader_defense: number;
  leader_max: number;
  pp: number;
  pp_bonus: number;
  pp_max: number;
  rally: number;
  sep: number;
  shadows: number;
};

export type CanonicalPhase =
  | "mulligan"
  | "main"
  | "choice"
  | "end"
  | "terminal";

export type CanonicalState = {
  active: TracePlayer;
  phase: CanonicalPhase;
  players: { a: PlayerCanonical; b: PlayerCanonical };
  turn: number;
  winner: TracePlayer | null;
};

export type TraceHeader = {
  v: 1;
  engine: string;
  seed: number;
  first: TracePlayer;
  deck_a: string[];
  deck_b: string[];
  opening_hands: { a: string[]; b: string[] };
  x_final_hash?: string;
};

export type TraceActionLine = {
  i: number;
  action: NeutralAction;
  rng: Pick[];
  state: CanonicalState;
  legal: NeutralAction[];
};

export type RawRoll =
  | { m: "nextInt"; n: number; k: number; site: string }
  | {
      m: "pick";
      n: number;
      k: number;
      site: string;
      chose: unknown;
    }
  | { m: "shuffle"; n: number; site: string; order: unknown }
  | { m: "nextFloat"; site: string; v: number };
