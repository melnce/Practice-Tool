// core/resolveTarget.js
// This file has been updated to handle multi-targeting effects.

import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { runEffects } from "@logic/core/effects.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { dealDamage } from "@logic/core/barrier.js";
import { applyKeyword, handleRemoveKeyword } from "@logic/core/keywords.js";
import { transformTarget, transformHandTarget } from "@logic/effects/ops/transform.js";
import { resolveDestroy } from "@logic/effects/ops/destroy.js";
import { handleBanish } from "@logic/effects/ops/banish.js";
import { bounceToHand } from "@logic/effects/ops/bounce.js";
import { resolveReturnHandToDeck } from "@logic/effects/ops/returnHandToDeck.js";
import { clearSelectableFlags } from "@logic/core/targeting.js";
import { isOverflow } from "@helpers/overflow.js";
import { onEvolve } from "@logic/evolveUtils.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { summonNamed, summonExactCopyFromHand } from "@logic/effects/ops/summon.js";
import { applyLeaderDamage } from "@logic/effects/leader.js";
import {
  fuse_finalize_generic as opFinalizeFuseGeneric,
  fuse_finalize_fortifier as opFinalizeFortifierFuse,
  fuse_finalize_gear_multi as opFinalizeGearMulti,
  fuse_finalize_alpha as opFinalizeAlphaFuse,
  fuse_finalize_gardens_allure as opFinalizeGardensAllure,
  fuse_finalize_loot as opFinalizeLootFuse,
} from "@logic/effects/ops/fuse/fuse.js";

import { getCardDetails } from "@data/cardDatabase.js";
import { handleEvolveSelf } from "@logic/effects/ops/evolve.js";
import { logEvent } from "@core/logger.js";
import { doAction } from "@core/history.js";



// --- BEGIN shared injection helpers ---
function _ensureInjectState(card) {
  if (card.__injectInit) return;
  card.__injectInit = true;

  // Save the original description once
  card.__descBase = card.__descBase ?? (card.description || "");

  // Hold unique HTML chunks and badge lines
  card.__descChunks = card.__descChunks || [];
  card.__descSet = card.__descSet || new Set();

  card.__badgeLines = card.__badgeLines || [];
  card.__badgeSet = card.__badgeSet || new Set();
}

function injectDescAndBadge(card, htmlChunk, badgeLines) {
  _ensureInjectState(card);

  // Add unique HTML chunk
  if (htmlChunk && !card.__descSet.has(htmlChunk)) {
    card.__descSet.add(htmlChunk);
    card.__descChunks.push(htmlChunk);
  }

  // Add unique badge lines
  for (const line of (Array.isArray(badgeLines) ? badgeLines : [badgeLines]).filter(Boolean)) {
    if (!card.__badgeSet.has(line)) {
      card.__badgeSet.add(line);
      card.__badgeLines.push(line);
    }
  }

  // Rebuild description: base + all injected chunks, separated by <br>
  const parts = [];
  if (card.__descBase) parts.push(card.__descBase);
  if (card.__descChunks.length) parts.push(...card.__descChunks);
  card.description = parts.join("<br>");

  // Reuse the Icarus badge plumbing
  card.__icarusBuff = true;
  card.__icarusBadgeText = card.__badgeLines.join("\n");
}
// --- END shared injection helpers ---



