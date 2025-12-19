// src/ui/zones.ts
import { byId, clear } from "./dom.js";
import { isOwnBoard, isBoardZone } from "../helpers/board.js";
import { previewHandStats } from "../helpers/enhance.js";
import { computeHandGlow } from "./helpers/glow.js";
import { attachTooltip } from "./tooltips.js";
import { applyKeywordOverlays, applyBarrierOverlay } from "./overlays.js";
import {
    enableCardDragFromHand,
    enableBoardDropForOwnSide,
    enableCardEvoDrop,
    enableAttackerDrag,
    enableEnemyFollowerDrop
} from "./drag.js";
import { GameState, CardInstance, Player } from "../core/types.js";


const logic = () => import(/* webpackIgnore: true */ "../logic/index.js");
const engageLogic = () => import(/* webpackIgnore: true */ "../logic/effects/ops/engage.js");




function buildCardDiv(card: CardInstance, id: string) {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.uid = card.uid;
    div.id = id;
    const imgSrc = card.base_image || card.image || "placeholder.jpg";

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "card-image-wrapper";

    const img = document.createElement("img");
    img.src = String(imgSrc);
    img.alt = card.name;

    const topLeft = document.createElement("div");
    topLeft.className = "card-stats top-left";

    // Add spellboost counter container
    const spellboostContainer = document.createElement("div");
    spellboostContainer.className = "spellboost-container";

    const bottomLeft = document.createElement("div");
    bottomLeft.className = "card-stats bottom-left";

    const bottomRight = document.createElement("div");
    bottomRight.className = "card-stats bottom-right";

    imageWrapper.append(img, topLeft, spellboostContainer, bottomLeft, bottomRight);
    div.appendChild(imageWrapper);
    return { div, imageWrapper, topLeft, spellboostContainer, bottomLeft, bottomRight };
}

// ===== helper to detect + read spellboost count safely =====
function getSpellboostCount(card: CardInstance) {
    if (!card || typeof card !== "object") return null;

    // First check if the card has the spellboost keyword
    const hasSpellboost = Array.isArray(card.keywords) &&
        card.keywords.some(k =>
            (typeof k === "string" && k.toLowerCase() === "spellboost") ||
            (typeof k === "object" && k.name && k.name.toLowerCase() === "spellboost")
        );

    if (!hasSpellboost) return null;

    // Preferred explicit counter keys (use whichever your logic populates)
    const keys = [
        "spellboostCount",
        "spellBoostCount",
        "spellboosts",
        "spell_boosts",
        "spellboost_counter"
    ];

    for (const k of keys) {
        const v = card[k];
        if (Number.isFinite(Number(v))) return Number(v);
    }

    // If the card is known to be spellboost-able but has no counter yet, show 0
    return 0;
}

