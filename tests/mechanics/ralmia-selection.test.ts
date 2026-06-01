// tests/mechanics/ralmia-selection.test.ts
// UNVERIFIED — owner to audit card-text correctness post-overhaul.
// Tests for Ralmia artifact selection behavior

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

    it("should require selecting ALL artifacts when 1 in hand", () => {
        setupArtifactsInHand(1);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(1); // Must select the 1 available
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

    it("should always require confirmation since order matters", () => {
        setupArtifactsInHand(2);

        const eff = { op: "summon", source: "hand", mode: "copy", filter: { type: "Artifact" }, max_cost: 5, select: 3, count: 3 };
        handleSelectHandSummonArtifactCopy(eff as any, "first", []);

        const pending = getPendingTarget();
        expect(pending?.requiresConfirmation).toBe(true);
    });
});