function showConfirmationButton(pending) {
  const container = document.getElementById('targetingConfirmation');
  if (!container) return;

  container.innerHTML = '';

  const button = document.createElement('button');
  button.className = 'confirm-targets-btn';
  button.textContent = (pending.confirmationText || 'Confirm Selection') +
    (Array.isArray(pending.targets) ? ` (${pending.targets.length})` : '');

  button.addEventListener('click', () => {
    // Make confirming targets a single undoable step
    doAction("Confirm Targets", () => {
      const { eff, owner, sourceCard, targets, resumeEffects } = pending;
      logEvent("targetsConfirmed", {
        op: pending?.eff?.op,
        owner,
        source: pending?.sourceCard?.name,
        sourceUid: pending?.sourceCard?.uid,
        targets: (pending?.targets || []).map(t => ({ name: t?.name, uid: t?.uid, type: t?.type }))
      });
      // If this is a nested effect (select → effects), run the child effects
      if (eff && eff.op === "nested_effects") {
        // NEW: remember the last selected card for token resolution
        state.__lastSelected = Array.isArray(targets) ? targets[0] : null;

        runEffects([...(eff.effects || [])], owner, sourceCard, { selectedCard: targets?.[0] || null, targets });
      }

      // --- finalize multi-select fuses ---
      if (eff.op === "fuse_finalize_fortifier") {
        if (targets?.length) opFinalizeFortifierFuse(owner, eff.initiator_uid, targets);
      } else if (eff.op === "fuse_finalize_gear_multi") {
        if (targets?.length) opFinalizeGearMulti(owner, eff.initiator_uid, targets, eff.result_name);
      } else if (eff.op === "fuse_finalize_gardens_allure") {
        if (targets?.length) {
          opFinalizeGardensAllure(owner, eff.initiator_uid, targets);
        }
      } else if (eff.op === "fuse_finalize_alpha") {
        // allow 1 or 2 selected; logic decides waste vs Ω
        opFinalizeAlphaFuse(owner, eff.initiator_uid, targets || []);
      } else if (eff.op === "fuse_finalize_loot") {
        // Returning Slash: Loot multi-select
        const count = Array.isArray(targets) ? targets.length : 0;
        opFinalizeLootFuse(owner, eff.initiator_uid, targets || []);
      } else if (eff.op === "select_hand_summon_artifact_copy") {
        const board = owner === "blue" ? state.blueBoard : state.redBoard;
        for (const handCard of (targets || [])) {
          if ((board?.length || 0) >= 5) break;
          summonExactCopyFromHand(handCard, owner);
        }
      }



      // cleanup
      delete state.pendingTargetEffect;
      clearSelectableFlags();
      container.innerHTML = '';
      container.style.display = 'none';

      if (resumeEffects?.length) runEffects(resumeEffects, owner, sourceCard);
      else render();
    }, { op: pending?.eff?.op, owner: pending?.owner, source: pending?.sourceCard?.name }, { autoRender: false });
  });

  container.appendChild(button);
  container.style.display = 'block';
}


function isSuperProtected(card, owner) {
  if (!card || card.type !== "Follower") return false;
  const isAlly =
    (owner === "blue" && state.blueBoard.includes(card)) ||
    (owner === "red" && state.redBoard.includes(card));
  return card.evoType === "super" && state.activePlayer === owner && isAlly;
}


