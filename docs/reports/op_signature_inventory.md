# Op Signature Inventory

Generated: 2025-12-22T19:10:54.619Z

## Summary

| Set                          | Card Count |
| ---------------------------- | ---------- |
| 10000_basic.json             | 56         |
| 10001_legends-rise.json      | 142        |
| 10002_infinity-evolved.json  | 77         |
| 10003_heirs-of-the-omen.json | 77         |
| token_details.json           | 69         |

**Total unique op signatures:** 353
**Total unique ops used:** 100

## ⚠️ Unknown/Unimplemented Ops

- `attacks_per_turn`
- `both_max_pp_gate`
- `buff_hand_class`
- `buff_hand_tribe`
- `buff_last_added_to_hand`
- `combo_add`
- `combo_repeat_buff`
- `evolve`
- `evolve_all_unevolved_allies`
- `evolved_self_gate`
- `fill_board_chain_decay`
- `increase_countdown`
- `modify_cost_pool`
- `no_duplicates_in_deck_gate`
- `reduce_cost_self`
- `select_hand_summon_artifact_copies_eot_destroy`
- `select_hand_summon_artifact_copy`
- `self_cost_gate`
- `set_attack_to`
- `set_cost_self`
- `set_deckout_victory`
- `set_spellboost_count`
- `spellboost_target`
- `summon_destroyed_amulet_highest_base_cost`
- `summon_random_from_deck`
- `super_evo_gate`
- `super_evolve_ally`
- `super_evolved_self_gate`
- `transform_self_if_spellboost_at_least`

## Op Signatures by Operation

### add_counter

| Signature               | Zone           | Representative Card | Usage Count |
| ----------------------- | -------------- | ------------------- | ----------- |
| `add_counter(amount:1)` | keyword:Engage | Witch's New Brew    | 2           |

### add_max_pp

| Signature              | Zone  | Representative Card | Usage Count |
| ---------------------- | ----- | ------------------- | ----------- |
| `add_max_pp(amount:1)` | spell | Dragonsign          | 1           |

### add_shadows

| Signature               | Zone    | Representative Card  | Usage Count |
| ----------------------- | ------- | -------------------- | ----------- |
| `add_shadows(amount:2)` | fanfare | Shadowcrypt Memorial | 2           |

### add_to_hand

| Signature                                          | Zone              | Representative Card           | Usage Count |
| -------------------------------------------------- | ----------------- | ----------------------------- | ----------- |
| `add_to_hand(count:2,name:Fairy)`                  | fanfare           | Fairy Tamer                   | 2           |
| `add_to_hand(count:1,name:Fairy)`                  | fanfare           | Wild Profusion                | 5           |
| `add_to_hand(count:1,name:Bat)`                    | keyword:LastWords | Lilith, Enchanting Succubus   | 2           |
| `add_to_hand(count:1,name:Gear of Ambition)`       | fanfare           | Kitty Cannoneer               | 11          |
| `add_to_hand(count:1,name:Enhanced Puppet)`        | fanfare           | Puppet Lancer                 | 2           |
| `add_to_hand(count:1,name:Gear of Remembrance)`    | spell             | Bullet from Beyond            | 13          |
| `add_to_hand(count:1,name:Puppet)`                 | fanfare           | Puppet Theater                | 6           |
| `add_to_hand(count:1,name:Detective's Lens)`       | keyword:LastWords | Vigilant Detective            | 1           |
| `add_to_hand(name:Fairy)`                          | fanfare           | Capricious Sprite             | 3           |
| `add_to_hand(count:1,name:Deepwood Bounty)`        | fanfare           | Lambent Cairn                 | 3           |
| `add_to_hand(count:1,name:Skeleton)`               | keyword:LastWords | Mino, Shrewd Reaper           | 2           |
| `add_to_hand(count:1,name:Ghost)`                  | keyword:LastWords | Yuna, Occult Hunter           | 3           |
| `add_to_hand(count:3,name:Puppet)`                 | fanfare           | Noah, Thread of Death         | 1           |
| `add_to_hand(count:1,name:Nonja, Silent Maid)`     | fanfare           | Prim, Princess's Picnic       | 1           |
| `add_to_hand(count:1,name:Witch's New Brew)`       | fanfare           | Melvie, Adoring Witch         | 1           |
| `add_to_hand(count:1,name:Whitefrost Whisper)`     | fanfare           | Filene, Whitefrost Bloom      | 1           |
| `add_to_hand(count:1,name:Rotting Zombie)`         | spell             | Ghastly Soiree                | 1           |
| `add_to_hand(count:1,name:Great Testimony)`        | fanfare           | Mjerrabaine, Great Manifest   | 1           |
| `add_to_hand(count:1,name:Sweetness of Voracity)`  | fanfare           | Gilnelise, Voracity Manifest  | 1           |
| `add_to_hand(count:1,name:Annihilating Onslaught)` | evolve            | Izudia, Annihilation Manifest | 2           |
| `add_to_hand(count:1,name:Gilded Boots)`           | fanfare           | Devotee of Usurpation         | 3           |
| `add_to_hand(count:1,name:Gilded Goblet)`          | keyword:LastWords | Devotee of Usurpation         | 3           |
| `add_to_hand(count:1,name:Gilded Necklace)`        | fanfare           | Supplicant of Usurpation      | 4           |
| `add_to_hand(count:1,name:Gilded Blade)`           | keyword:LastWords | Supplicant of Usurpation      | 5           |
| `add_to_hand(name:Remnant of Hollowness)`          | fanfare           | Octrice, Hollowness Manifest  | 1           |
| `add_to_hand(count:1)`                             | superevolve       | Sham-Nacha, Heir to Entwining | 1           |
| `add_to_hand(name:Scream Diffusion)`               | fanfare           | Rulenye & Valnareik           | 1           |
| `add_to_hand(name:Wings of Desire)`                | fanfare           | Rulenye & Valnareik           | 1           |
| `add_to_hand(name:Torrent of Despair)`             | fanfare           | Marwynn, Despair Manifest     | 1           |
| `add_to_hand(count:2,name:Puppet)`                 | spell             | Wired Assault                 | 1           |
| `add_to_hand(name:Melodious Monody)`               | fanfare           | Lishenna, Melody Manifest     | 1           |

### amulet_count_gate

| Signature                                       | Zone    | Representative Card       | Usage Count |
| ----------------------------------------------- | ------- | ------------------------- | ----------- |
| `amulet_count_gate(count:2,has_nested_effects)` | fanfare | Colette, Barrage Exorcist | 2           |

### attacks_per_turn ⚠️

| Signature          | Zone            | Representative Card      | Usage Count |
| ------------------ | --------------- | ------------------------ | ----------- |
| `attacks_per_turn` | keyword:Enhance | Albert, Levin Stormsaber | 3           |

### banish

| Signature                                    | Zone        | Representative Card    | Usage Count |
| -------------------------------------------- | ----------- | ---------------------- | ----------- |
| `banish(select:1,target:enemy:follower)`     | evolve      | Ironfist Priest        | 3           |
| `banish(select:false,target:enemy:follower)` | superevolve | Ironfist Priest        | 1           |
| `banish(select:1,target:enemy:card)`         | fanfare     | Odin, Twilit Fate      | 1           |
| `banish(target:selected)`                    | evolve      | Achim, Lord of Despair | 2           |

