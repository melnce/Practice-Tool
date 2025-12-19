
export type PlayOutcome =
    | { kind: "blocked"; reason?: string }
    | { kind: "paused" }          // selection/targeting requested by effects
    | { kind: "done" };

export interface PlayedHistoryEntry {
    id: string;
    uid: string;
    name: string;
    type: string;
    cost: number;
    base_image?: string | null;
    ts: number;
}
