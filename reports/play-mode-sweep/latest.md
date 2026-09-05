# Play-mode cost-boundary sweep

Generated: 2026-09-05T23:30:41.728Z
Runtime: 155 ms
Cards: **62**
Cases: **784** (card × PP × {empty, full board})
State hash: `hashGameState`
Failures: **56**

## Engine rule (quoted, not paraphrased)

> src/logic/core/playCard/cost.ts resolvePlayCost(card, availablePP) returns a plan { mode: "enhance" | "normal" | "accelerate" | "crystallize", cost, enhanceTiers, alternate, effectivePlayCost }: Enhance whenever at least one tier is affordable (pickEnhanceTiers; all affordable tiers are returned; cost = the highest affordable tier), unless the player has the crest passive suppress_fanfare_enhance; otherwise normal when availablePP >= effectivePlayCost; otherwise an alternate form via pickAlternateForm (src/helpers/alternateForm.ts: activates when PP is below the normal effective cost but at or above an alternate cost; highest payable alternate wins); otherwise normal (unaffordable — the play must be rejected).

## Cards under test

10001110, 10042120, 10121140, 10123120, 10124110, 10134110, 10152110, 10203120, 10222310, 10223110, 10344120, 10352120, 10361310, 10403120, 10412110, 10421110, 10423110, 10424110, 10444120, 10451110, 10462110, 10503310, 10522310, 10523310, 10551110, 10561120, 10571110, 10621110, 10621310, 10622110, 10622310, 10623110, 10623310, 10624110, 10632120, 10633310, 10641120, 10652110, 10652120, 10661110, 10662110, 10663110, 10671110, 10672110, 10673110, 10741110, 10762210, 10773110, 10814120, 10822310, 10844120, 10862310, 10874110, 10901110, 10921310, 10922120, 10923310, 10932110, 10941310, 10952110, 10952310, 10962120