### banish_all_enemy_copies

| Signature                 | Zone        | Representative Card     | Usage Count |
| ------------------------- | ----------- | ----------------------- | ----------- |
| `banish_all_enemy_copies` | superevolve | Velharia, Heir to Truth | 1           |

### banish_duplicates_from_deck

| Signature                     | Zone    | Representative Card    | Usage Count |
| ----------------------------- | ------- | ---------------------- | ----------- |
| `banish_duplicates_from_deck` | fanfare | Tablet of Tribulations | 1           |

### banish_random

| Signature                                      | Zone    | Representative Card | Usage Count |
| ---------------------------------------------- | ------- | ------------------- | ----------- |
| `banish_random(count:1,target:enemy:follower)` | fanfare | Torrent of Despair  | 1           |

### banish_self

| Signature     | Zone                | Representative Card | Usage Count |
| ------------- | ------------------- | ------------------- | ----------- |
| `banish_self` | trigger:end_of_turn | Ghost               | 1           |

### board_name_gate

| Signature                                                                | Zone    | Representative Card    | Usage Count |
| ------------------------------------------------------------------------ | ------- | ---------------------- | ----------- |
| `board_name_gate(has_nested_effects,name:Prim, Princess's Picnic)`       | fanfare | Nonja, Silent Maid     | 1           |
| `board_name_gate(has_nested_effects,name:Izudia, Annihilation Manifest)` | spell   | Annihilating Onslaught | 1           |

### both_max_pp_gate ⚠️

| Signature                              | Zone    | Representative Card          | Usage Count |
| -------------------------------------- | ------- | ---------------------------- | ----------- |
| `both_max_pp_gate(has_nested_effects)` | fanfare | Gilnelise, Voracity Manifest | 1           |

### buff

| Signature                                      | Zone                        | Representative Card          | Usage Count |
| ---------------------------------------------- | --------------------------- | ---------------------------- | ----------- |
| `buff(target:trigger)`                         | keyword:AllyEnter           | Ancestral Crown              | 1           |
| `buff(target:selected)`                        | superevolve                 | Remi & Rami, Two-Faced Witch | 7           |
| `buff(select:1,target:ally:follower)`          | fanfare                     | Winged Warrior               | 8           |
| `buff(target:ally:follower)`                   | fanfare                     | Fay Twinkletoes              | 16          |
| `buff(amount:1,select:1,target:ally:follower)` | fanfare                     | Ian, Lovebound Knight        | 2           |
| `buff(target:entering_follower)`               | trigger:ally_follower_enter | Amalia, Luxsteel Paladin     | 2           |
| `buff`                                         | spell                       | Snowman Army                 | 1           |
| `buff(target:enemy:follower)`                  | fanfare                     | Twilight Dragon              | 4           |
| `buff(has_condition,target:ally:follower)`     | superevolve                 | Ralmia, Sonic Boom           | 2           |
| `buff(select:1,target:all:follower)`           | spell                       | Dark Side                    | 5           |
| `buff(select:2,target:enemy:follower)`         | fanfare                     | Lymaga, Untamed Wild         | 1           |
| `buff(target:selected:follower)`               | spell                       | Divine Guard                 | 1           |
| `buff(select:1,target:enemy:follower)`         | fanfare                     | Devotee of Unkilling         | 5           |
| `buff(count:1,target:ally:follower)`           | keyword:engage              | Castle of Entwining          | 2           |

### buff_hand_class ⚠️

| Signature         | Zone            | Representative Card   | Usage Count |
| ----------------- | --------------- | --------------------- | ----------- |
| `buff_hand_class` | trigger:unknown | Congregant of Disdain | 1           |

### buff_hand_tribe ⚠️

| Signature         | Zone    | Representative Card   | Usage Count |
| ----------------- | ------- | --------------------- | ----------- |
| `buff_hand_tribe` | fanfare | Noah, Thread of Death | 1           |

### buff_last_added_to_hand ⚠️

| Signature                 | Zone    | Representative Card | Usage Count |
| ------------------------- | ------- | ------------------- | ----------- |
| `buff_last_added_to_hand` | fanfare | Puppet Cat          | 1           |

### buff_self

| Signature   | Zone            | Representative Card | Usage Count |
| ----------- | --------------- | ------------------- | ----------- |
| `buff_self` | keyword:Enhance | Indomitable Fighter | 40          |

### choose

| Signature | Zone    | Representative Card | Usage Count |
| --------- | ------- | ------------------- | ----------- |
| `choose`  | fanfare | Dazzling Runeknight | 23          |

### combo_add ⚠️

| Signature             | Zone    | Representative Card | Usage Count |
| --------------------- | ------- | ------------------- | ----------- |
| `combo_add(amount:1)` | fanfare | Stray Beastman      | 1           |

### combo_gate

| Signature                                | Zone    | Representative Card | Usage Count |
| ---------------------------------------- | ------- | ------------------- | ----------- |
| `combo_gate(count:3,has_nested_effects)` | fanfare | Gentle Treant       | 10          |

### combo_repeat_buff ⚠️

| Signature                                          | Zone  | Representative Card | Usage Count |
| -------------------------------------------------- | ----- | ------------------- | ----------- |
| `combo_repeat_buff(count:1,target:enemy:follower)` | spell | Eradicating Arrow   | 1           |

### crest_pay_counter

| Signature                      | Zone    | Representative Card           | Usage Count |
| ------------------------------ | ------- | ----------------------------- | ----------- |
| `crest_pay_counter(amount:10)` | fanfare | Sham-Nacha, Heir to Entwining | 1           |

### damage