export function renderZone(containerId: string, cards: CardInstance[], state: GameState, rerender: () => void, clickable = false, onClick?: (i: number) => void) {
    const container = byId(containerId);
    if (!container) return; // Guard for safety
    clear(container);

    const isMulligan = state.phase === "mulligan";
    const isHand = containerId === "blueHand" || containerId === "redHand";
    const isBlueHand = containerId === "blueHand";
    const owner: Player = isBlueHand ? "blue" : "red";
    const isBlueBoard = containerId === "blueBoard";
    const isRedBoard = containerId === "redBoard";
    const isBoard = isBoardZone(containerId);
    const isMyBoard = isOwnBoard(containerId, state);

    // allow dropping from own hand to own board
    if (isBoard && isMyBoard && !isMulligan) {
        container.ondragover = (e) => e.preventDefault();
        enableBoardDropForOwnSide(container, containerId, state);
    }

    cards.forEach((card, i) => {
        const isFollower = card.type === "Follower";
        const isAmulet = card.type === "Amulet";
        const isSpell = card.type === "Spell";

        const { div, imageWrapper, topLeft, spellboostContainer, bottomLeft, bottomRight } =
            buildCardDiv(card, `${containerId}-${i}`);

        // HiDPI sharpness trick
        div.classList.add("hidpi");



        // === COST & PREVIEW STATS (hand only)
        const availablePP = isHand ? (isBlueHand ? state.bluePP : state.redPP) : 0;
        const preview = isHand
            ? previewHandStats(card, availablePP)
            : { shownCost: Number(card.cost) || 0, atkDisp: Math.max(0, Number(card.attack) || 0), defDisp: Number(card.defense) || 0, tier: null };

        const handMod = Number(card.cost_mod) || 0;

        // If an enhance tier is active, show its printed cost.
        // Otherwise, add the temporary hand modifier to base cost.
        let shownCost = Number(preview.shownCost) || 0;
        if (!(preview as any).tier) {
            shownCost = Math.max(0, shownCost + handMod);
        }

        const { atkDisp, defDisp, tier } = preview as any;

        // expose shownCost so glow can use it
        card.shownCost = shownCost;

        // (keep your existing lines that render cost/atk/def, e.g.)
        topLeft.textContent = String(shownCost);

        // --- Spellboost counter badge (below cost) ---
        // Clear previous spellboost counter
        const existingSB = spellboostContainer.querySelector(".spellboost-badge");
        if (existingSB) existingSB.remove();

        const sbCount = getSpellboostCount(card);
        if (sbCount !== null && sbCount > 0) {
            const sb = document.createElement("div");
            sb.className = "spellboost-badge";
            sb.textContent = String(sbCount);
            spellboostContainer.appendChild(sb);
        }

        // follower / amulet / spell display
        if (isFollower) {
            bottomLeft.textContent = String(Math.max(0, atkDisp));
            bottomRight.textContent = String(defDisp);
        } else if (isAmulet) {
            bottomLeft.style.display = "none";

            // Countdown first
            if (card.hasCountdown && Number.isFinite(Number(card.countdown))) {
                bottomRight.style.display = "block";
                bottomRight.className = "card-stats bottom-right countdown-badge";
                bottomRight.textContent = String(Math.max(0, Number(card.countdown)));
            } else {
                // Any named counter
                let shown = false;
                if (card.counters && typeof card.counters === "object") {
                    const entries = Object.entries(card.counters)
                        .filter(([, v]) => Number.isFinite(Number(v)));
                    if (entries.length) {
                        const first = entries[0];
                        if (first) {
                            const [, val] = first;  // show the first numeric counter
                            bottomRight.style.display = "block";
                            bottomRight.className = "card-stats bottom-right countdown-badge";
                            bottomRight.textContent = String(Number(val));
                            shown = true;
                        }
                    }
                }
                if (!shown) bottomRight.style.display = "none";
            }
        }
        // === Flight of Icarus badge (hand or board)
        if (card.__icarusBuff) {
            const badge = document.createElement("div");
            badge.className = "icarus-badge";
            badge.textContent = "!";

            // simple “!” in a circle, positioned below the cost
            Object.assign(badge.style, {
                position: "absolute",
                top: "28px",        // was 6px; lowered to avoid the PP/cost badge
                left: "6px",
                width: "18px",
                height: "18px",
                lineHeight: "18px",
                borderRadius: "50%",
                background: "rgba(255, 215, 0, 0.95)",
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "900",
                fontSize: "12px",
                boxShadow: "0 0 4px rgba(0,0,0,0.6)",
                zIndex: "3"
            });

            imageWrapper.appendChild(badge);
        }



        if (isSpell) { // Spell or other non-permanent
            bottomLeft.style.display = "none";
            bottomRight.style.display = "none";
            div.classList.add("spell");
        }

        if (!isBoard) {
            const isPlayersTurn = (isBlueHand && state.isBlueTurn) || (!isBlueHand && !state.isBlueTurn);
            const availablePP = isHand ? (isBlueHand ? state.bluePP : state.redPP) : 0;

            card.shownCost = shownCost; // so glow helper sees preview cost

            const { glowClass } = computeHandGlow(card, {
                state,
                owner,
                isPlayersTurn,
                availablePP,
                isSpell,
                tier,
            });

            if (glowClass) div.classList.add(glowClass);
        }




        // === stat color logic (buffed/damaged)
        if (isFollower) {

            // --- STAT CALCULATION & CORRECTION ---
            // 1. Initialize base stats ONCE. This is the card's printed value and should not change.
            if (card.base_attack === undefined) card.base_attack = Number(card.attack) || 0;
            if (card.base_defense === undefined) card.base_defense = Number(card.defense) || 0;

            // 2. Ensure the buff tracking object exists.
            if (!card.buffs) card.buffs = { attack: 0, defense: 0 };

            // 3. ALWAYS recalculate potential stats from base and buffs during every render.
            // This corrects any state corruption from other game logic and becomes the single source of truth.
            card.potential_attack = (card.base_attack as number) + (card.buffs?.attack ?? 0);
            card.potential_defense = (card.base_defense as number) + (card.buffs?.defense ?? 0);

            // 4. Determine the card's visual state based on this corrected data.
            card.isDamaged = (Number(card.defense) || 0) < (card.potential_defense as number);
            const isAttackBuffed = atkDisp > (card.base_attack as number);
            const isAttackDebuffed = atkDisp < (card.base_attack as number);
            const isDefenseBuffed = defDisp > (card.base_defense as number);

            // --- APPLY CSS CLASSES ---
            bottomLeft.classList.remove("stat-buffed", "stat-damaged");
            bottomRight.classList.remove("stat-buffed", "stat-damaged");

            // Attack coloring
            if (isAttackBuffed) {
                bottomLeft.classList.add("stat-buffed");
            } else if (isAttackDebuffed) {
                bottomLeft.classList.add("stat-damaged");
            }

            // Defense coloring (Damage takes priority)
            if ((card as any).isDamaged) {
                bottomRight.classList.add("stat-damaged");
            } else if (isDefenseBuffed) {
                bottomRight.classList.add("stat-buffed");
            }
        }
        // === overlays
        if (isBoard) {
            if (card.hasEvolved && card.evoType === "super") div.classList.add("super-evo");
            applyKeywordOverlays(div, card);
        }
        if (isBoard) applyBarrierOverlay(div, card);

        // === attack highlight (own board)
        if (isBoard && isFollower && card.can_attack && !card.hasAttacked && isMyBoard) {
            // Check keywordState for cant_attack restrictions
            const ks = card.keywordState || {};
            const hasCantAttack = ks.cantAttack || ks.cantAttackFollowers || ks.cantAttackLeaders || ks.hasCantAttack;
            if (!hasCantAttack) {
                if (card.isRush && card.justPlayed) div.classList.add("rush-glow");
                else div.classList.add("can-attack");
            }
        }




        // === tooltip
        const tooltipEl = document.getElementById("cardTooltip");
        if (tooltipEl) attachTooltip(div, tooltipEl, card, containerId.includes("blue"));

        // === interactions
        if (isHand) {
            if (state.phase === "mulligan" && card.__mulliganSelectable) {
                div.classList.add("selectable");
                // Mulligan Selection Logic
                if (card.__mulliganSelected) {
                    const check = document.createElement("div");
                    check.className = "selected-check";
                    check.textContent = "✓";
                    Object.assign(check.style, {
                        position: "absolute", top: "6px", right: "8px",
                        fontSize: "20px", fontWeight: "900", color: "#2ecc71",
                        textShadow: "0 0 2px rgba(0,0,0,0.6)"
                    });
                    div.querySelector(".card-image-wrapper")?.appendChild(check);
                }

                // Toggle click handler
                div.addEventListener("click", (e) => {
                    e.stopPropagation();
                    void import("../logic/mulligan.js").then(({ toggleMulliganPick }) => {
                        toggleMulliganPick(isBlueHand ? "blue" : "red", card.uid);
                    });
                });

                // Block context menu
                div.oncontextmenu = (e) => e.preventDefault();

            } else {
                // Normal Gameplay Logic (Not Mulligan)
                if (clickable && onClick) {
                    // Right-click to play
                    div.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        onClick(i);
                    });
                }

                // Left-click (Fusion / other interactions)
                div.addEventListener('click', (e) => {
                    if (card.__uiSelectable) return; // let selection handler take it

                    const isPlayersTurn = (isBlueHand && state.isBlueTurn) || (!isBlueHand && !state.isBlueTurn);
                    if (!isPlayersTurn) return;

                    // Check for Fuse
                    const hasFuseRecipes = Array.isArray(card.fuse_recipes) && card.fuse_recipes.length > 0;
                    const hasFortifierFuse = Array.isArray(card.fuse) && card.fuse.some(op => op?.op === "start_fortifier_fuse");

                    if (hasFuseRecipes || hasFortifierFuse) {
                        const ownerSide = isBlueHand ? "blue" : "red";
                        void logic().then(({ startFuseFromHand, runEffects }) => {
                            if (hasFuseRecipes) startFuseFromHand(ownerSide, card.uid);
                            else runEffects([{ op: "start_fortifier_fuse", initiator_uid: card.uid }], ownerSide, card);
                        });
                        e.stopPropagation();
                    }
                });

                enableCardDragFromHand(div, card, containerId);
            }
        }

        // evo drop
        if (state.phase !== "mulligan" && isBoard && isFollower) {
            enableCardEvoDrop(div, containerId, card, state, rerender);
        }

        // combat drops
        if (isBoard && isFollower) {
            const player: Player = isBlueBoard ? "blue" : "red";
            const isMyTurn = (state.isBlueTurn && isBlueBoard) || (!state.isBlueTurn && isRedBoard);
            const isEnemyBoard = !isMyTurn;
            if (isMyTurn && card.can_attack) enableAttackerDrag(div, player, i);
            if (isEnemyBoard) enableEnemyFollowerDrop(div, null, i, state, isRedBoard);
        }

        // Engage (amulets)
        if (state.phase !== "mulligan" && isBoard && isAmulet && card.hasEngage) {
            const ownerSide = isBlueBoard ? "blue" : "red";
            const myTurnSide = (isBlueBoard && state.isBlueTurn) || (isRedBoard && !state.isBlueTurn);
            const cost = Number(card.keywordState?.engageCost ?? card.engageCost ?? 0);
            const enoughPP = ownerSide === "blue" ? state.bluePP >= cost : state.redPP >= cost;

            // Default = once per turn unless explicitly disabled
            const oncePerTurn = card.engageOncePerTurn !== false;
            const alreadyEngaged = !!card.keywordState?.engagedThisTurn;
            const readyThisTurn = oncePerTurn ? !alreadyEngaged : true;

            const canEngage = myTurnSide && enoughPP && readyThisTurn;

            // toggle glow + pointer
            div.classList.toggle("engage-ready", !!canEngage);
            div.style.cursor = canEngage ? "pointer" : "";

            // ensure we don't accumulate multiple listeners across renders
            div.oncontextmenu = null;

            if (canEngage) {
                div.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void engageLogic().then(({ engageAmulet }) => engageAmulet(ownerSide, i));
                }, { once: true });
            }
        }

        // Target selection resolver
        // Selection resolver – works for hand and board
        // isMulligan is not defined in this scope, assuming it should be state.phase !== "mulligan"
        if (state.phase !== "mulligan" && card.__uiSelectable) {
            div.classList.add("selectable");

            // Visual: mark selected with a check
            const isSelected = Array.isArray(state.pendingTargetEffect?.targets) &&
                state.pendingTargetEffect!.targets.some((t: any) => t.uid === card.uid);

            if (isSelected) {
                div.classList.add("selected");
                // Create/ensure a green check overlay
                const check = document.createElement("div");
                check.className = "selected-check";
                check.textContent = "✓";
                // Position over the image
                check.style.position = "absolute";
                check.style.top = "6px";
                check.style.right = "8px";
                check.style.fontSize = "20px";
                check.style.fontWeight = "900";
                check.style.color = "#2ecc71"; // green
                check.style.textShadow = "0 0 2px rgba(0,0,0,0.6)";
                // Put on top of the card image wrapper
                div.querySelector(".card-image-wrapper")?.appendChild(check);
            }

            // Allow repeated click to toggle selection
            div.addEventListener("click", (e) => {
                e.stopPropagation();
                void logic().then(({ resolvePendingTarget }) => resolvePendingTarget(card.uid));
            });
        }

        // finally append this card to the zone
        container.appendChild(div);
    }); // <- closes forEach
}
