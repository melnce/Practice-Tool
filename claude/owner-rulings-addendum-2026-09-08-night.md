# Owner rulings addendum — 2026-09-08 (night)

## `still_alive` — subject is the damage victim

Asked what the key means, the owner answered with Galmieux, verbatim:

> "ill take galmieux as example here. Galmieux gains the crest that when an ally is damaged and
> survives the damage then you get a 0 mana spell to hand. ONLY if the unit that was daamged survives
> -> hence the still alive. What is unclear?"

**The subject is the card that took the damage.** It is a property of a damage event's victim, and it is only meaningful where there _is_ a damage event.

**Consequence:** `still_alive` is trigger-only (not a pool/card filter key). Its subject is the damage victim; for `self_damaged` triggers this is implemented in `handlers/self.ts`.