| Signature                                                                   | Zone                    | Representative Card         | Usage Count |
| --------------------------------------------------------------------------- | ----------------------- | --------------------------- | ----------- |
| `damage(amount:1,count:1,target:enemy:follower)`                            | keyword:PixieEnter      | Wild Profusion              | 3           |
| `damage(amount:3,select:1,target:enemy:follower)`                           | fanfare                 | May, Journey Elf            | 13          |
| `damage(amount:2,count:1,target:enemy:follower)`                            | spell                   | Bug Alert                   | 11          |
| `damage(amount:2,target:all:follower)`                                      | spell                   | Arcane Eruption             | 1           |
| `damage(amount:1,select:1,target:enemy:follower)`                           | fanfare                 | Searing Firenewt            | 4           |
| `damage(amount:6,target:enemy:leader)`                                      | fanfare                 | Warrior of the Deep         | 2           |
| `damage(amount:2,select:1,target:enemy:follower)`                           | spell                   | Strike of the Dragonewt     | 2           |
| `damage(amount:4,select:1,target:enemy:follower)`                           | evolve                  | Draconic Berserker          | 5           |
| `damage(amount:4,target:enemy:follower)`                                    | superevolve             | Draconic Berserker          | 4           |
| `damage(amount:1,target:ally:leader)`                                       | fanfare                 | Night Fiend                 | 2           |
| `damage(amount:1,target:enemy:follower)`                                    | fanfare                 | Apollo, Heaven's Envoy      | 11          |
| `damage(amount:3,count:3,target:enemy:follower)`                            | fanfare                 | Elder Sagebrush             | 1           |
| `damage(target:enemy_followers)`                                            | evolve                  | Glade, Fragrantwood Ward    | 2           |
| `damage(amount:5,select:1,target:enemy:follower)`                           | fanfare                 | Valse, Silent Sniper        | 5           |
| `damage(amount:3,target:enemy:follower)`                                    | keyword:Enhance         | Albert, Levin Stormsaber    | 8           |
| `damage(amount:{self.attack},has_condition,select:1,target:enemy:follower)` | fanfare                 | Runeblade Conductor         | 1           |
| `damage(target:enemy_board)`                                                | evolve                  | Emmylou, Witch of Wonder    | 2           |
| `damage(amount:{self.spellboostCount},target:enemy:follower)`               | fanfare                 | William, Mysterian Student  | 2           |
| `damage(amount:{earth_counter_sum},select:1,target:enemy:follower)`         | fanfare                 | Juno, Visionary Alchemist   | 1           |
| `damage(amount:4,count:1,target:enemy:follower)`                            | evolve                  | Edelweiss, Sagelight Ward   | 7           |
| `damage(amount:5,target:all:follower)`                                      | spell                   | Calamity Breath             | 1           |
| `damage(amount:{last_discarded_cost},target:enemy:follower)`                | fanfare                 | Burnite, Anathema of Flame  | 1           |
| `damage(amount:2,target:ally:leader)`                                       | fanfare                 | Darkseal Demon              | 5           |
| `damage(amount:6,select:1,target:enemy:follower)`                           | evolve                  | Darkseal Demon              | 2           |
| `damage(amount:3,target:ally:leader)`                                       | fanfare                 | Beryl, Nightmare Incarnate  | 3           |
| `damage(amount:2,count:2,target:enemy:follower)`                            | superevolve             | Orthrus, Hellhound Blader   | 3           |
| `damage(amount:7,target:enemy_followers)`                                   | fanfare                 | Aragavy, Eternal Hunter     | 1           |
| `damage(amount:3,target:enemy:leader)`                                      | evolve                  | Aragavy, Eternal Hunter     | 3           |
| `damage(amount:1,target:enemy:leader)`                                      | trigger:clash           | Reno, Luxwing Featherfolk   | 4           |
| `damage(amount:6,target:enemy:follower)`                                    | fanfare                 | Jeanne, Saintly Knight      | 1           |
| `damage(amount:4,count:3,target:enemy:follower)`                            | keyword:Enhance         | Band of Battle Princesses   | 1           |
| `damage(amount:2,target:enemy:leader)`                                      | spell                   | Glacial Crash               | 3           |
| `damage(count:1,target:enemy:follower)`                                     | spell                   | Divine Guard                | 1           |
| `damage(amount:10,target:ally:leader)`                                      | spell                   | Maddening Benison           | 1           |
| `damage(amount:3,count:1,target:enemy:follower)`                            | trigger:loot_fused      | Congregant of Usurpation    | 7           |
| `damage(amount:{self.fused_loot_unique},target:enemy:follower)`             | fanfare                 | Sinciro, Heir to Usurpation | 2           |
| `damage(amount:{self.fused_loot_unique},target:enemy:leader)`               | fanfare                 | Sinciro, Heir to Usurpation | 2           |
| `damage(amount:3,target:other:follower)`                                    | fanfare                 | Supplicant of Truth         | 1           |
| `damage(amount:5,target:follower)`                                          | spell                   | Raging Lightning            | 1           |
| `damage(amount:3,target:leader)`                                            | spell                   | Raging Lightning            | 1           |
| `damage(amount:1,target:other:follower)`                                    | keyword:Engage          | Nation of Disdain           | 1           |
| `damage(amount:3,has_condition,target:all:follower)`                        | fanfare                 | Congregant of Disdain       | 1           |
| `damage(amount:1,select:1,target:ally:follower)`                            | spell                   | Ferocious Flame             | 1           |
| `damage(amount:2,has_condition,target:all:follower)`                        | fanfare                 | Azurifrit, Heir to Disdain  | 6           |
| `damage(amount:4,target:ally:leader)`                                       | fanfare                 | Ephemeral Demon Princess    | 1           |
| `damage(amount:4)`                                                          | keyword:LastWords       | Shining Disenchantment      | 2           |
| `damage(target:enemy:leader)`                                               | superevolve             | Axia, Heir to Destruction   | 1           |
| `damage(amount:6,select:2,target:enemy:follower)`                           | fanfare                 | Demon of Purgatory          | 1           |
| `damage(amount:5,target:enemy:follower)`                                    | fanfare                 | Masterwork Artifact Ω       | 1           |
| `damage(amount:{self.attack},target:defender)`                              | trigger:follower_strike | Victoria                    | 1           |
| `damage(amount:5,count:1,target:enemy:follower)`                            | spell                   | Sweetness of Voracity       | 1           |
| `damage(amount:5,target:enemy:leader)`                                      | spell                   | Sweetness of Voracity       | 1           |
| `damage(amount:20,target:enemy:leader)`                                     | spell                   | Annihilating Onslaught      | 1           |
| `damage(amount:1,target:all:follower)`                                      | spell                   | Fangs of Ardent Destruction | 1           |
| `damage(amount:2)`                                                          | spell                   | Ars Magna                   | 1           |

### destroy

| Signature                                               | Zone        | Representative Card           | Usage Count |
| ------------------------------------------------------- | ----------- | ----------------------------- | ----------- |
| `destroy(select:1,target:ally:follower)`                | spell       | Soul Predation                | 2           |
| `destroy(select:1,target:enemy:follower)`               | spell       | Bullet from Beyond            | 14          |
| `destroy(select:2,target:enemy:follower)`               | superevolve | Sylvia, Garden Executioner    | 5           |
| `destroy(has_condition,select:1,target:enemy:follower)` | evolve      | Cleric of Crushing            | 2           |
| `destroy(target:selected:follower)`                     | superevolve | Sham-Nacha, Heir to Entwining | 1           |
| `destroy(select:1,target:ally:any)`                     | spell       | Devastating Soprano           | 2           |

### destroy_all

| Signature                                          | Zone            | Representative Card    | Usage Count |
| -------------------------------------------------- | --------------- | ---------------------- | ----------- |
| `destroy_all(has_condition,target:ally:follower)`  | keyword:Enhance | Kuon, Fivefold Master  | 1           |
| `destroy_all(target:all:follower)`                 | keyword:Engage  | Unholy Vessel          | 1           |
| `destroy_all(has_condition,target:enemy:follower)` | fanfare         | Snowstorm Dragonewt    | 2           |
| `destroy_all(has_condition,target:ally:any)`       | fanfare         | Devotee of Destruction | 3           |
| `destroy_all(target:enemy:follower)`               | spell           | Ersatz Elimination     | 1           |

### destroy_allied_amulets_then_damage

| Signature                            | Zone    | Representative Card | Usage Count |
| ------------------------------------ | ------- | ------------------- | ----------- |
| `destroy_allied_amulets_then_damage` | fanfare | Skullfane of Demise | 1           |

### destroy_defender_if_damaged

