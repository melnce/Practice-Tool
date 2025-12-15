import { normalizeKeywordName } from "../../../src/logic/core/keywords/registry.js";
import { test, expect, describe } from "vitest";

describe("Keyword Normalization", () => {
    test("Can normalize aliases", () => {
        expect(normalizeKeywordName("banishondeath")).toBe("banish_on_death");
        expect(normalizeKeywordName("skybound art")).toBe("skybound_art");
        expect(normalizeKeywordName("pixieenter")).toBe("pixie_enter");
        expect(normalizeKeywordName("allyenter")).toBe("ally_enter");
        expect(normalizeKeywordName("maxdamagecap")).toBe("max_damage_cap");
    });

    test("Can normalize punctuation and spacing", () => {
        expect(normalizeKeywordName("  Rush  ")).toBe("rush");
        expect(normalizeKeywordName("STORM")).toBe("storm");
        // We do not have auto-punctuation logic beyond trim/lower currently, 
        // relying on explicit aliases for things like "banish-on-death" if they weren't in my immediate list.
        // But let's verify what we have invalid inputs return input lowercased if not in alias map.
        expect(normalizeKeywordName("random_stuff")).toBe("random_stuff");
    });

    test("Canonical keywords return themselves", () => {
        expect(normalizeKeywordName("rush")).toBe("rush");
        expect(normalizeKeywordName("banish_on_death")).toBe("banish_on_death");
    });

    test("Returns null for empty", () => {
        expect(normalizeKeywordName("")).toBe(null);
        // @ts-ignore
        expect(normalizeKeywordName(null)).toBe(null);
    });
});