export function resolvePendingTarget(uid) {
  const pending = state.pendingTargetEffect;
  if (!pending) return;

  // Handle leader click
  if (uid === "leader" && pending.canTargetLeader) {
    pending.targets.push({ type: "Leader" }); // Special leader target marker
    // Continue with normal resolution
    const { eff, owner, resumeEffects } = pending;

    if (eff.op === "damage_follower_or_leader") {
      const targetPlayer = owner === "blue" ? "red" : "blue";
      // Route damage through the new centralized function
      applyLeaderDamage(targetPlayer, eff.amount | 0);
    }

    delete state.pendingTargetEffect;
    clearSelectableFlags();

    if (resumeEffects?.length) {
      runEffects(resumeEffects, owner);
    } else {
      render();
    }
    return;
  }


  const all = [...state.blueBoard, ...state.redBoard, ...state.blueHand, ...state.redHand];
  const clickedTarget = all.find(c => c.uid === uid);

  // --- Target Validation ---
  if (!clickedTarget) {
    console.warn(`resolvePendingTarget: Could not find target with UID: ${uid}`);
    return;
  }
  if (!pending.pool.some(p => p.uid === uid)) {
    console.warn("Clicked card is not in the valid target pool.");
    return;
  }

  // --- LLOYD ENFORCEMENT (global) ---
  try {
    const me = pending.owner;
    const opp = me === "blue" ? "red" : "blue";
    const oppBoard = (opp === "blue" ? state.blueBoard : state.redBoard) || [];
    const lloyds = oppBoard.filter(c => c?.name === "Lloyd");

    if (lloyds.length) {
      // Only care if the current pool includes opponent-side targets (use board membership, not c.owner)
      const poolHasOpponent = (pending.pool || []).some(c =>
        (state.blueBoard?.includes(c) ? "blue" :
          state.redBoard?.includes(c) ? "red" : null) === opp
      );
      if (poolHasOpponent) {
        const lloydUids = new Set(lloyds.map(l => l.uid));
        const firstPick = !pending.targets || pending.targets.length === 0;
        const singlePick = Number(pending.selectCount || 1) <= 1;
        const clickedIsLloyd = lloydUids.has(uid);

        // Rule:
        // - Single-target: you can ONLY select (any) Lloyd.
        // - Multi-target: your FIRST pick must be (any) Lloyd. After that, anything valid is fine.
        if (singlePick && !clickedIsLloyd) {
          console.warn("Lloyd: only Lloyd can be targeted.");
          return;
        }
        if (!singlePick && firstPick && !clickedIsLloyd) {
          console.warn("Lloyd: you must select a Lloyd first.");
          return;
        }
      }
    }
  } catch (e) {
    console.warn("Lloyd enforcement failed:", e);
  }

  // --- Toggle selection ---
  const idx = pending.targets.findIndex(t => t.uid === uid);
  if (idx !== -1) {
    // Unselect
    pending.targets.splice(idx, 1);
    // Hide confirm if empty selection and we require confirmation
    if (pending.requiresConfirmation && (!pending.targets || pending.targets.length === 0)) {
      const container = document.getElementById('targetingConfirmation');
      if (container) container.style.display = 'none';
    }
    render();
    return;
  }


  // Early confirm for Fortifier: clicking the initiator again finalizes with current picks
  if (pending.eff?.op === "fuse_finalize_fortifier") {
    if (pending.sourceCard && uid === pending.sourceCard.uid) {
      const partners = pending.targets || [];
      if (partners.length > 0) {
        opFinalizeFortifierFuse(pending.owner, pending.eff.initiator_uid, partners);
        delete state.pendingTargetEffect;
        clearSelectableFlags();
        // Also hide confirmation button if it's shown
        const container = document.getElementById('targetingConfirmation');
        if (container) container.style.display = 'none';
        return;
      }
    }
  }

  // --- Accumulate Targets ---
  pending.targets.push(clickedTarget);
  clickedTarget.isSelectable = false; // Mark as selected

  // --- Show confirmation button for multi-select effects ---
  if (pending.requiresConfirmation) {
    showConfirmationButton(pending);
  }

  // --- Wait for More Targets if Needed OR if we require manual confirmation ---
  if (pending.targets.length < pending.selectCount && !pending.requiresConfirmation) {
    render(); // Re-render to show selection and wait for the next click.
    return;
  }

  // If we require confirmation, we stop here and wait for the button click
  if (pending.requiresConfirmation) {
    render(); // Update UI to show selected state
    return;
  }

  // --- All targets have been selected (and no confirmation needed), now apply the effects ---
  const { eff, owner, sourceCard, resumeEffects, targets } = pending;


  if (eff && eff.op === "nested_effects") {
    // Pass the chosen target(s) to runEffects so inner ops (e.g., transform) know what to hit
    // Make auto-apply path undoable too
    doAction("Resolve Targets", () => {
      runEffects([...(eff.effects || [])], owner, sourceCard, { selectedCard: targets?.[0] || null, targets });
      // cleanup
      delete state.pendingTargetEffect;
      clearSelectableFlags();
      if (resumeEffects?.length) runEffects(resumeEffects, owner, sourceCard);
      else render();
    }, { op: eff?.op, owner, source: sourceCard?.name }, { autoRender: false });
    return;
  }

  if (eff.op === "damage") {
    function resolveAmount(eff, owner, sourceCard) {
      const raw = eff.amount;
      const rawOverflow = eff.amount_overflow ?? eff.overflow_amount;
      const resolveToken = (val) => {
        if (typeof val === "string") {
          if (val.trim().toLowerCase() === "{self.attack}") {
            return parseInt(sourceCard?.attack || 0) || 0;
          }
          const n = parseInt(val);
          return Number.isFinite(n) ? n : 0;
        }
        return parseInt(val) || 0;
      };
      const base = resolveToken(raw);
      const of = resolveToken(rawOverflow ?? base);
      return isOverflow(owner) ? of : base;
    }
    const amt = resolveAmount(eff, owner, sourceCard);
    if (amt) {
      // 1. This loop deals the damage FIRST.
      for (const target of targets) {
        if (target.type === "Follower") {
          dealDamage(target, amt);
          console.log(`%c[resolveTarget.js] After dealDamage, ${target.name}'s defense is now: ${target.defense}`, 'color: purple; font-weight: bold;');
        }
      }
      // 2. Cleanup runs SECOND, after damage is done.
      cleanupDead();
    }
  } else if (eff.op === "juno_damage") {
    const earthCount = eff.amount || 0;
    for (const target of targets) {
      if (target.type === "Follower") {
        dealDamage(target, earthCount);
      }
    }
    cleanupDead();
  } else if (eff.op === "transform") {
    const intoName = String(eff.into || eff.name || "").trim();
    const target = (targets && targets[0]) || null;
    if (!target || !intoName) return;

    // Decide zone and transform appropriately
    if (state.blueHand.includes(target) || state.redHand.includes(target)) {
      transformHandTarget(target, intoName);
    } else {
      transformTarget(target, intoName);
    }
    logEvent("transform", { owner, target: target.name, into: intoName });
  } else if (eff.op === "keyword") {
    // This effect is applied to all selected targets
    for (const target of targets) {
      for (const k of (eff.keywords || [])) {
        const name = (typeof k === "string" ? k : k?.name) || "";
        applyKeyword(target, name, typeof k === "object" ? k : undefined);
      }
      // If the source is Flight of Icarus, inject a temporary description
      if (sourceCard && String(sourceCard.name).toLowerCase() === "flight of icarus") {
        injectDescAndBadge(
          target,
          `<span style="color: orange;">Rush<br>Last Words: Draw a card</span>`,
          ["Rush", "Last Words: Draw a card"]
        );
      }

      // --- Carnelia evolve: temporary description + "!" badge on the chosen Artifact in hand ---
      if (sourceCard && String(sourceCard.name).toLowerCase() === "carnelia, ember of darkness") {
        injectDescAndBadge(
          target,
          `<span style="color: orange;">Ward<br>Can't be destroyed by abilities</span>`,
          ["Ward", "Can't be destroyed by abilities"]
        );
      }



    }
  } else if (eff.op === "discard_select_hand") {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

    // Track which cards were discarded (for triggers)
    const discardedThisOp = [];

    // Remove the selected cards from the owner's hand (by uid), push to grave
    for (const t of targets) {
      const idx = hand.findIndex(c => c.uid === t.uid);
      if (idx !== -1) {
        const [discarded] = hand.splice(idx, 1);
        grave.push(discarded);
        discardedThisOp.push(discarded);
      }
    }

    // Shadows for each discarded card
    if (targets.length > 0) {
      if (owner === "blue") state.blueShadows += targets.length;
      else state.redShadows += targets.length;
    }

    // NEW: store last discarded cost(s) for chained effects like Burnite
    if (discardedThisOp.length) {
      // If you ever need multiple, you now also have the array.
      state.lastDiscardedCosts = discardedThisOp.map(c => parseInt(c.cost, 10) || 0);
      // For Burnite (count = 1), this is enough:
      state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
    }

    // NEW: fire per-card on_discard effects
    for (const dc of discardedThisOp) {
      if (Array.isArray(dc.on_discard) && dc.on_discard.length) {
        // run effects with the discarded card as sourceCard
        runEffects([...dc.on_discard], owner, dc);
      }
    }

  } else if (eff.op === "select_hand_summon_artifact_copies_eot_destroy") {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;

    for (const handCard of targets) {
      if ((board?.length || 0) >= 5) break;

      const copy = summonExactCopyFromHand(handCard, owner);
      if (!copy) continue;

      // Ensure triggers array and add the temporary EOT self-destroy
      copy.triggers = Array.isArray(copy.triggers) ? copy.triggers : [];
      copy.triggers.push({
        event: "end_of_turn",
        source: "board",
        condition: { whose_turn: "opponent" },
        effects: [{ op: "destroy_self" }],
      });
    }
  } else if (eff.op === "select_hand_summon_artifact_copy") {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    for (const handCard of targets) {
      if ((board?.length || 0) >= 5) break;
      // Exact copy with full init (Rush/Storm/etc. carried and applied)
      summonExactCopyFromHand(handCard, owner);
    }

  } else if (eff.op === "fuse_finalize_generic") {
    const partner = targets[0];
    if (partner) {
      opFinalizeFuseGeneric(owner, eff.initiator_uid, partner, eff.result);
    }

  } else if (eff.op === "fuse_finalize_fortifier") {
    const partners = targets; // all selected artifacts
    if (partners?.length) {
      opFinalizeFortifierFuse(owner, eff.initiator_uid, partners);
    }
  } else if (eff.op === "fuse_finalize_alpha") {
    const partners = targets; // 0, 1, or 2 picks
    opFinalizeAlphaFuse(owner, eff.initiator_uid, partners || []);

  } else if (eff.op === "fuse_finalize_gear_multi") {
    const partners = targets; // any number of other gears
    opFinalizeGearMulti(owner, eff.initiator_uid, partners, eff.result_name);

  } else if (eff.op === "remove_keyword") {
    // This handler natively supports an array of targets
    handleRemoveKeyword({ ...eff, select: false }, owner, targets);
  } else if (eff.op === "destroy" || eff.op === "destroy_then") {
    // 1) destroy what was selected (respecting super-protection inside resolveDestroy)
    let destroyedCount = 0;
    for (const target of targets) {
      const targetOwner =
        state.blueBoard.includes(target) ? "blue" :
          state.redBoard.includes(target) ? "red" :
            owner; // fallback
      const ok = resolveDestroy(target, targetOwner);
      if (ok) {
        destroyedCount++;
        logEvent("destroy", { owner, target: target.name });
      }
    }
    cleanupDead(); // cleanupDead already imported

    // 2) If this is destroy_then and at least one target died, run the chained effects now
    if (eff.op === "destroy_then" && destroyedCount > 0 && Array.isArray(eff.effects) && eff.effects.length) {
      runEffects([...(eff.effects)], owner, sourceCard, { selectedCard: targets?.[0] || null, targets });
    }

    // 3) Resume outer effect queue
    delete state.pendingTargetEffect;
    clearSelectableFlags();
    if (resumeEffects?.length) runEffects(resumeEffects, owner, sourceCard);
    else render();
    return;

  } else if (eff.op === "banish") {
    // --- THIS BLOCK IS THE FIX ---
    for (const target of targets) {
      // We must determine the owner to fire the trigger correctly.
      const targetOwner = state.blueBoard.includes(target) ? "blue" : "red";
      // Call the trigger BEFORE banishing the card.
      fireTrigger("allied_follower_leaves_field", owner);
      handleBanish(target);
      logEvent("banish", { owner, target: target.name });
    }
  } else if (eff.op === "return_to_hand" || eff.op === "bounce") {
    for (const target of targets) {
      bounceToHand(target);
      logEvent("bounce", { owner, target: target.name });
    }
  } else if (eff.op === "buff") {
    const a = parseInt(eff.attack || 0) || 0;
    const d = parseInt(eff.defense || 0) || 0;
    // Optional tribe gate for targeted buffs
    const rawTribes =
      eff.tribes ? (Array.isArray(eff.tribes) ? eff.tribes : [eff.tribes]) :
        eff.tribe ? [eff.tribe] : null;
    const tribeOk = (card) => {
      if (!rawTribes) return true;
      const want = rawTribes.map(t => String(t).toLowerCase());
      return Array.isArray(card.tribes) &&
        card.tribes.some(tr => want.includes(String(tr).toLowerCase()));
    };
    for (const target of targets.filter(tribeOk)) {
      // Initialize buff tracking
      if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

      // Apply buff
      target.buffs.attack += a;
      target.buffs.defense += d;

      target.attack = Math.max(0, (parseInt(target.attack) || 0) + a);
      target.defense = (parseInt(target.defense) || 0) + d;
      target.peak_defense = Math.max(target.peak_defense ?? target.defense, target.defense);

      // Update potential stats
      if (!target.potential_attack) target.potential_attack = target.base_attack || target.attack;
      if (!target.potential_defense) target.potential_defense = target.base_defense || target.defense;
      target.potential_attack += a;
      target.potential_defense += d;

      // Fire "enemy_follower_defense_down" if we actually reduced DEF on an enemy follower
      if (d < 0 && target?.type === "Follower") {
        const targetOwner =
          state.blueBoard.includes(target) ? "blue" :
            state.redBoard.includes(target) ? "red" : null;
        const debufferOwner = owner;
        if (targetOwner && debufferOwner) {
          // resolveTarget already imports fireTrigger at the top
          fireTrigger("enemy_follower_defense_down", debufferOwner, { target });
        }
      }

    }
    // Remove anything that dropped to 0 or less
    cleanupDead();
  } else if (eff.op === "return_hand_to_deck") {
    for (const target of targets) {
      resolveReturnHandToDeck(target, owner);
      logEvent("returnToDeck", { owner, target: target.name });
    }
    // Add to resolveTarget.js
  } else if (eff.op === "damage_follower_or_leader") {
    const target = targets[0]; // Only one target allowed

    if (!target) {
      // No target selected but leader targeting is allowed - default to leader
      const targetPlayer = owner === "blue" ? "red" : "blue";
      logEvent("effectDamage", {
        owner,
        op: "damage_follower_or_leader",
        amount: eff.amount,
        target: { type: "Leader", name: owner === "blue" ? "redLeader" : "blueLeader" }
      });
      if (targetPlayer === "blue") {
        state.blueHP = Math.max(0, state.blueHP - eff.amount);
      } else {
        state.redHP = Math.max(0, state.redHP - eff.amount);
      }
    }
    else if (target.type === "Follower") {
      logEvent("effectDamage", {
        owner,
        op: "damage_follower_or_leader",
        amount: eff.amount,
        target:
          target ? { type: target.type, name: target.name, uid: target.uid }
            : { type: "Leader", name: owner === "blue" ? "redLeader" : "blueLeader" }
      });
      dealDamage(target, eff.amount);
      cleanupDead();
    } else if (target.type === "Leader") {
      const targetPlayer = owner === "blue" ? "red" : "blue";
      logEvent("effectDamage", {
        owner,
        op: "damage_follower_or_leader",
        amount: eff.amount,
        target:
          target ? { type: target.type, name: target.name, uid: target.uid }
            : { type: "Leader", name: owner === "blue" ? "redLeader" : "blueLeader" }
      });
      if (targetPlayer === "blue") {
        state.blueHP = Math.max(0, state.blueHP - eff.amount);
      } else {
        state.redHP = Math.max(0, state.redHP - eff.amount);
      }
    }


  } else if (eff.op === "super_evolve_ally") {
    // robustly resolve the selected target (object or uid)
    const sel = (Array.isArray(targets) && targets[0]) ? targets[0] : null;

    function findByUid(uid, ownerSide) {
      const boards = ownerSide === "blue"
        ? [state.blueBoard, state.blueBackrow || []]
        : [state.redBoard, state.redBackrow || []];
      for (const zone of boards) {
        const hit = zone.find(c => c && c.uid === uid);
        if (hit) return hit;
      }
      return null;
    }

    const target =
      !sel ? null :
        (sel.uid ? sel : findByUid(sel, owner)); // supports either object or uid

    if (!target) return;                       // nothing selected
    if (sourceCard && target.uid === sourceCard.uid) return; // "not_self" safety
    if (target.hasEvolved) return;             // must be unevolved

    // Use the single source of truth — ensures +3/+3, Rush (if no Storm),
    // potential_* reset, evo flags, and onEvolve triggers.
    handleEvolveSelf(target, owner, { mode: "super", spendPoint: false });
    logEvent("evolve", { owner, target: target.name, mode: "super" });

    // Re-render so the evo art/stats show immediately
    render();



    // Self super evolve (rarely used here; Gildaria Rally should call this via evolveEffects, not resolveTarget)
  } else if (eff.op === "super_evolve_self") {
    // source card performing the effect
    handleEvolveSelf(sourceCard, owner, { mode: "super", spendPoint: false });
    logEvent("evolve", { owner, target: sourceCard.name, mode: "super" });

  } else if (eff.op === "evolve_and_buff") {
    const target = targets[0];
    // Initialize stats
    if (!target.base_attack) target.base_attack = parseInt(target.attack) || 0;
    if (!target.base_defense) target.base_defense = parseInt(target.defense) || 0;
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

    // Apply evolution bonuses (treated as base stats)
    target.base_attack += 2;
    target.base_defense += 2;
    target.attack = target.base_attack;
    target.defense = target.base_defense;

    // Apply additional buffs
    const a = parseInt(eff.attack || 0) || 0;
    const d = parseInt(eff.defense || 0) || 0;
    target.buffs.attack += a;
    target.buffs.defense += d;
    target.attack += a;
    target.defense += d;

    // Update potential stats
    target.potential_attack = target.base_attack + target.buffs.attack;
    target.potential_defense = target.base_defense + target.buffs.defense;
    target.peak_defense = Math.max(target.peak_defense ?? target.defense, target.defense);
  } else if (eff.op === 'nested_effects') {
    // Run nested effects, with special handling for new targeted ops
    for (const target of targets) {
      for (const nestedEff of eff.effects) {
        if (nestedEff.op === 'set_stats') {
          // Handle set_stats directly here
          if (nestedEff.attack !== undefined) {
            const newAttack = parseInt(nestedEff.attack);
            target.attack = newAttack;
            // When stats are 'set', potential and base stats should also match the new value.
            target.potential_attack = newAttack;
            target.base_attack = newAttack;
          }
          if (nestedEff.defense !== undefined) {
            const newDefense = parseInt(nestedEff.defense);
            target.defense = newDefense;
            // This is the critical fix: update potential_defense to the new value.
            // This effectively resets the follower's health ceiling to the new number.
            target.potential_defense = newDefense;
            target.base_defense = newDefense;
            target.peak_defense = newDefense;
          }

        } else {
          // For any other nested effect, use the original runEffects function
          runEffects([nestedEff], owner, target);
        }
      }
    }
  }

  // --- Post-Effect Cleanup ---
  if (state.pendingEngageEffects) {
    const { owner, sourceCard, effects } = state.pendingEngageEffects;

    // Remove the first effect (which was the selection effect)
    const remainingEffects = effects.slice(1);

    if (remainingEffects.length > 0) {
      // Run the remaining effects
      runEffects([...remainingEffects], owner, sourceCard);
    }

    delete state.pendingEngageEffects;
  }

  delete state.pendingTargetEffect;
  clearSelectableFlags();


  const resume = resumeEffects || [];
  if (resume.length) {
    // NEW: expose the chosen target globally for token resolvers
    state.__lastSelected = Array.isArray(targets) ? targets[0] : null;

    runEffects(resume, owner, sourceCard, {
      selectedCard: state.__lastSelected,
      targets
    });
  } else {
    render();
  }
}

export function confirmTargetsIfNeeded() {
  const pending = state.pendingTargetEffect;
  if (!pending) return;

  // If confirmation is required, simulate clicking the confirm button
  if (pending.requiresConfirmation) {
    const container = document.getElementById('targetingConfirmation');
    if (container) {
      const btn = container.querySelector('.confirm-targets-btn');
      if (btn) {
        btn.click();
        return;
      }
    }
  }

  // If no confirmation is needed, just cleanup immediately
  delete state.pendingTargetEffect;
  clearSelectableFlags();
  render();
}