| Signature                     | Zone                    | Representative Card   | Usage Count |
| ----------------------------- | ----------------------- | --------------------- | ----------- |
| `destroy_defender_if_damaged` | trigger:follower_strike | Rosé, Princess Knight | 1           |

### destroy_highest

| Signature                                        | Zone  | Representative Card | Usage Count |
| ------------------------------------------------ | ----- | ------------------- | ----------- |
| `destroy_highest(count:1,target:enemy:follower)` | spell | Divine Thunder      | 2           |

### destroy_random

| Signature                                       | Zone           | Representative Card                | Usage Count |
| ----------------------------------------------- | -------------- | ---------------------------------- | ----------- |
| `destroy_random(count:4,target:enemy:follower)` | fanfare        | Ginsetsu & Yuzuki, Twin Calamities | 1           |
| `destroy_random(target:enemy:follower)`         | trigger:strike | Agnes, the Swiftblade              | 2           |

### destroy_random_other_allies

| Signature                     | Zone    | Representative Card       | Usage Count |
| ----------------------------- | ------- | ------------------------- | ----------- |
| `destroy_random_other_allies` | fanfare | Congregant of Destruction | 1           |

### destroy_self

| Signature      | Zone                | Representative Card | Usage Count |
| -------------- | ------------------- | ------------------- | ----------- |
| `destroy_self` | trigger:end_of_turn | Anne's Summoning    | 3           |

### destroy_then

| Signature                                           | Zone    | Representative Card       | Usage Count |
| --------------------------------------------------- | ------- | ------------------------- | ----------- |
| `destroy_then(has_nested_effects,target:ally:card)` | fanfare | Supplicant of Destruction | 4           |

### discard_select_hand

| Signature                      | Zone           | Representative Card | Usage Count |
| ------------------------------ | -------------- | ------------------- | ----------- |
| `discard_select_hand(count:1)` | keyword:Engage | Fan of Otohime      | 4           |

### draw

| Signature         | Zone        | Representative Card      | Usage Count |
| ----------------- | ----------- | ------------------------ | ----------- |
| `draw(count:1)`   | evolve      | Leah, Bellringer Angel   | 36          |
| `draw(count:2)`   | spell       | Way of the Maid          | 22          |
| `draw(count:all)` | superevolve | Rusty, Luxcard Trickster | 1           |
| `draw`            | fanfare     | Deepwood Fairy Beast     | 3           |
| `draw(count:5)`   | spell       | Dimension Climb          | 1           |
| `draw(count:3)`   | superevolve | Twilight Dragon          | 7           |

### dynamic_buff_self

| Signature           | Zone    | Representative Card | Usage Count |
| ------------------- | ------- | ------------------- | ----------- |
| `dynamic_buff_self` | fanfare | Killer Rhinoceroach | 5           |

### dynamic_heal_leader

| Signature             | Zone    | Representative Card  | Usage Count |
| --------------------- | ------- | -------------------- | ----------- |
| `dynamic_heal_leader` | fanfare | Deepwood Fairy Beast | 1           |

### earth_rite

| Signature                               | Zone    | Representative Card          | Usage Count |
| --------------------------------------- | ------- | ---------------------------- | ----------- |
| `earth_rite(cost:1,has_nested_effects)` | fanfare | Remi & Rami, Two-Faced Witch | 12          |
| `earth_rite(cost:2,has_nested_effects)` | fanfare | Edelweiss, Sagelight Ward    | 2           |

### evolve ⚠️

| Signature | Zone        | Representative Card          | Usage Count |
| --------- | ----------- | ---------------------------- | ----------- |
| `evolve`  | superevolve | Remi & Rami, Two-Faced Witch | 1           |

### evolve_all_unevolved_allies ⚠️

| Signature                     | Zone   | Representative Card    | Usage Count |
| ----------------------------- | ------ | ---------------------- | ----------- |
| `evolve_all_unevolved_allies` | evolve | Reina, Angelic Partner | 2           |

### evolve_self

| Signature     | Zone    | Representative Card | Usage Count |
| ------------- | ------- | ------------------- | ----------- |
| `evolve_self` | fanfare | Gentle Treant       | 5           |

### evolved_self_gate ⚠️

| Signature                               | Zone              | Representative Card             | Usage Count |
| --------------------------------------- | ----------------- | ------------------------------- | ----------- |
| `evolved_self_gate(has_nested_effects)` | keyword:LastWords | Hnikar & Jafnhar, Firestorm Duo | 1           |

### fill_board_chain_decay ⚠️

| Signature                | Zone                        | Representative Card     | Usage Count |
| ------------------------ | --------------------------- | ----------------------- | ----------- |
| `fill_board_chain_decay` | trigger:ally_follower_enter | Congregant of Unkilling | 1           |

### follower_strike_destroy

| Signature                 | Zone                    | Representative Card       | Usage Count |
| ------------------------- | ----------------------- | ------------------------- | ----------- |
| `follower_strike_destroy` | trigger:follower_strike | Medusa, Venomfang Royalty | 1           |

### gain_crest

| Signature                                                          | Zone              | Representative Card          | Usage Count |
| ------------------------------------------------------------------ | ----------------- | ---------------------------- | ----------- |
| `gain_crest(name:Aria, Lady of the Woods)`                         | fanfare           | Aria, Lady of the Woods      | 1           |
| `gain_crest(has_nested_effects,name:Kagemitsu, Enduring Warrior)`  | keyword:lastwords | Kagemitsu, Enduring Warrior  | 1           |
| `gain_crest(name:Juno, Visionary Alchemist)`                       | evolve            | Juno, Visionary Alchemist    | 2           |
| `gain_crest(name:Burnite, Anathema of Flame)`                      | superevolve       | Burnite, Anathema of Flame   | 1           |
| `gain_crest(name:Balto, Dusk Bounty Hunter)`                       | fanfare           | Balto, Dusk Bounty Hunter    | 1           |
| `gain_crest(has_nested_effects,name:Lapis, Shining Seraph)`        | keyword:lastwords | Lapis, Shining Seraph        | 1           |
| `gain_crest(name:Eudie, Maiden Reborn)`                            | evolve            | Eudie, Maiden Reborn         | 2           |
| `gain_crest(name:Grimnir, Heavenly Gale)`                          | fanfare           | Grimnir, Heavenly Gale       | 1           |
| `gain_crest(name:Titania, Queen of Fairies)`                       | fanfare           | Titania, Queen of Fairies    | 1           |
| `gain_crest(name:Bergent, Rejected Artes)`                         | evolve            | Bergent, Rejected Artes      | 3           |
| `gain_crest(name:Pascale's Dance)`                                 | spell             | Pascale's Dance              | 1           |
| `gain_crest(name:Charon, Stygian Oarswoman)`                       | superevolve       | Charon, Stygian Oarswoman    | 1           |
| `gain_crest(has_nested_effects,name:Maddening Benison)`            | spell             | Maddening Benison            | 1           |
| `gain_crest(name:Wilbert, Desolate Paladin)`                       | evolve            | Wilbert, Desolate Paladin    | 2           |
| `gain_crest(name:Mjerrabaine, Great Manifest)`                     | evolve            | Mjerrabaine, Great Manifest  | 2           |
| `gain_crest(name:Krulle, Heir to Unkilling)`                       | superevolve       | Krulle, Heir to Unkilling    | 1           |
| `gain_crest(has_nested_effects,name:Octrice, Hollowness Manifest)` | fanfare           | Octrice, Hollowness Manifest | 1           |
| `gain_crest(has_nested_effects,name:Crystal Gazing)`               | spell             | Crystal Gazing               | 1           |
| `gain_crest(name:Galmieux, Ardor Manifest)`                        | fanfare           | Galmieux, Ardor Manifest     | 1           |
| `gain_crest(name:Devotee of Repose)`                               | fanfare           | Devotee of Repose            | 1           |
| `gain_crest(name:Supplicant of Repose)`                            | fanfare           | Supplicant of Repose         | 1           |
| `gain_crest(name:Congregant of Repose)`                            | evolve            | Congregant of Repose         | 2           |
| `gain_crest(name:Himeka, Heir to Repose)`                          | fanfare           | Himeka, Heir to Repose       | 1           |
| `gain_crest(name:Marwynn, Despair Manifest)`                       | evolve            | Marwynn, Despair Manifest    | 2           |