| id | name | type | keywords | enhance tiers | alternates | cost |
| --- | --- | --- | --- | --- | --- | --- |
| 10001110 | Indomitable Fighter | Follower | Enhance | 4 | — | 2 |
| 10042120 | Battleforged Dragon Keeper | Follower | Enhance | 7 | — | 5 |
| 10121140 | Hound of War | Follower | Enhance | 6 | — | 3 |
| 10123120 | Valse, Silent Sniper | Follower | Enhance | 6 | — | 3 |
| 10124110 | Albert, Levin Stormsaber | Follower | Enhance | 9 | — | 5 |
| 10134110 | Kuon, Fivefold Master | Follower | Enhance | 10 | — | 7 |
| 10152110 | Mino, Shrewd Reaper | Follower | Enhance | 4 | — | 2 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | Follower | Enhance | 5 | — | 2 |
| 10222310 | Band of Battle Princesses | Spell | Enhance | 4 | — | 2 |
| 10223110 | Rosé, Princess Knight | Follower | Enhance | 5 | — | 3 |
| 10344120 | Galmieux, Ardor Manifest | Follower | Enhance | 7 | — | 5 |
| 10352120 | Spirited Gravekeeper | Follower | Enhance | 7 | — | 2 |
| 10361310 | Blinding Faith | Spell | Enhance | 8 | — | 4 |
| 10403120 | Lyria, Skydestined | Follower | Enhance | 8 | — | 2 |
| 10412110 | Chloe, What a Gal | Follower | Enhance | 8 | — | 2 |
| 10421110 | Randall, Feet Fighter | Follower | Enhance | 5 | — | 2 |
| 10423110 | Golden Knight, True King's Blade | Follower | Enhance | 9 | — | 7 |
| 10424110 | Zeta & Bea, Crimson and Blue | Follower | Enhance | 6 | — | 4 |
| 10444120 | Zooey, Ally of the World | Follower | Enhance | 10 | — | 5 |
| 10451110 | Almeida, Headstrong Miner | Follower | Enhance | 4 | — | 2 |
| 10462110 | Sara, Graphos's Chosen | Follower | Enhance | 6 | — | 4 |
| 10503310 | Fate of the World | Spell | Enhance | 10 | — | 5 |
| 10522310 | Serenity's Shield | Spell | Enhance | 4 | — | 2 |
| 10523310 | Splendor of the Goldbloom | Spell | Enhance | 5 | — | 3 |
| 10551110 | Support Wolf | Follower | Enhance | 6 | — | 2 |
| 10561120 | Bouquet Believer | Follower | Enhance | 4 | — | 1 |
| 10571110 | Marionette Master | Follower | Enhance | 7 | — | 4 |
| 10621110 | Fearless Soldier | Follower | Enhance | 3 | — | 2 |
| 10621310 | Advent of the Eld Sword | Spell | Enhance | 7 | — | 5 |
| 10622110 | Loyal Guard | Follower | Enhance | 4 | — | 3 |
| 10622310 | Majestic Conquest | Spell | Enhance | 3 | — | 1 |
| 10623110 | Heartless Strategist | Follower | Enhance | 6 | — | 4 |
| 10623310 | Ruthless Eld Sword | Spell | Enhance | 3 | — | 1 |
| 10624110 | Noel IV, Ruthless Warlord | Follower | Enhance | 7, 8 | — | 6 |
| 10632120 | Adventurous Grimoire | Follower | Enhance | 6 | — | 3 |
| 10633310 | Bewitching Eld Crystals | Spell | Enhance | 5 | — | 3 |
| 10641120 | Fruitfish | Follower | Enhance | 6 | — | 2 |
| 10652110 | Yearnful Necromancer | Follower | Enhance | 8 | — | 3 |
| 10652120 | Devilish Heartbreaker | Follower | Enhance | 7 | — | 4 |
| 10661110 | Prostrating Coward | Follower | Crystallize | — | crystallize 2 | 5 |
| 10662110 | Venerating Dyer | Follower | Crystallize | — | crystallize 1 | 4 |
| 10663110 | Worshipful Crusader | Follower | Crystallize | — | crystallize 1 | 6 |
| 10671110 | Shoddy Plaything | Follower | Accelerate | — | accelerate 2 | 6 |
| 10672110 | Substandard Puppet | Follower | Accelerate | — | accelerate 3 | 5 |
| 10673110 | Ludicrous Ordnance | Follower | Accelerate | — | accelerate 4 | 8 |
| 10741110 | Dragonewt Promoter | Follower | Enhance | 4 | — | 2 |
| 10762210 | Timepiece of Perfection | Amulet | Enhance | 4 | — | 2 |
| 10773110 | Brazen Broadcaster | Follower | Enhance | 5 | — | 3 |
| 10814120 | Tia, Eternal Crystalian | Follower | Enhance | 4 | — | 2 |
| 10822310 | Shared Existence | Spell | Enhance | 6 | — | 4 |
| 10844120 | Lumiore & Argente, Shining Wings | Follower | Accelerate | — | accelerate 3 | 8 |
| 10862310 | Lingering Threat | Spell | Enhance | 5 | — | 2 |
| 10874110 | Asher & Lydia, Paths Beyond | Follower | Enhance | 9 | — | 5 |
| 10901110 | Jailor of Antiquity | Follower | Accelerate | — | accelerate 1 | 6 |
| 10921310 | Phalanx | Spell | Enhance | 6 | — | 2 |
| 10922120 | Ferocious Commander | Follower | Enhance | 7 | — | 5 |
| 10923310 | L'Age d'Or | Spell | Enhance | 6 | — | 4 |
| 10932110 | Enamored Researcher | Follower | Enhance | 8 | — | 4 |
| 10941310 | Drake Whelp's Tantrum | Spell | Enhance | 3 | — | 1 |
| 10952110 | Void Colonel | Follower | Crystallize | — | crystallize 2 | 6 |
| 10952310 | Chains of the Past | Spell | Enhance | 4 | — | 2 |
| 10962120 | Miraculous Al-mi'raj | Follower | Crystallize | — | crystallize 1 | 3 |

## Owner question (not decided here)

In the real client, when the player can afford the follower, can they still choose Crystallize / Accelerate? This engine currently offers the alternate form **only** when the follower is unaffordable. Cards that question applies to:

| id | name | normal cost | alternates |
| --- | --- | --- | --- |
| 10661110 | Prostrating Coward | 5 | crystallize 2 |
| 10662110 | Venerating Dyer | 4 | crystallize 1 |
| 10663110 | Worshipful Crusader | 6 | crystallize 1 |
| 10671110 | Shoddy Plaything | 6 | accelerate 2 |
| 10672110 | Substandard Puppet | 5 | accelerate 3 |
| 10673110 | Ludicrous Ordnance | 8 | accelerate 4 |
| 10844120 | Lumiore & Argente, Shining Wings | 8 | accelerate 3 |
| 10901110 | Jailor of Antiquity | 6 | accelerate 1 |
| 10952110 | Void Colonel | 6 | crystallize 2 |
| 10962120 | Miraculous Al-mi'raj | 3 | crystallize 1 |

## How to read I1 / I6 failures

I1 is `ppAfter === ppBefore − plan.cost` after the full play, so a card whose own text recovers play points (Lyria, Heartless Strategist) fails I1 even when the deduction itself was correct. I6 is `hand shrinks by exactly 1` plus "played card on board / in graveyard", so a card whose own text draws or adds to hand fails I6 even when the played card left the hand cleanly. Extra summons are recorded (`extraSummons`) and are not an I6 failure. These rows are findings for a fix PR to classify — this sweep does not change `src/`.

## Failures by invariant

### I1 — 6 failing case(s)

| id | name | pp | board | expected | observed |
| --- | --- | --- | --- | --- | --- |
| 10403120 | Lyria, Skydestined | 8 | empty | 0 | 7 |
| 10403120 | Lyria, Skydestined | 9 | empty | 1 | 8 |
| 10403120 | Lyria, Skydestined | 10 | empty | 2 | 9 |
| 10623110 | Heartless Strategist | 6 | empty | 0 | 3 |
| 10623110 | Heartless Strategist | 7 | empty | 1 | 4 |
| 10623110 | Heartless Strategist | 10 | empty | 4 | 7 |

### I2 — 0 failing case(s)

_none_

### I3 — 0 failing case(s)

_none_

### I4 — 0 failing case(s)

_none_

### I5 — 0 failing case(s)

_none_

### I6 — 50 failing case(s)

| id | name | pp | board | expected | observed |
| --- | --- | --- | --- | --- | --- |
| 10361310 | Blinding Faith | 8 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10361310 | Blinding Faith | 8 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10361310 | Blinding Faith | 9 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10361310 | Blinding Faith | 9 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10361310 | Blinding Faith | 10 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10361310 | Blinding Faith | 10 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":3,"cardInGraveyard":true,"cardInBanish":false} |
| 10412110 | Chloe, What a Gal | 8 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":false,"boardAfter":0,"extraSummons":0} |
| 10412110 | Chloe, What a Gal | 9 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":false,"boardAfter":0,"extraSummons":0} |
| 10412110 | Chloe, What a Gal | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":false,"boardAfter":0,"extraSummons":0} |
| 10503310 | Fate of the World | 5 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 5 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 6 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 6 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 9 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 9 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 10 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10503310 | Fate of the World | 10 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 3 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 3 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 4 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 4 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":2,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 5 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 5 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 6 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 6 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 10 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10523310 | Splendor of the Goldbloom | 10 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":4,"cardInGraveyard":true,"cardInBanish":false} |
| 10561120 | Bouquet Believer | 4 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10561120 | Bouquet Believer | 5 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10561120 | Bouquet Believer | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10623110 | Heartless Strategist | 6 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10623110 | Heartless Strategist | 7 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10623110 | Heartless Strategist | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10623310 | Ruthless Eld Sword | 3 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10623310 | Ruthless Eld Sword | 3 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10623310 | Ruthless Eld Sword | 4 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10623310 | Ruthless Eld Sword | 4 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10623310 | Ruthless Eld Sword | 10 | empty | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10623310 | Ruthless Eld Sword | 10 | full | {"handAfter":0,"inGraveyardOrBanish":true} | {"handAfter":1,"cardInGraveyard":true,"cardInBanish":false} |
| 10671110 | Shoddy Plaything | 6 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":3,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10671110 | Shoddy Plaything | 7 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":3,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10671110 | Shoddy Plaything | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":3,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10773110 | Brazen Broadcaster | 3 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":2,"extraSummons":1} |
| 10773110 | Brazen Broadcaster | 4 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":2,"extraSummons":1} |
| 10773110 | Brazen Broadcaster | 5 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":3,"extraSummons":2} |
| 10773110 | Brazen Broadcaster | 6 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":3,"extraSummons":2} |
| 10773110 | Brazen Broadcaster | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":3,"extraSummons":2} |
| 10814120 | Tia, Eternal Crystalian | 4 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10814120 | Tia, Eternal Crystalian | 5 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |
| 10814120 | Tia, Eternal Crystalian | 10 | empty | {"handAfter":0,"playedCardOnOwnBoard":true} | {"handAfter":1,"playedCardOnOwnBoard":true,"boardAfter":1,"extraSummons":0} |

