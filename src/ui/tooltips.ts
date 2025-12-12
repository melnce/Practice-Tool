// src/ui/tooltips.ts
import { state } from "@core/gameState.js";
import { CardInstance, Player } from "@core/types.js";

// NEW: show +A/+D based only on buffs/debuffs (not damage)
function formatBuffDelta(card: CardInstance) {
    if (!card || card.type !== "Follower") return "";
    const a = Number(card?.buffs?.attack ?? 0);
    const d = Number(card?.buffs?.defense ?? 0);
    if (a === 0 && d === 0) return "";

    const sa = (a >= 0 ? "+" : "") + a;
    const sd = (d >= 0 ? "+" : "") + d;

    // color hint (green if any positive, red if any negative)
    const color = (a < 0 || d < 0) ? "#ff6666" : "#66ff66";

    return `<br><br><span class="buff-delta" style="color:${color};font-weight:700;">${sa}/${sd}</span>`;
}

export function formatCardTooltip(card: CardInstance, owner: Player | null = null) {
    const name = String(card?.name ?? "");
    const clazz = String(card?.class ?? "Neutral");
    const hasTribes = Array.isArray(card?.tribes) && card.tribes.length > 0;
    const tribes = hasTribes ? card.tribes.join(", ") : "";
    const desc = (card?.description ?? "").trim();

    const classLine = hasTribes ? `${clazz}/${tribes}` : clazz;

    // === Fused Loot (unique) section for cards like Sinciro ===
    let fusedSection = "";
    if (Array.isArray(card?._fusedLootNames) && card._fusedLootNames.length > 0) {
        const uniq = Array.from(
            new Set(
                card._fusedLootNames
                    .map(n => String(n || "").trim())
                    .filter(Boolean)
            )
        );
        const count = uniq.length;
        const names = uniq.join(", ");
        fusedSection =
            `<br><br><span style="color: orange;">Fused Loot (unique): ${count}<br>${names}</span>`;
    }

    // === Rally tracker (live) for Gildaria or any Rally card ===
    let rallySection = "";
    const wantsRally =
        String(card?.name).toLowerCase() === "gildaria, anathema of peace" ||
        /\brally\b/i.test(desc);
    if (wantsRally) {
        const side = owner ?? null;
        const m = desc.match(/Rally\s*\((\d+)\)/i);
        const need = m ? parseInt(m[1], 10) : null;
        const initial =
            side === "blue" ? (state.blueRally | 0) :
                side === "red" ? (state.redRally | 0) : 0;
        const initialText = need != null ? `${initial} / ${need}` : `${initial}`;
        rallySection =
            `<br><br><span class="rally-line" data-side="${side ?? ""}" data-need="${need ?? ""}" style="color: orange;">` +
            `Rally: <span class="rally-value">${initialText}</span>` +
            `</span>`;
    }

    // NEW: +A/+D line from buffs only
    const buffDelta = formatBuffDelta(card);

    return `${name}
  
${classLine}

${desc}${fusedSection}${rallySection}${buffDelta}`;
}



export function attachTooltip(div: HTMLElement, tooltipEl: HTMLElement, card: CardInstance, isBlueSide: boolean) {
    div.dataset.hasTooltip = "1";
    const owner: Player = isBlueSide ? "blue" : "red";
    div.onmouseenter = () => {
        // Render once so layout is stable
        tooltipEl.innerHTML = formatCardTooltip(card, owner);
        tooltipEl.style.whiteSpace = "pre-line";
        tooltipEl.style.display = "block";
        // Live refresh: only mutate the rally number when it actually changes
        const rallyLine = tooltipEl.querySelector(".rally-line");
        const rallyValue = tooltipEl.querySelector(".rally-value");
        // === Safe live update (auto-stop) ===
        if (rallyLine && rallyValue) {
            const side = rallyLine.getAttribute("data-side");
            const needAttr = rallyLine.getAttribute("data-need");
            const need = needAttr ? parseInt(needAttr, 10) : null;
            let last = NaN;
            let stopAt = Date.now() + 120000; // hard cap: 2 min

            function tick() {
                // stop reasons: not hovered, node gone, tab hidden, time cap
                if (!div.isConnected || !tooltipEl.isConnected ||
                    document.hidden || !div.matches(':hover') ||
                    Date.now() > stopAt) {
                    // @ts-ignore
                    cancelAnimationFrame(div.__ttRaf || 0);
                    // @ts-ignore
                    div.__ttRaf = null;
                    return;
                }
                const curr =
                    side === "blue" ? (state.blueRally | 0) :
                        side === "red" ? (state.redRally | 0) : 0;
                if (curr !== last) {
                    rallyValue!.textContent = need != null ? `${curr} / ${need}` : `${curr}`;
                    last = curr;
                }
                // @ts-ignore
                div.__ttRaf = requestAnimationFrame(tick);
            }
            // @ts-ignore
            cancelAnimationFrame(div.__ttRaf || 0);
            // @ts-ignore
            div.__ttRaf = requestAnimationFrame(tick);
        } else {
            // @ts-ignore
            cancelAnimationFrame(div.__ttRaf || 0);
            // @ts-ignore
            div.__ttRaf = null;
        }
    };
    div.onmousemove = (e: MouseEvent) => {
        const isBottomHalf = e.clientY > window.innerHeight / 2;
        const left = Math.min(e.clientX + 12, window.innerWidth - tooltipEl.offsetWidth - 12);

        // Smart Anchoring:
        // If in bottom half, anchor to BOTTOM (grow upwards).
        // If in top half, anchor to TOP (grow downwards).
        // This removes offsetHeight dependency and guarantees "stick to edge" behavior.
        if (isBottomHalf) {
            const distanceFromBottom = window.innerHeight - e.clientY + 12;
            tooltipEl.style.bottom = distanceFromBottom + "px";
            tooltipEl.style.top = "auto";
        } else {
            const distanceFromTop = e.clientY + 12;
            tooltipEl.style.top = distanceFromTop + "px";
            tooltipEl.style.bottom = "auto";
        }
        tooltipEl.style.left = Math.max(0, left) + "px";
    };
    div.onmouseleave = () => {
        tooltipEl.style.display = "none";
        // @ts-ignore
        cancelAnimationFrame(div.__ttRaf || 0);
        // @ts-ignore
        div.__ttRaf = null;
    };
}

// Global safety: stop all running loops when page hides/unloads
window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        // cancel any stray RAF stored on hovered elements
        document.querySelectorAll('[data-has-tooltip="1"]').forEach(el => {
            // @ts-ignore
            cancelAnimationFrame(el.__ttRaf || 0);
            // @ts-ignore
            el.__ttRaf = null;
        });
    }
});