### gain_max_pp

| Signature               | Zone   | Representative Card       | Usage Count |
| ----------------------- | ------ | ------------------------- | ----------- |
| `gain_max_pp(amount:1)` | evolve | Liu Feng, Goldennote Ward | 2           |

### halve_deck_cost

| Signature         | Zone    | Representative Card       | Usage Count |
| ----------------- | ------- | ------------------------- | ----------- |
| `halve_deck_cost` | fanfare | Fennie, Prismatic Phoenix | 1           |

### heal_leader

| Signature                | Zone                        | Representative Card           | Usage Count |
| ------------------------ | --------------------------- | ----------------------------- | ----------- |
| `heal_leader(amount:2)`  | evolve                      | Arriet, Luxminstrel           | 15          |
| `heal_leader(amount:4)`  | superevolve                 | Arriet, Luxminstrel           | 10          |
| `heal_leader(amount:5)`  | fanfare                     | Soulcure Sister               | 6           |
| `heal_leader(amount:1)`  | trigger:ally_follower_enter | Lyrala, Luminous Potionwright | 9           |
| `heal_leader(amount:3)`  | fanfare                     | Salefa, Guardian of Water     | 3           |
| `heal_leader(amount:10)` | spell                       | Maddening Benison             | 1           |

### increase_countdown ⚠️

| Signature                      | Zone    | Representative Card | Usage Count |
| ------------------------------ | ------- | ------------------- | ----------- |
| `increase_countdown(amount:1)` | fanfare | Torrent of Despair  | 1           |

### increase_opponent_hand_cost_eot

| Signature                                   | Zone  | Representative Card | Usage Count |
| ------------------------------------------- | ----- | ------------------- | ----------- |
| `increase_opponent_hand_cost_eot(amount:1)` | spell | Whitefrost Whisper  | 1           |

### keyword

| Signature                                              | Zone                        | Representative Card     | Usage Count |
| ------------------------------------------------------ | --------------------------- | ----------------------- | ----------- |
| `keyword(select:1,target:ally:follower)`               | keyword:Engage              | Adventurers' Guild      | 2           |
| `keyword(target:ally:last_summoned)`                   | superevolve                 | Amorous Necromancer     | 1           |
| `keyword(target:entering_follower)`                    | trigger:ally_follower_enter | Luminous Magus          | 11          |
| `keyword(target:ally:follower)`                        | superevolve                 | Amelia, Silver Captain  | 3           |
| `keyword(has_condition,select:1,target:ally:follower)` | superevolve                 | Kuon, Fivefold Master   | 5           |
| `keyword(has_condition,target:ally:follower)`          | evolve                      | Liam, Crazed Creator    | 3           |
| `keyword(select:2,target:enemy:follower)`              | superevolve                 | Lymaga, Untamed Wild    | 1           |
| `keyword(target:selected)`                             | keyword:Engage              | Pyrewyrm Blade          | 3           |
| `keyword(select:1,target:enemy:follower)`              | fanfare                     | Damus, Oracle of Malice | 1           |
| `keyword(has_condition,select:1,target:ally:hand)`     | fanfare                     | Flight of Icarus        | 3           |

### leader_barrier

| Signature        | Zone              | Representative Card | Usage Count |
| ---------------- | ----------------- | ------------------- | ----------- |
| `leader_barrier` | keyword:LastWords | Temple of Repose    | 1           |

### max_pp_gate

| Signature                         | Zone  | Representative Card | Usage Count |
| --------------------------------- | ----- | ------------------- | ----------- |
| `max_pp_gate(has_nested_effects)` | spell | Dragonsign          | 1           |

### modify_cost

| Signature                               | Zone           | Representative Card | Usage Count |
| --------------------------------------- | -------------- | ------------------- | ----------- |
| `modify_cost(amount:1,target:selected)` | keyword:Engage | Institute of Truth  | 2           |

### modify_cost_pool ⚠️

| Signature                                                   | Zone  | Representative Card | Usage Count |
| ----------------------------------------------------------- | ----- | ------------------- | ----------- |
| `modify_cost_pool(amount:1,has_condition,target:ally:hand)` | spell | Ersatz Elimination  | 1           |

### necromancy_gate

| Signature                                    | Zone    | Representative Card          | Usage Count |
| -------------------------------------------- | ------- | ---------------------------- | ----------- |
| `necromancy_gate(cost:4,has_nested_effects)` | fanfare | Devious Lesser Mummy         | 3           |
| `necromancy_gate(cost:8,has_nested_effects)` | fanfare | Mukan, Shadowcrypt Ward      | 1           |
| `necromancy_gate(cost:6,has_nested_effects)` | fanfare | Cerberus, Hellfire Unleashed | 1           |

### no_duplicates_in_deck_gate ⚠️

| Signature                                        | Zone  | Representative Card | Usage Count |
| ------------------------------------------------ | ----- | ------------------- | ----------- |
| `no_duplicates_in_deck_gate(has_nested_effects)` | spell | Greatness Ascended  | 1           |

### overflow_gate

| Signature                           | Zone    | Representative Card | Usage Count |
| ----------------------------------- | ------- | ------------------- | ----------- |
| `overflow_gate(has_nested_effects)` | fanfare | Swordsnout Trencher | 12          |

### rally_gate

| Signature                                 | Zone    | Representative Card         | Usage Count |
| ----------------------------------------- | ------- | --------------------------- | ----------- |
| `rally_gate(count:20,has_nested_effects)` | fanfare | Gildaria, Anathema of Peace | 1           |

### reanimate

| Signature   | Zone  | Representative Card | Usage Count |
| ----------- | ----- | ------------------- | ----------- |
| `reanimate` | spell | Chaos Cyclone       | 8           |

### recover_pp

| Signature                         | Zone        | Representative Card       | Usage Count |
| --------------------------------- | ----------- | ------------------------- | ----------- |
| `recover_pp(amount:2)`            | fanfare     | Olivia, Heroic Dark Angel | 5           |
| `recover_pp(amount:3)`            | superevolve | Baby Carbuncle            | 3           |
| `recover_pp(amount:currentMaxPP)` | spell       | Dimension Climb           | 1           |
| `recover_pp(amount:1)`            | evolve      | Congregant of Usurpation  | 3           |

