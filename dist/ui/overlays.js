// No types import in JS
export function applyKeywordOverlays(div, card) {
    const wrapper = div.querySelector(".card-image-wrapper") ?? div;
    // Create (or reuse) a bottom-center icon stack
    let stack = wrapper.querySelector('.keyword-icon-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'keyword-icon-stack';
        wrapper.appendChild(stack);
    }
    const addIcon = (src, extraClass) => {
        const img = document.createElement('img');
        img.src = src;
        img.className = `keyword-icon ${extraClass || ''}`;
        stack.appendChild(img);
    };
    if (card.hasWard) {
        const overlay = document.createElement("div");
        overlay.classList.add("ward-overlay");
        wrapper.appendChild(overlay);
    }
    if (card.hasAmbush) {
        const overlay = document.createElement("div");
        overlay.classList.add("ambush-overlay");
        wrapper.appendChild(overlay);
    }
    if (card.hasAura || (Array.isArray(card.keywords) &&
        card.keywords.some(k => (typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase()) === "aura"))) {
        const overlay = document.createElement("div");
        overlay.classList.add("aura-overlay");
        wrapper.appendChild(overlay);
    }
    if (card.hasCantAttack) {
        const overlay = document.createElement("div");
        overlay.classList.add("cant_attack-overlay");
        wrapper.appendChild(overlay);
    }
    if (card.hasIntimidate) {
        const overlay = document.createElement("div");
        overlay.classList.add("intimidate-overlay");
        wrapper.appendChild(overlay);
    }
    if (card.hasBane) {
        addIcon("images/icon_bane.png", "bane-icon");
    }
    if (card.hasLastWords || (Array.isArray(card.keywords) && card.keywords.some(k => (k?.name || "").toLowerCase() === "lastwords"))) {
        addIcon("images/icon_last-words.png", "lastwords-icon");
    }
    if (card.hasDrain) {
        addIcon("images/icon_drain.png", "drain-icon");
    }
    if (card.hasOngoing) {
        addIcon("images/icon_ongoing.png", "ongoing-icon");
    }
    if (card.cannotBeDestroyed || (Array.isArray(card.keywords) &&
        card.keywords.some(k => (typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase()) === "cant_be_destroyed"))) {
        const overlay = document.createElement("div");
        overlay.classList.add("cant-be-destroyed-overlay");
        wrapper.appendChild(overlay);
        // Add particles
        for (let i = 0; i < 5; i++) {
            const particle = document.createElement("div");
            particle.classList.add("cant-be-destroyed-particle");
            overlay.appendChild(particle);
        }
    }
    // If multiple icons are present, enable swapping
    const count = stack.children.length;
    stack.classList.toggle('swap-2', count === 2);
    stack.classList.toggle('swap-3', count === 3);
    stack.classList.toggle('swap-4', count >= 4);
}
export function applyBarrierOverlay(div, card) {
    if ((card.barrierCharges || 0) <= 0)
        return;
    const wrap = div.querySelector(".card-image-wrapper") ?? div;
    let ov = wrap.querySelector(".barrier-overlay");
    if (!ov) {
        ov = document.createElement("div");
        ov.className = "barrier-overlay";
        wrap.appendChild(ov);
    }
    ov.setAttribute("data-charges", card.barrierCharges > 1 ? String(card.barrierCharges) : "");
    if (card.__uiFlashBarrier) {
        wrap.classList.add("barrier-flash");
        delete card.__uiFlashBarrier;
        setTimeout(() => wrap.classList.remove("barrier-flash"), 250);
    }
    if (card.__uiPopBarrier) {
        wrap.classList.add("barrier-pop");
        delete card.__uiPopBarrier;
        setTimeout(() => wrap.classList.remove("barrier-pop"), 350);
    }
}
