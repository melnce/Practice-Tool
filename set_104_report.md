
# Set 104 Implementation Report


## A) Implemented (Tested)
- **10421120 Arthur, Staunch Dragon**: Ward, Summon Mordred. (Test: `tests/set_104.test.ts`)
- **10421130 Mordred, Illusory Lion**: Storm, Summon Arthur. (Test: `tests/set_104.test.ts`)
- **10422130 Fiorito, Muscles in Bloom**: Ambush, Bane. (Test: `tests/set_104.test.ts`)
- **10431110 Philosophia, Cryptic Sophist**: Draw a spell. (Test: `tests/set_104.test.ts`)
- **10431310 Rune Portal**: Deal 6 AoE, Restore 3 Leader. (Test: `tests/set_104.test.ts`)
- **10411110 Kou & You, Love and Hatred**: Attacks 2x, Strike Restore 3 All.
- **10411120 Manamel, Super Cutest**: EOT Auto-Evolve + Fanfare-like AoE.
- **10412110 Chloe, What a Gal**: Enhance(8) Summon form hand + Self-bounce.
- **10412120 Anthuria, Toe-Tapping Torch**: Fanfare Buff all Barrier. (Test: `tests/set_104.test.ts`)
- **10412310 Starry Sky**: Damage + Combo(5) Gain Crest.
- **10421110 Randall, Feet Fighter**: Enhance(5) Storm. (Test: `tests/set_104.test.ts`)
- **10422110 Aglovale, Lord of Frost**: Fanfare AoE 3 dmg + Intimidate. (Test: `tests/set_104.test.ts`)
- **10432110 Ezecrain, Portent of Vengeance**: Fanfare Select 2 Dmg 4 + Sigils. (Test: `tests/set_104.test.ts`)
- **10433310 Alchemic Flare**: Spell Select Dmg 4 + Sigil. (Test: `tests/set_104.test.ts`)
- **10441110 Joel, Wave Chaser**: Ward, Aura.
- **10442310 Maximum Love Bomb**: Spell Dmg 3 + Can't Attack.
- **10443310 Primal Beast Absorption**: Spell Banish + Copy to Hand.
- **10451110 Almeida, Headstrong Miner**: Enhance(4) Evolve + Buff + Rush.
- **10451120 Vaseraga, Unyielding Scythe**: Intimidate, Last Words Re-summon.
- **10423110 Golden Knight, True King's Blade**: Enhance(9) Super-Evo/AoE/Heal. (Logic Implemented)
- **10454110 Fediel, Darkness Personified**: Reanimate 2/1 + Evolve Summons. (Logic Implemented)
- **10454120 Belial, Archangel of Cunning**: Super-Evo -> Start Crest. (Logic Implemented)
- **10471110 Sho, Reborn Night King**: Super-Evo Gate -> Barrier. (Logic Implemented)
- **10441210 Vyrn, Li'l Red Dragon**: Super-Evo Gate -> Evolve Self (Free). (Logic Implemented)
- **104031110 Lyria, Azure Maiden**: Fanfare Draw + Enhance(8) Recover PP. (Logic Implemented)
- **10432120 Mireille & Risette, Penitent Duo**: Earth Rite(2) -> Evolve Named. (Logic Implemented)
- **10423310 Knightly Ardor**: Spell with 4 Modes. (Logic Implemented)
- **10424110 Zeta & Bea, Crimson and Blue**: Summon named, Enhance(6) Buffs (Bane/Storm). (Logic Implemented)
- **10434110 Wamdus, Water Personified**: Spellboost cost reduce, Fanfare Super-Evo Modes. (Logic Implemented)
- **10442110 Izmir, Frigid Fate**: Max PP gate -> Evolve. (Logic Implemented)
- **10452130 Baal, Elemental Resonance**: Fanfare Modes. (Logic Implemented)
- **10453110 Nehan, Dispenser of Samsara**: Mass Evolve + Self Damage + Drain. (Logic Implemented)
- **10461120 Lamretta, Sisterly Shepherd**: EOT check evolved -> AoE. (Logic Implemented)

## B) Partially Implemented
- **10411310 Comet Drive**: Drawing logic condition (`evolved_ally_exists`) implemented.

## C) Not Implemented (Blocked/Pending)
### Skybound Art / Super Skybound Art
**Cards**: Katalina, Gran & Djeeta, Sandalphon, Cupitan, Alfheimr, Ewiyar, Seofon, Cagliostro, Mugen, Meg.
**Gap**: No generic `Skybound Art` (evolve/turn count trigger) keyword or parser logic.
**Proposal**: Add `skybound_art_gate` op or keyword logic. Priority: **High**.

### Crests
**Cards**: Sandalphon, Yuel & Societte, Crescent Tube Ride, Valiant Edge.
**Gap**: UI/State support for specific crest tokens.
**Proposal**: Verify `add_counter` or dedicated crest system. Priority: **Medium**.

### Other
- **10452120 Satyr, Open-Hearted Rover**: Condition evolved_ally -> Evolve. (Missing general `condition_gate` logic)
- **10461110 Troue, Heroic Visionary**: Engage -> Drain. (Engage mechanic check needed)