### reduce_cost

| Signature               | Zone   | Representative Card     | Usage Count |
| ----------------------- | ------ | ----------------------- | ----------- |
| `reduce_cost(amount:1)` | evolve | Angelic Prism Priestess | 2           |
| `reduce_cost(amount:2)` | spell  | Draconic Strike         | 1           |

### reduce_cost_self ⚠️

| Signature                    | Zone                          | Representative Card      | Usage Count |
| ---------------------------- | ----------------------------- | ------------------------ | ----------- |
| `reduce_cost_self(amount:1)` | trigger:follower_leaves_field | Bayle, Luxglaive Warrior | 2           |
| `reduce_cost_self(amount:3)` | trigger:ally_super_evolve     | Wise Guardian Dragon     | 1           |

### reduce_countdown

| Signature                    | Zone           | Representative Card | Usage Count |
| ---------------------------- | -------------- | ------------------- | ----------- |
| `reduce_countdown(amount:2)` | keyword:Engage | Avian Statue        | 1           |
| `reduce_countdown(amount:1)` | keyword:Engage | Winged Statue       | 5           |

### reduce_deck_followers_cost

| Signature                              | Zone    | Representative Card        | Usage Count |
| -------------------------------------- | ------- | -------------------------- | ----------- |
| `reduce_deck_followers_cost(amount:3)` | fanfare | Raio, Elimination Manifest | 1           |

### remove_keyword

| Signature                                        | Zone              | Representative Card        | Usage Count |
| ------------------------------------------------ | ----------------- | -------------------------- | ----------- |
| `remove_keyword(select:1,target:enemy:follower)` | keyword:Engage    | Detective's Lens           | 1           |
| `remove_keyword(target:ally:last_summoned)`      | keyword:LastWords | Comrade of the Swordmaster | 2           |

### repeat_effect

| Signature       | Zone           | Representative Card | Usage Count |
| --------------- | -------------- | ------------------- | ----------- |
| `repeat_effect` | keyword:Engage | Temple of Repose    | 2           |

### replace_deck

| Signature      | Zone    | Representative Card | Usage Count |
| -------------- | ------- | ------------------- | ----------- |
| `replace_deck` | fanfare | Ruler of Cocytus    | 1           |

### replace_deck_with_set_minus

| Signature                     | Zone   | Representative Card         | Usage Count |
| ----------------------------- | ------ | --------------------------- | ----------- |
| `replace_deck_with_set_minus` | evolve | Mjerrabaine, Great Manifest | 2           |

### restore_full_defense_self

| Signature                   | Zone        | Representative Card        | Usage Count |
| --------------------------- | ----------- | -------------------------- | ----------- |
| `restore_full_defense_self` | superevolve | Azurifrit, Heir to Disdain | 1           |

### restore_self_and_heal_leader

| Signature                      | Zone            | Representative Card   | Usage Count |
| ------------------------------ | --------------- | --------------------- | ----------- |
| `restore_self_and_heal_leader` | trigger:unknown | Supplicant of Disdain | 1           |

### return_hand_to_deck

| Signature                                          | Zone  | Representative Card | Usage Count |
| -------------------------------------------------- | ----- | ------------------- | ----------- |
| `return_hand_to_deck(select:1,target:ally:hand)`   | spell | Way of the Maid     | 5           |
| `return_hand_to_deck(select:all,target:ally:hand)` | spell | Dimension Climb     | 1           |

### return_to_hand

| Signature                                        | Zone        | Representative Card  | Usage Count |
| ------------------------------------------------ | ----------- | -------------------- | ----------- |
| `return_to_hand(select:1,target:enemy:follower)` | superevolve | Selwyn, Sonic Archer | 1           |
| `return_to_hand(select:1,target:ally)`           | spell       | Bug Alert            | 3           |

### select

| Signature                                                                | Zone           | Representative Card          | Usage Count |
| ------------------------------------------------------------------------ | -------------- | ---------------------------- | ----------- |
| `select(has_condition,has_nested_effects,target:ally:follower)`          | superevolve    | Remi & Rami, Two-Faced Witch | 2           |
| `select(has_nested_effects,target:enemy:follower)`                       | fanfare        | Lily, Crystalian Innocence   | 5           |
| `select(has_condition,has_nested_effects,target:ally:hand)`              | spell          | Radiant Rainbow              | 4           |
| `select(has_nested_effects,select:1,target:ally:follower)`               | fanfare        | Marion, Ravishing Dragonewt  | 3           |
| `select(has_nested_effects,target:ally:follower)`                        | keyword:Engage | Pyrewyrm Blade               | 1           |
| `select(has_nested_effects,target:ally:hand)`                            | spell          | Draconic Strike              | 1           |
| `select(has_condition,has_nested_effects,select:1,target:ally:follower)` | spell          | Divine Guard                 | 1           |
| `select(has_condition,has_nested_effects,target:enemy:follower)`         | evolve         | Achim, Lord of Despair       | 2           |
| `select(has_condition,has_nested_effects,select:1,target:ally:hand)`     | keyword:Engage | Institute of Truth           | 2           |
| `select(has_nested_effects,select:1,target:enemy:follower)`              | superevolve    | Velharia, Heir to Truth      | 2           |

### select_hand_summon_artifact_copies_eot_destroy ⚠️

| Signature                                                  | Zone           | Representative Card   | Usage Count |
| ---------------------------------------------------------- | -------------- | --------------------- | ----------- |
| `select_hand_summon_artifact_copies_eot_destroy(select:2)` | spell          | Doomwright Resurgence | 1           |
| `select_hand_summon_artifact_copies_eot_destroy(select:1)` | keyword:Engage | Artifact Catapult     | 1           |

### select_hand_summon_artifact_copy ⚠️

| Signature                                    | Zone    | Representative Card       | Usage Count |
| -------------------------------------------- | ------- | ------------------------- | ----------- |
| `select_hand_summon_artifact_copy`           | evolve  | Alouette, Doomwright Ward | 3           |
| `select_hand_summon_artifact_copy(select:3)` | fanfare | Ralmia, Sonic Boom        | 1           |

### self_cost_gate ⚠️

| Signature                | Zone    | Representative Card | Usage Count |
| ------------------------ | ------- | ------------------- | ----------- |
| `self_cost_gate(cost:2)` | fanfare | Devotee of Truth    | 1           |
| `self_cost_gate(cost:5)` | fanfare | Supplicant of Truth | 1           |
| `self_cost_gate(cost:3)` | fanfare | Congregant of Truth | 1           |

### set_attack_to ⚠️

| Signature                              | Zone        | Representative Card    | Usage Count |
| -------------------------------------- | ----------- | ---------------------- | ----------- |
| `set_attack_to(target:enemy:follower)` | superevolve | Himeka, Heir to Repose | 1           |

### set_cost_last_drawn

| Signature                       | Zone            | Representative Card   | Usage Count |
| ------------------------------- | --------------- | --------------------- | ----------- |
| `set_cost_last_drawn(amount:0)` | keyword:enhance | Rosé, Princess Knight | 1           |

### set_cost_self ⚠️

