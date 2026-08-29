/**
 * Ingest merge-by-id invariant: authored ops survive re-runs.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  mapDotggCardToRepo,
  mergeCardById,
  mergeSetCards,
  planIngest,
  readSetFile,
  setFileName,
  stripSkillText,
  writeSetFile,
  type DotggCard,
  type RepoCard,
} from "../../scripts/lib/ingestCards.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";

const FIXTURE = path.resolve("scripts/fixtures/dotgg-cards-sample.json");

function loadFixture(): { cards: DotggCard[]; sets: unknown[] } {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf-8"));
}

describe("card ingest mapping", () => {
  it("strips HTML skill_text and maps type 4 → Spell", () => {
    const { cards } = loadFixture();
    const flare = cards.find((c) => c.id === "10433310")!;
    expect(mapDotggCardToRepo(flare).type).toBe("Spell");
    expect(flare.skill_text).toMatch(/</);
    const desc = stripSkillText(flare.skill_text);
    expect(desc).not.toMatch(/</);
    expect(desc.length).toBeGreaterThan(0);
  });

  it("preserves specific_effects (Accelerate / Crystallize / Crest)", () => {
    // Synthetic Accelerate payload — not in the tiny fixture sample
    const mapped = mapDotggCardToRepo({
      id: "99999999",
      name: "Test Accelerate",
      skill_text: "Fanfare: Do a thing.",
      class: "3",
      color: "Runecraft",
      type: "Follower",
      cost: "5",
      atk: "3",
      life: "5",
      rarity: "4",
      tribes: [],
      setId: "10005",
      set_name: "Blossoming Fate",
      is_token: "0",
      image: "https://static.dotgg.gg/shadowverse/cards/99999999.webp",
      specific_effects: [
        {
          specific_effect_type: 3,
          cost: 2,
          skill_text: "Deal 1 damage.",
          name: "Accelerate",
        },
      ],
    });
    expect(mapped.specific_effects).toEqual([
      {
        specific_effect_type: 3,
        cost: 2,
        skill_text: "Deal 1 damage.",
        name: "Accelerate",
      },
    ]);
  });

  it("uses SET_NAME_FALLBACKS when DotGG set metadata is missing", () => {
    const mapped = mapDotggCardToRepo({
      id: "10901110",
      name: "Jailor of Antiquity",
      skill_text: "Fanfare: Deal 6.",
      class: "0",
      color: "Neutral",
      type: "Follower",
      cost: "6",
      atk: "6",
      life: "6",
      rarity: "1",
      tribes: [],
      setId: "10009",
      set_name: "",
      is_token: "0",
      image: "https://static.dotgg.gg/shadowverse/cards/10901110.webp",
    });
    expect(mapped.set).toBe("[10009] Revenants of Azvaldt");
    expect(setFileName("10009", "Revenants of Azvaldt")).toBe(
      "10009_revenants-of-azvaldt.json",
    );
  });

  it("applies CARD_TYPE_OVERRIDES for DotGG Spell mislabels", () => {
    const mapped = mapDotggCardToRepo({
      id: "10963210",
      name: "Juratio",
      skill_text: "Engage (1): Destroy this card.",
      class: "6",
      color: "Havencraft",
      type: "Spell",
      cost: "6",
      atk: "0",
      life: "0",
      rarity: "3",
      tribes: [],
      setId: "10009",
      set_name: "Revenants of Azvaldt",
      is_token: "0",
      image: "https://static.dotgg.gg/shadowverse/cards/10963210.webp",
    });
    expect(mapped.type).toBe("Amulet");
    expect(mapped).not.toHaveProperty("spell");
    expect(mapped.fanfare).toEqual([]);
  });

  it("applies Trap in the Woods amulet override (not DotGG Spell)", () => {
    const mapped = mapDotggCardToRepo({
      id: "10911210",
      name: "Trap in the Woods",
      skill_text:
        "Whenever an enemy follower enters the field, destroy it and this card.",
      class: "1",
      color: "Forestcraft",
      type: "Spell",
      cost: "3",
      atk: "0",
      life: "0",
      rarity: "1",
      tribes: [],
      setId: "10009",
      set_name: "Revenants of Azvaldt",
      is_token: "0",
      image: "https://static.dotgg.gg/shadowverse/cards/10911210.webp",
    });
    expect(mapped.type).toBe("Amulet");
    expect(mapped).not.toHaveProperty("spell");
    expect(mapped.fanfare).toEqual([]);
  });
});

describe("merge-by-id never clobbers authored ops", () => {
  it("keeps hand-authored fanfare/evolve/triggers across two merges", () => {
    const authored: RepoCard = {
      id: "10422110",
      name: "Aglovale, Lord of Frost",
      cost: "4",
      attack: "4",
      defense: "4",
      type: "Follower",
      class: "Swordcraft",
      rarity: "Gold",
      tribes: [],
      description: "Fanfare: Do something authored.",
      base_image: "https://example.test/base.webp",
      evo_image: "https://example.test/evo.webp",
      set: "[10004] Skybound Dragons",
      url: "https://shadowverse.gg/cards/10422110",
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 99,
          count: 1,
          distribution: "random_hits",
        },
      ],
      evolve: [{ op: "draw", source: "deck", player: "self", count: 1 }],
      superevolve: [],
      keywords: ["Ward"],
      triggers: [
        {
          event: "strike",
          effects: [{ op: "restore", target: "self_leader", amount: 1 }],
        },
      ],
    };

    const { cards } = loadFixture();
    const incoming = mapDotggCardToRepo(
      cards.find((c) => c.id === "10422110")!,
    );

    // First merge
    const first = mergeCardById(authored, incoming);
    expect(first.card.fanfare).toEqual(authored.fanfare);
    expect(first.card.evolve).toEqual(authored.evolve);
    expect(first.card.triggers).toEqual(authored.triggers);
    expect(first.card.keywords).toEqual(authored.keywords);
    // Empty arrays on authored stubs must also survive
    expect(first.card.superevolve).toEqual([]);

    // Second merge (re-run ingest) — still intact
    const second = mergeCardById(first.card, incoming);
    expect(second.card.fanfare).toEqual(authored.fanfare);
    expect(second.card.evolve).toEqual(authored.evolve);
    expect(second.card.triggers).toEqual(authored.triggers);
    expect(second.card.keywords).toEqual(["Ward"]);
  });

  it("adds new cards and leaves authored neighbors alone (fixture, twice)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-test-"));
    try {
      const { cards, sets } = loadFixture();
      const plan = planIngest(cards, sets as never);

      // Seed 10004 with one authored card only
      const authoredFanfare = [
        { op: "draw", source: "deck", player: "self", count: 7 },
      ];
      const seed: RepoCard = {
        id: "10422110",
        name: "Aglovale, Lord of Frost",
        cost: "4",
        attack: "4",
        defense: "4",
        type: "Follower",
        class: "Swordcraft",
        rarity: "Gold",
        tribes: [],
        description: "AUTHORDESC",
        base_image: "x",
        evo_image: "y",
        set: "[10004] Skybound Dragons",
        url: "u",
        fanfare: authoredFanfare,
        evolve: [],
        superevolve: [],
        keywords: [],
        triggers: [],
      };
      const set04 = plan.sets.get("10004")!;
      const file04 = path.join(tmp, set04.fileName);
      writeSetFile(file04, [seed]);

      const runOnce = () => {
        const existing = readSetFile(file04);
        const { cards: merged } = mergeSetCards(existing, set04.incoming);
        writeSetFile(file04, merged);
        return merged;
      };

      const after1 = runOnce();
      const after2 = runOnce();

      const kept1 = after1.find((c) => c.id === "10422110")!;
      const kept2 = after2.find((c) => c.id === "10422110")!;
      expect(kept1.fanfare).toEqual(authoredFanfare);
      expect(kept2.fanfare).toEqual(authoredFanfare);
      expect(kept2.description).toBe("AUTHORDESC"); // fill-missing only

      // New set 10005 cards appear
      const set05 = plan.sets.get("10005")!;
      const file05 = path.join(tmp, set05.fileName);
      const { cards: merged05 } = mergeSetCards([], set05.incoming);
      writeSetFile(file05, merged05);
      expect(merged05.length).toBe(3);
      expect(getImplementationStatus(merged05[0]!)).toBe("unimplemented");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("implementation status derivation", () => {
  it("classifies evergreen-only as implemented and text-without-ops as unimplemented", () => {
    expect(
      getImplementationStatus({
        id: "1",
        name: "Vanilla Ward",
        description: "Ward",
        keywords: ["Ward"],
        fanfare: [],
      }),
    ).toBe("ops_present");

    expect(
      getImplementationStatus({
        id: "2",
        name: "Stub",
        description: "Fanfare: Deal 5 damage to the enemy leader.",
        keywords: [],
        fanfare: [],
      }),
    ).toBe("unimplemented");

    expect(
      getImplementationStatus({
        id: "3",
        name: "Unknown op",
        description: "Fanfare: Do a mystery.",
        fanfare: [{ op: "not_a_real_op", amount: 1 }],
      }),
    ).toBe("unknown_ops");
  });
});
