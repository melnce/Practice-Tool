// Mock global window object for browser-dependent code
if (typeof window === "undefined") {
    const noop = () => { };
    const win: any = {
        addEventListener: noop,
        removeEventListener: noop,
        location: { search: "" },
        requestAnimationFrame: (cb: any) => setTimeout(cb, 16),
        cancelAnimationFrame: noop,
        cardDatabase: {}, // used by cardDatabase.js
        APP_ROOT: "/",
    };
    (global as any).window = win;
    (global as any).document = {
        addEventListener: noop,
        removeEventListener: noop,
        getElementById: () => null,
        querySelector: () => null,
        createElement: () => ({ style: {}, classList: { add: noop, remove: noop } }),
        body: { appendChild: noop },
    };
    (global as any).HEADLESS = true;

    // Mock fetch to read from filesystem
    const fs = await import("fs");
    const path = await import("path");

    (global as any).fetch = async (url: string) => {
        // Handle /decks/... or /all_cards.json
        // Map URL path to local project root

        let valid = false;
        let filePath = "";

        const cleanUrl = url.replace(/^[./]+/, "").replace(/^\//, "");

        // Try resolving relative to CWD (Project Root)
        const potentialPath = path.resolve(process.cwd(), cleanUrl);

        if (fs.existsSync(potentialPath)) {
            filePath = potentialPath;
            valid = true;
        }

        if (!valid) {
            // Fallback for missing decks
            if (url.includes("sample_blue") || url.includes("sample_red")) {
                return {
                    ok: true,
                    json: async () => ({
                        cards: [{ name: "Goblin", count: 40 }]
                    })
                };
            }
            console.warn(`Mock fetch 404: ${url} -> ${potentialPath}`);
            return { ok: false, status: 404, statusText: "Not Found" };
        }

        const content = fs.readFileSync(filePath, "utf-8");
        return {
            ok: true,
            json: async () => JSON.parse(content)
        };
    };
}

export { };