| Signature                 | Zone                      | Representative Card | Usage Count |
| ------------------------- | ------------------------- | ------------------- | ----------- |
| `set_cost_self(amount:1)` | trigger:ally_super_evolve | Fairy Fencer        | 1           |

### set_deckout_victory ⚠️

| Signature             | Zone   | Representative Card         | Usage Count |
| --------------------- | ------ | --------------------------- | ----------- |
| `set_deckout_victory` | evolve | Mjerrabaine, Great Manifest | 2           |

### set_max_hp

| Signature              | Zone  | Representative Card  | Usage Count |
| ---------------------- | ----- | -------------------- | ----------- |
| `set_max_hp(amount:1)` | spell | Astaroth's Reckoning | 1           |

### set_spellboost_count ⚠️

| Signature                        | Zone    | Representative Card        | Usage Count |
| -------------------------------- | ------- | -------------------------- | ----------- |
| `set_spellboost_count(amount:0)` | fanfare | William, Mysterian Student | 1           |

### set_stats

| Signature   | Zone    | Representative Card        | Usage Count |
| ----------- | ------- | -------------------------- | ----------- |
| `set_stats` | fanfare | Lily, Crystalian Innocence | 2           |

### spellboost_hand

| Signature         | Zone    | Representative Card | Usage Count |
| ----------------- | ------- | ------------------- | ----------- |
| `spellboost_hand` | fanfare | Dazzling Runeknight | 15          |

### spellboost_target ⚠️

| Signature           | Zone  | Representative Card | Usage Count |
| ------------------- | ----- | ------------------- | ----------- |
| `spellboost_target` | spell | Radiant Rainbow     | 1           |

### summon_destroyed_amulet_highest_base_cost ⚠️

| Signature                                   | Zone              | Representative Card      | Usage Count |
| ------------------------------------------- | ----------------- | ------------------------ | ----------- |
| `summon_destroyed_amulet_highest_base_cost` | keyword:LastWords | Maeve, Guardian of Earth | 1           |

### summon_exact_copy

| Signature                            | Zone        | Representative Card    | Usage Count |
| ------------------------------------ | ----------- | ---------------------- | ----------- |
| `summon_exact_copy(target:selected)` | evolve      | Achim, Lord of Despair | 2           |
| `summon_exact_copy(target:self)`     | superevolve | Congregant of Truth    | 1           |

### summon_named

| Signature                                                   | Zone              | Representative Card                | Usage Count |
| ----------------------------------------------------------- | ----------------- | ---------------------------------- | ----------- |
| `summon_named(count:1,name:Knight)`                         | keyword:LastWords | Royal Coachwoman                   | 5           |
| `summon_named(name:Clay Golem)`                             | spell             | Truth Summons                      | 3           |
| `summon_named(count:1,name:Guardian Golem)`                 | fanfare           | Remi & Rami, Two-Faced Witch       | 5           |
| `summon_named(count:1,name:Vastwing Dragon)`                | keyword:Enhance   | Battleforged Dragon Keeper         | 4           |
| `summon_named(count:2,name:Ghost)`                          | evolve            | Amorous Necromancer                | 3           |
| `summon_named(name:Regal Falcon)`                           | keyword:LastWords | Avian Statue                       | 1           |
| `summon_named(name:Holy Falcon)`                            | keyword:LastWords | Winged Statue                      | 3           |
| `summon_named(count:1,name:Mecha Cavalier)`                 | evolve            | Mecha Cavalier                     | 1           |
| `summon_named(count:2,name:Mecha Cavalier)`                 | superevolve       | Mecha Cavalier                     | 1           |
| `summon_named(count:5,name:Goblin)`                         | spell             | Goblin Foray                       | 1           |
| `summon_named(name:Fairy)`                                  | fanfare           | Capricious Sprite                  | 3           |
| `summon_named(count:3,name:Fairy)`                          | superevolve       | Aria, Lady of the Woods            | 1           |
| `summon_named(name:Steelclad Knight)`                       | fanfare           | Lyrala, Luminous Potionwright      | 2           |
| `summon_named(count:2,name:Hound of War)`                   | keyword:Enhance   | Hound of War                       | 1           |
| `summon_named(count:1,name:Steelclad Knight)`               | spell             | Knightly Rending                   | 1           |
| `summon_named(count:3,name:Steelclad Knight)`               | fanfare           | Luminous Magus                     | 1           |
| `summon_named(count:1,name:Shinobi Squirrel)`               | evolve            | Shinobi Squirrel                   | 2           |
| `summon_named(name:Knight)`                                 | spell             | Ironcrown Majesty                  | 1           |
| `summon_named(count:2,name:Knight)`                         | evolve            | Zirconia, Ironcrown Ward           | 2           |
| `summon_named(count:4,name:Steelclad Knight)`               | fanfare           | Amalia, Luxsteel Paladin           | 1           |
| `summon_named(name:Kagemitsu, Enduring Warrior)`            | keyword:lastwords | Kagemitsu, Enduring Warrior        | 1           |
| `summon_named(name:Magic Sediment)`                         | fanfare           | Apprentice Astrologer              | 2           |
| `summon_named(count:4,name:Magic Sediment)`                 | spell             | Sagelight Teachings                | 1           |
| `summon_named(count:2,name:Magic Sediment)`                 | fanfare           | Penelope, Potions Prodigy          | 3           |
| `summon_named(name:Demonic Shikigami)`                      | spell             | Demonic Call                       | 1           |
| `summon_named(count:1,name:Celestial Shikigami)`            | fanfare           | Kuon, Fivefold Master              | 1           |
| `summon_named(count:1,name:Demonic Shikigami)`              | fanfare           | Kuon, Fivefold Master              | 1           |
| `summon_named(count:1,name:Paper Shikigami)`                | fanfare           | Kuon, Fivefold Master              | 4           |
| `summon_named(count:1,name:Noble Shikigami)`                | keyword:Enhance   | Kuon, Fivefold Master              | 1           |
| `summon_named(count:1,name:Anne's Summoning)`               | fanfare           | Anne & Grea, Mysterian Duo         | 1           |
| `summon_named(count:1,name:Fire Drake Whelp)`               | fanfare           | Little Dragon Nanny                | 3           |
| `summon_named(name:Otohime's Bodyguard)`                    | keyword:Engage    | Fan of Otohime                     | 1           |
| `summon_named(name:Supreme Golden Dragon)`                  | fanfare           | Garyu, Fabled Dragonkin            | 1           |
| `summon_named(name:Supreme Silver Dragon)`                  | fanfare           | Garyu, Fabled Dragonkin            | 1           |
| `summon_named(name:Bat)`                                    | fanfare           | Aryll, Moonstruck Vampire          | 1           |
| `summon_named(count:2,name:Bat)`                            | evolve            | Nameless Demon                     | 3           |
| `summon_named(count:2,name:Skeleton)`                       | keyword:LastWords | Little Miss Bonemancer             | 1           |
| `summon_named(count:1,name:Ghost)`                          | evolve            | Mukan, Shadowcrypt Ward            | 2           |
| `summon_named(count:1,name:Mimi, Right Paw Hellhound)`      | fanfare           | Cerberus, Hellfire Unleashed       | 1           |
| `summon_named(count:1,name:Coco, Left Paw Hellhound)`       | fanfare           | Cerberus, Hellfire Unleashed       | 1           |
| `summon_named(name:Lapis, Shining Seraph)`                  | keyword:lastwords | Lapis, Shining Seraph              | 1           |
| `summon_named(name:Holyflame Tiger)`                        | keyword:LastWords | Pact of the Beast Princess         | 2           |
| `summon_named(count:1,name:Fortifier Artifact)`             | fanfare           | Dirk, Metal Mercenary              | 1           |
| `summon_named(count:2,name:Enhanced Puppet)`                | spell             | Puppet Shield                      | 2           |
| `summon_named(count:1,name:Striker Artifact)`               | evolve            | Rukina, Resistance Leader          | 2           |
| `summon_named(count:3,name:Enhanced Puppet)`                | fanfare           | Liam, Crazed Creator               | 1           |
| `summon_named(name:Lloyd)`                                  | fanfare           | Orchis, Newfound Heart             | 1           |
| `summon_named(count:3,name:Gentle Treant)`                  | spell             | Woodwalkers                        | 1           |
| `summon_named(count:2,name:Baby Carbuncle)`                 | fanfare           | Lionel, Ardent Elf                 | 1           |
| `summon_named(count:2,name:Fairy)`                          | fanfare           | Cynthia, Chivalrous Elf            | 1           |
| `summon_named(count:1,name:Fairy)`                          | fanfare           | Titania, Queen of Fairies          | 1           |
| `summon_named(count:2,name:Steelclad Knight)`               | evolve            | Gildaria, Anathema of Peace        | 2           |
| `summon_named(count:2,name:Onion Patch)`                    | fanfare           | Bergent, Rejected Artes            | 1           |
| `summon_named(count:1,name:Magic Sediment)`                 | fanfare           | Enchanting Perfumer                | 4           |
| `summon_named(count:1,name:Lilanthim, Anathema of Edacity)` | keyword:LastWords | Lilanthim, Anathema of Edacity     | 1           |
| `summon_named(count:1,name:Majestic Megalorca)`             | fanfare           | Call of the Megalorca              | 3           |
| `summon_named(count:2,name:Majestic Megalorca)`             | fanfare           | Seasoned Merman                    | 3           |
| `summon_named(count:2,name:Rotting Zombie)`                 | fanfare           | Undead Soldier                     | 1           |
| `summon_named(count:4,name:One-Tailed Fox)`                 | fanfare           | Ginsetsu & Yuzuki, Twin Calamities | 1           |
| `summon_named(count:2,name:Holy Cavalier)`                  | keyword:LastWords | Wilbert, Desolate Paladin          | 1           |
| `summon_named(name:Striker Artifact)`                       | fanfare           | Engineblade Maven                  | 3           |
| `summon_named(count:1,name:Lloyd)`                          | spell             | Synchronous Hearts                 | 1           |
| `summon_named(count:1,name:Victoria)`                       | spell             | Synchronous Hearts                 | 2           |
| `summon_named(count:1,name:Enhanced Puppet)`                | evolve            | Zwei, Symphonic Heart              | 2           |
| `summon_named(count:1,name:Comrade of the Swordmaster)`     | keyword:LastWords | Comrade of the Swordmaster         | 1           |
| `summon_named(count:1,name:Clay Golem)`                     | spell             | Risky Amalgamation                 | 1           |
| `summon_named(name:Majestic Megalorca)`                     | fanfare           | Ocean Rider                        | 2           |
| `summon_named(name:Congregant of Entwining)`                | fanfare           | Congregant of Entwining            | 4           |
| `summon_named(name:Ominous Artifact γ)`                     | fanfare           | Supersonic Fighter                 | 1           |
| `summon_named(name:White Psalm, New Revelation)`            | spell             | Devastating Soprano                | 4           |
| `summon_named(count:1,name:Rotting Zombie)`                 | keyword:LastWords | Rotting Zombie                     | 1           |
| `summon_named(name:Vier, Heart Slayer)`                     | keyword:LastWords | Doll Slayer                        | 1           |
| `summon_named(count:2,name:Rulenye & Valnareik)`            | spell             | Scream Diffusion                   | 1           |
| `summon_named(name:Black Psalm, New Revelation)`            | keyword:LastWords | White Psalm, New Revelation        | 1           |

