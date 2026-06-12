// tests/mechanics/ralmia-selection.test.ts
/**
 * Ralmia (10174130) hand-artifact selector UX contract.
 *
 * Card text: Fanfare — select up to 3 Artifact followers in hand (≤5 cost),
 * summon an exact copy of each.
 *
 * Engine UX (not a rules regression): multi-select resolves on click without a
 * separate confirmation step (`requiresConfirmation: false`). When fewer legal
 * targets exist than the select cap, the player must pick all available.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import { givenGameState, createCard } from "../harness/builders.js";
import { handleSelectHandSummonArtifactCopy } from "../../src/logic/effects/ops/summon_ops/hand.js";
import { getPendingTarget, clearPendingTarget } from "../../src/logic/core/pendingTarget/index.js";

describe("Ralmia Artifact Selection", () => {
    beforeEach(() => {
        clearPendingTarget();
    });

    // Helper to create artifact followers in hand
    function setupArtifactsInHand(count: number) {
        const artifacts = [];
        for (let i = 0; i < count; i++) {
            artifacts.push({
                name: `Artifact ${i + 1}`,
                type: "Follower",
                tribes: ["Artifact"],
                cost: 3,
                attack: 2,
                defense: 2,
            });
        }

        givenGameState({ seed: 42 })
            .withFirstHand(artifacts as any)
            .withFirstPP(10, 10)
            .build();
    }

    it("should auto-resolve when exactly 1 artifact is available", () => {
        setupArtifactsInHand(1);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeNull();
    });

    it("should require selecting ALL artifacts when 2 in hand", () => {
        setupArtifactsInHand(2);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(2); // Must select both
    });

    it("should require selecting ALL artifacts when 3 in hand", () => {
        setupArtifactsInHand(3);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(3); // Must select all 3
    });

    it("should allow choosing 3 when 4 or more artifacts in hand", () => {
        setupArtifactsInHand(4);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(3); // Choose 3 of 4
    });

    it("should allow choosing 3 when 5 artifacts in hand", () => {
        setupArtifactsInHand(5);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(3); // Choose 3 of 5
    });

    it("should not require confirmation for artifact copy selection", () => {
        setupArtifactsInHand(2);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending?.requiresConfirmation).toBe(false);
    });
});
