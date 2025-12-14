
import { describe, it, expect } from "vitest";
import { generateReportData } from "../tools/report_unresolved_cards.js";

describe("Unresolved Report Generator", () => {
    it("should aggregate and normalize clauses", () => {
        const mockCards = [
            { id: "1", unresolved: ["Gain +1/+1.", "  Gain +1/+1 "] },
            { id: "2", unresolved: ["Gain +1/+1."] },
            { id: "3", unresolved: ["Storm."] }
        ];

        const { stats, ranking } = generateReportData(mockCards);

        expect(stats.totalCards).toBe(3);
        expect(stats.cardsWithUnresolved).toBe(3); // all have something
        expect(stats.totalUnresolvedClauses).toBe(4);

        // "Gain +1/+1" should be merged (3 instances)
        expect(ranking[0].text).toBe("Gain +1/+1");
        expect(ranking[0].count).toBe(3);

        // "Storm" (1 instance)
        expect(ranking[1].text).toBe("Storm");
        expect(ranking[1].count).toBe(1);
    });

    it("should handle empty unresolved lists", () => {
        const mockCards = [
            { id: "1", unresolved: [] },
            { id: "2" } // missing prop
        ];

        const { stats, ranking } = generateReportData(mockCards);
        expect(stats.cardsWithUnresolved).toBe(0);
        expect(ranking.length).toBe(0);
    });
});