### summon_named_enemy

| Signature                                 | Zone    | Representative Card     | Usage Count |
| ----------------------------------------- | ------- | ----------------------- | ----------- |
| `summon_named_enemy(count:2,name:Knight)` | fanfare | Yurius, Levin Authority | 1           |

### summon_random_from_deck ⚠️

| Signature                          | Zone    | Representative Card         | Usage Count |
| ---------------------------------- | ------- | --------------------------- | ----------- |
| `summon_random_from_deck(count:3)` | fanfare | Rodeo, Anathema of Judgment | 2           |
| `summon_random_from_deck(count:1)` | fanfare | Peppy Scout                 | 1           |

### super_evo_gate ⚠️

| Signature                            | Zone    | Representative Card | Usage Count |
| ------------------------------------ | ------- | ------------------- | ----------- |
| `super_evo_gate(has_nested_effects)` | fanfare | Ignominious Samurai | 2           |

### super_evolve_ally ⚠️

| Signature           | Zone        | Representative Card       | Usage Count |
| ------------------- | ----------- | ------------------------- | ----------- |
| `super_evolve_ally` | superevolve | Olivia, Heroic Dark Angel | 1           |

### super_evolve_self

| Signature           | Zone    | Representative Card         | Usage Count |
| ------------------- | ------- | --------------------------- | ----------- |
| `super_evolve_self` | fanfare | Gildaria, Anathema of Peace | 1           |

### super_evolved_allied_gate

| Signature                                       | Zone    | Representative Card | Usage Count |
| ----------------------------------------------- | ------- | ------------------- | ----------- |
| `super_evolved_allied_gate(has_nested_effects)` | fanfare | Twinblade Goblin    | 5           |

### super_evolved_self_gate ⚠️

| Signature                                     | Zone            | Representative Card     | Usage Count |
| --------------------------------------------- | --------------- | ----------------------- | ----------- |
| `super_evolved_self_gate(has_nested_effects)` | trigger:unknown | Ceres, Blue Rose Maiden | 1           |

### transform

| Signature   | Zone   | Representative Card       | Usage Count |
| ----------- | ------ | ------------------------- | ----------- |
| `transform` | evolve | Titania, Queen of Fairies | 3           |

### transform_in_hand

| Signature           | Zone    | Representative Card | Usage Count |
| ------------------- | ------- | ------------------- | ----------- |
| `transform_in_hand` | fanfare | Opulent Rose Queen  | 1           |

### transform_random_spell_in_hand

| Signature                        | Zone    | Representative Card        | Usage Count |
| -------------------------------- | ------- | -------------------------- | ----------- |
| `transform_random_spell_in_hand` | fanfare | Raio, Elimination Manifest | 1           |

### transform_self_if_spellboost_at_least ⚠️

| Signature                               | Zone               | Representative Card | Usage Count |
| --------------------------------------- | ------------------ | ------------------- | ----------- |
| `transform_self_if_spellboost_at_least` | keyword:Spellboost | Homework Time!      | 1           |