## Every case

| id | name | pp | board | mode | cost | accepted | checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10001110 | Indomitable Fighter | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10001110 | Indomitable Fighter | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10042120 | Battleforged Dragon Keeper | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 5 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 5 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10121140 | Hound of War | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 5 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 5 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10123120 | Valse, Silent Sniper | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 8 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 8 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 9 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 9 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 10 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10124110 | Albert, Levin Stormsaber | 10 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 6 | empty | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 6 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 7 | empty | normal | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 7 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 8 | empty | normal | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 8 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 9 | empty | normal | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 9 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 10 | empty | enhance | 10 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10134110 | Kuon, Fivefold Master | 10 | full | enhance | 10 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10152110 | Mino, Shrewd Reaper | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 4 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 4 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 5 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 5 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 6 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 6 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 10 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10203120 | Hnikar & Jafnhar, Firestorm Duo | 10 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 2 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 3 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 4 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 5 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10222310 | Band of Battle Princesses | 10 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 5 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 5 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 6 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 6 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 10 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10223110 | Rosé, Princess Knight | 10 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10344120 | Galmieux, Ardor Manifest | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 6 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 6 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10352120 | Spirited Gravekeeper | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 4 | full | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 5 | full | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 7 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 7 | full | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10361310 | Blinding Faith | 8 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10361310 | Blinding Faith | 8 | full | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10361310 | Blinding Faith | 9 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10361310 | Blinding Faith | 9 | full | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10361310 | Blinding Faith | 10 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10361310 | Blinding Faith | 10 | full | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10403120 | Lyria, Skydestined | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 7 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 7 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 8 | empty | enhance | 8 | yes | FAIL I1 / ok I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 8 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 9 | empty | enhance | 8 | yes | FAIL I1 / ok I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 9 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 10 | empty | enhance | 8 | yes | FAIL I1 / ok I2,I3,I4,I5,I6 |
| 10403120 | Lyria, Skydestined | 10 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 7 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 7 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 8 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10412110 | Chloe, What a Gal | 8 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 9 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10412110 | Chloe, What a Gal | 9 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10412110 | Chloe, What a Gal | 10 | empty | enhance | 8 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10412110 | Chloe, What a Gal | 10 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 4 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 4 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 5 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 5 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 6 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 6 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 10 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10421110 | Randall, Feet Fighter | 10 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 6 | empty | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 6 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 7 | empty | normal | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 7 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 8 | empty | normal | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 8 | full | normal | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 9 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 9 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 10 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10423110 | Golden Knight, True King's Blade | 10 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10424110 | Zeta & Bea, Crimson and Blue | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 9 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 9 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 10 | empty | enhance | 10 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10444120 | Zooey, Ally of the World | 10 | full | enhance | 10 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10451110 | Almeida, Headstrong Miner | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10462110 | Sara, Graphos's Chosen | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10503310 | Fate of the World | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10503310 | Fate of the World | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10503310 | Fate of the World | 5 | empty | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 5 | full | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 6 | empty | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 6 | full | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 9 | empty | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 9 | full | normal | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 10 | empty | enhance | 10 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10503310 | Fate of the World | 10 | full | enhance | 10 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10522310 | Serenity's Shield | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 2 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 3 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 4 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 5 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10522310 | Serenity's Shield | 10 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10523310 | Splendor of the Goldbloom | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10523310 | Splendor of the Goldbloom | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10523310 | Splendor of the Goldbloom | 3 | empty | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 3 | full | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 4 | empty | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 4 | full | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 5 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 5 | full | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 6 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 6 | full | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 10 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10523310 | Splendor of the Goldbloom | 10 | full | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10551110 | Support Wolf | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 5 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 5 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10551110 | Support Wolf | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 0 | empty | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 0 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 1 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 1 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 2 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 2 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 3 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 3 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 4 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10561120 | Bouquet Believer | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 5 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10561120 | Bouquet Believer | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10561120 | Bouquet Believer | 10 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10561120 | Bouquet Believer | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 6 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 6 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10571110 | Marionette Master | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 3 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 3 | full | enhance | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 4 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 4 | full | enhance | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 10 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621110 | Fearless Soldier | 10 | full | enhance | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 5 | full | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 6 | full | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 7 | full | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 8 | full | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10621310 | Advent of the Eld Sword | 10 | full | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622110 | Loyal Guard | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 0 | empty | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 0 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 1 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 1 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 2 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 2 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 3 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 3 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 4 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 4 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 10 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10622310 | Majestic Conquest | 10 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 6 | empty | enhance | 6 | yes | FAIL I1,I6 / ok I2,I3,I4,I5 |
| 10623110 | Heartless Strategist | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 7 | empty | enhance | 6 | yes | FAIL I1,I6 / ok I2,I3,I4,I5 |
| 10623110 | Heartless Strategist | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623110 | Heartless Strategist | 10 | empty | enhance | 6 | yes | FAIL I1,I6 / ok I2,I3,I4,I5 |
| 10623110 | Heartless Strategist | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 0 | empty | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 0 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 1 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 1 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 2 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 2 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10623310 | Ruthless Eld Sword | 3 | empty | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10623310 | Ruthless Eld Sword | 3 | full | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10623310 | Ruthless Eld Sword | 4 | empty | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10623310 | Ruthless Eld Sword | 4 | full | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10623310 | Ruthless Eld Sword | 10 | empty | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10623310 | Ruthless Eld Sword | 10 | full | enhance | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10624110 | Noel IV, Ruthless Warlord | 5 | empty | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 5 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 6 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 6 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 8 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 8 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 9 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 9 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 10 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10624110 | Noel IV, Ruthless Warlord | 10 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 5 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 5 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10632120 | Adventurous Grimoire | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 3 | full | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 4 | full | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 5 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 5 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 6 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 6 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 10 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10633310 | Bewitching Eld Crystals | 10 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 5 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 5 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 6 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 7 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10641120 | Fruitfish | 10 | full | enhance | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 7 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 7 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 8 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 8 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 9 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 9 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 10 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652110 | Yearnful Necromancer | 10 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 6 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 6 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10652120 | Devilish Heartbreaker | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 1 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 1 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 2 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 2 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 3 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 3 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 4 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 4 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 10 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10661110 | Prostrating Coward | 10 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 0 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 0 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 1 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 1 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 2 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 2 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 3 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 3 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 10 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10662110 | Venerating Dyer | 10 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 0 | empty | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 0 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 1 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 1 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 2 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 2 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 5 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 5 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 6 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 6 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 7 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 7 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 10 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10663110 | Worshipful Crusader | 10 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 1 | empty | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 1 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 2 | empty | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 2 | full | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 3 | empty | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 3 | full | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 5 | empty | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 5 | full | accelerate | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 6 | empty | normal | 6 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10671110 | Shoddy Plaything | 6 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 7 | empty | normal | 6 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10671110 | Shoddy Plaything | 7 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10671110 | Shoddy Plaything | 10 | empty | normal | 6 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10671110 | Shoddy Plaything | 10 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 2 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 2 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 3 | empty | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 3 | full | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 4 | empty | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 4 | full | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 10 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10672110 | Substandard Puppet | 10 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 3 | empty | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 3 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 4 | empty | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 4 | full | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 5 | empty | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 5 | full | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 7 | empty | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 7 | full | accelerate | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 8 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 8 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 9 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 9 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 10 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10673110 | Ludicrous Ordnance | 10 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10741110 | Dragonewt Promoter | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10762210 | Timepiece of Perfection | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 2 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 2 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 3 | empty | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10773110 | Brazen Broadcaster | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 4 | empty | normal | 3 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10773110 | Brazen Broadcaster | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 5 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10773110 | Brazen Broadcaster | 5 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 6 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10773110 | Brazen Broadcaster | 6 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10773110 | Brazen Broadcaster | 10 | empty | enhance | 5 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10773110 | Brazen Broadcaster | 10 | full | enhance | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 4 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10814120 | Tia, Eternal Crystalian | 4 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 5 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10814120 | Tia, Eternal Crystalian | 5 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10814120 | Tia, Eternal Crystalian | 10 | empty | enhance | 4 | yes | FAIL I6 / ok I1,I2,I3,I4,I5 |
| 10814120 | Tia, Eternal Crystalian | 10 | full | enhance | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 4 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 5 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 6 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 7 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10822310 | Shared Existence | 10 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 2 | empty | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 2 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 3 | empty | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 3 | full | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 4 | empty | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 4 | full | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 7 | empty | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 7 | full | accelerate | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 8 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 8 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 9 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 9 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 10 | empty | normal | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10844120 | Lumiore & Argente, Shining Wings | 10 | full | normal | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 2 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 2 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 3 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 3 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 4 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 4 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 5 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 5 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 6 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 6 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 10 | empty | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10862310 | Lingering Threat | 10 | full | enhance | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 8 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 8 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 9 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 9 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 10 | empty | enhance | 9 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10874110 | Asher & Lydia, Paths Beyond | 10 | full | enhance | 9 | no | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 0 | empty | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 0 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 1 | empty | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 1 | full | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 2 | empty | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 2 | full | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 5 | empty | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 5 | full | accelerate | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 6 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 6 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 7 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 7 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 10 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10901110 | Jailor of Antiquity | 10 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 2 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 3 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 5 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 5 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 6 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 7 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10921310 | Phalanx | 10 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 4 | empty | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 4 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 5 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 5 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 6 | empty | normal | 5 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 6 | full | normal | 5 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 7 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 7 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 8 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 8 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 10 | empty | enhance | 7 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10922120 | Ferocious Commander | 10 | full | enhance | 7 | no | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 4 | full | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 5 | full | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 6 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 6 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 7 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 7 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 10 | empty | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10923310 | L'Age d'Or | 10 | full | enhance | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 3 | empty | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 3 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 4 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 4 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 5 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 5 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 7 | empty | normal | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 7 | full | normal | 4 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 8 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 8 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 9 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 9 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 10 | empty | enhance | 8 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10932110 | Enamored Researcher | 10 | full | enhance | 8 | no | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 0 | empty | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 0 | full | normal | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 1 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 1 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 2 | empty | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 2 | full | normal | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 3 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 3 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 4 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 4 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 10 | empty | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10941310 | Drake Whelp's Tantrum | 10 | full | enhance | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 1 | empty | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 1 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 2 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 2 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 3 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 3 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 5 | empty | crystallize | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 5 | full | crystallize | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 6 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 6 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 7 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 7 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 10 | empty | normal | 6 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952110 | Void Colonel | 10 | full | normal | 6 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 1 | empty | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 1 | full | normal | 2 | no | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 2 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 2 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 3 | empty | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 3 | full | normal | 2 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 4 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 4 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 5 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 5 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 10 | empty | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10952310 | Chains of the Past | 10 | full | enhance | 4 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 0 | empty | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 0 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 1 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 1 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 2 | empty | crystallize | 1 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 2 | full | crystallize | 1 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 3 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 3 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 4 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 4 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 10 | empty | normal | 3 | yes | pass I1,I2,I3,I4,I5,I6 |
| 10962120 | Miraculous Al-mi'raj | 10 | full | normal | 3 | no | pass I1,I2,I3,I4,I5,I6 |
