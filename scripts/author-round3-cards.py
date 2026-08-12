#!/usr/bin/env python3
"""Author round-3 unlocked cards into set JSON files (faithful ops only)."""
from __future__ import annotations

import json
from pathlib import Path

SETS = Path("cards/sets")
PATCHES: dict[str, dict] = {}


def P(cid: str, **fields) -> None:
    PATCHES[cid] = fields


def engage(effects: list) -> dict:
    return {"name": "Engage", "sacrifice": True, "effects": effects}


# --- Engage amulets (Spell → Amulet data fix) ---
P(
    "10562210",
    type="Amulet",
    attack="0",
    defense="0",
    fanfare=[],
    spell=[],
    keywords=[engage([{"op": "draw", "source": "deck", "count": "{ward_allies}"}])],
)

P(
    "10563210",
    type="Amulet",
    attack="0",
    defense="0",
    fanfare=[{"op": "damage", "target": "enemy:follower", "select": 1, "amount": 5}],
    spell=[],
    keywords=[
        engage(
            [
                {
                    "op": "return",
                    "destination": "deck",
                    "target": "ally:hand",
                    "select": 2,
                    "select_mode": "random",
                },
                {"op": "draw", "source": "deck", "count": 2},
            ]
        )
    ],
)

P(
    "10761210",
    type="Amulet",
    attack="0",
    defense="0",
    fanfare=[
        {"op": "return", "destination": "deck", "select": 1, "target": "ally:hand"},
        {"op": "draw", "source": "deck", "count": 1},
    ],
    spell=[],
    keywords=[engage([{"op": "replicate", "zone": "fanfare"}])],
)

P(
    "10762210",
    type="Amulet",
    attack="0",
    defense="0",
    fanfare=[],
    spell=[],
    keywords=[
        {
            "name": "Enhance",
            "cost": 4,
            "effects": [
                {
                    "op": "damage",
                    "target": "enemy:follower",
                    "amount": 1,
                    "distribution": "all",
                }
            ],
        },
        engage(
            [
                {
                    "op": "damage",
                    "target": "enemy:follower",
                    "amount": 1,
                    "distribution": "all",
                }
            ]
        ),
    ],
)

P(
    "10763210",
    type="Amulet",
    attack="0",
    defense="0",
    fanfare=[{"op": "damage", "target": "enemy:follower", "select": 1, "amount": 4}],
    spell=[],
    keywords=[
        engage([{"op": "damage", "target": "enemy:follower", "select": 1, "amount": 2}])
    ],
)

# --- Eld Blades ---
P(
    "10641310",
    spell=[
        {
            "op": "stat",
            "action": "give",
            "target": "ally:follower",
            "select": 1,
            "attack": 2,
            "defense": 2,
        }
    ],
    on_discard=[
        {
            "op": "gate",
            "condition": "self_cost",
            "cost": 4,
            "effects": [
                {"op": "add_to_hand", "name": "Advent of the Eld Blades", "count": 1},
                {
                    "op": "cost",
                    "target": "last_added_to_hand",
                    "mode": "set",
                    "amount": 2,
                },
            ],
        }
    ],
)

P(
    "10643310",
    spell=[
        {
            "op": "damage",
            "target": "enemy:follower",
            "distribution": "all",
            "amount": "{self.cost}",
        }
    ],
    on_discard=[
        {
            "op": "gate",
            "condition": "self_cost",
            "cost": 7,
            "effects": [
                {"op": "add_to_hand", "name": "Beheading Eld Blades", "count": 1},
                {
                    "op": "cost",
                    "target": "last_added_to_hand",
                    "mode": "set",
                    "amount": 5,
                },
            ],
        },
        {
            "op": "gate",
            "condition": "self_cost",
            "cost": 5,
            "effects": [
                {"op": "add_to_hand", "name": "Beheading Eld Blades", "count": 1},
                {
                    "op": "cost",
                    "target": "last_added_to_hand",
                    "mode": "set",
                    "amount": 3,
                },
            ],
        },
    ],
)

# --- Simple / gate / amount ---
P(
    "10501110",
    fanfare=[
        {
            "op": "gate",
            "condition": "field_matches",
            "type": "Card",
            "base_cost_eq": 1,
            "count": 1,
            "exclude_self": True,
            "effects": [
                {
                    "op": "stat",
                    "action": "give",
                    "target": "self",
                    "attack": 1,
                    "defense": 1,
                }
            ],
        }
    ],
)

P(
    "10521110",
    fanfare=[
        {"op": "discard", "mode": "select", "count": 1},
        {
            "op": "gate",
            "condition": "last_discarded_type",
            "type": "Spell",
            "effects": [
                {"op": "restore", "target": "leader", "player": "self", "amount": 6}
            ],
            "else_effects": [
                {"op": "restore", "target": "leader", "player": "self", "amount": 3}
            ],
        },
    ],
)

P(
    "10521310",
    spell=[
        {"op": "discard", "mode": "select", "count": 1, "filter": {"type": "Spell"}},
        {
            "op": "damage",
            "target": "enemy:follower",
            "amount": 3,
            "count": 1,
            "distribution": "random_hits",
        },
        {
            "op": "damage",
            "target": "enemy:follower",
            "amount": 3,
            "count": 1,
            "distribution": "random_hits",
        },
    ],
)

P(
    "10542310",
    spell=[
        {
            "op": "damage",
            "target": "all:follower",
            "amount_source": "followers_on_field",
        }
    ],
)

P(
    "10561310",
    spell=[
        {
            "op": "return",
            "destination": "deck",
            "target": "ally:hand",
            "select": 1,
            "select_mode": "random",
        },
        {"op": "draw", "source": "deck", "count": 3},
    ],
)

P(
    "10573110",
    fanfare=[{"op": "pp", "action": "recover", "amount_source": "other_allies"}],
    keywords=[
        "Rush",
        {
            "name": "LastWords",
            "effects": [{"op": "draw", "source": "deck", "count": 2}],
        },
    ],
)

P(
    "10654110",
    keywords=["Aura", "cant_be_destroyed"],
    triggers=[
        {
            "event": "clash",
            "source": "board",
            "effects": [{"op": "destroy", "target": "clash_opponent"}],
        }
    ],
    superevolve=[{"op": "attacks_per_turn", "target": "self", "amount": 3}],
)

P("10851110", keywords=["Storm", "Ignores Ward"])

P(
    "10822310",
    spell=[
        {
            "op": "stat",
            "action": "give",
            "target": "enemy:follower",
            "attack": -10,
            "defense": -10,
            "distribution": "highest",
            "stat": "attack",
            "pick": "random",
            "select": 1,
        }
    ],
    keywords=[
        {
            "name": "Enhance",
            "cost": 6,
            "effects": [
                {"op": "summon", "source": "named", "name": "Wretch", "count": 3}
            ],
        }
    ],
)

P(
    "10832320",
    spell=[
        {
            "op": "damage",
            "target": "enemy:follower",
            "amount": 8,
            "distribution": "by_stat",
            "stat": "attack",
            "pick": "random",
        },
        {"op": "damage", "target": "enemy:leader", "amount": 2},
        {
            "op": "earth_rite",
            "cost": 2,
            "effects": [
                {"op": "add_to_hand", "name": "Earth-Shattering Bolt", "count": 1}
            ],
        },
    ],
)

P(
    "10541310",
    spell=[
        {"op": "search", "count": 1, "filter": {"type": "Follower"}},
        {
            "op": "damage",
            "target": "enemy:follower",
            "amount": "{last_drawn_cost}",
            "count": 1,
            "distribution": "random_hits",
        },
    ],
)

P(
    "10552310",
    spell=[
        {
            "op": "damage",
            "target": "all:leader",
            "amount": 3,
            "distribution": "by_stat",
            "stat": "defense",
            "rank": "lowest",
        }
    ],
)

P(
    "10823310",
    spell=[
        {
            "op": "mode",
            "activate_all_if_ally_board_gte": 2,
            "options": [
                {
                    "label": "Deal 4 damage to a random enemy follower",
                    "effects": [
                        {
                            "op": "damage",
                            "target": "enemy:follower",
                            "amount": 4,
                            "count": 1,
                            "distribution": "random_hits",
                        }
                    ],
                },
                {
                    "label": "Restore 2 defense to your leader",
                    "effects": [
                        {
                            "op": "restore",
                            "target": "leader",
                            "player": "self",
                            "amount": 2,
                        }
                    ],
                },
            ],
        }
    ],
)

P(
    "10731310",
    spell=[
        {"op": "draw", "source": "deck", "count": 2},
        {"op": "summon", "source": "named", "name": "Magic Sediment", "count": 1},
    ],
    triggers=[
        {
            "event": "ally_earth_rite",
            "source": "hand",
            "effects": [
                {"op": "cost", "mode": "reduce", "target": "self", "amount": 1}
            ],
        }
    ],
)

P(
    "10733310",
    spell=[
        {"op": "destroy", "target": "enemy:follower", "select": 1},
        {"op": "summon", "source": "named", "name": "Magic Sediment", "count": 2},
    ],
    triggers=[
        {
            "event": "ally_earth_rite",
            "source": "hand",
            "effects": [
                {"op": "cost", "mode": "reduce", "target": "self", "amount": 1}
            ],
        }
    ],
)

P(
    "10561120",
    keywords=[
        {
            "name": "Enhance",
            "cost": 4,
            "effects": [
                {"op": "draw", "source": "deck", "count": 1},
                {
                    "op": "keyword",
                    "action": "grant",
                    "target": "self",
                    "keywords": ["Bane"],
                },
            ],
        }
    ],
    triggers=[
        {
            "event": "ally_draw",
            "source": "board",
            "effects": [
                {
                    "op": "keyword",
                    "action": "grant",
                    "target": "self",
                    "keywords": ["Rush"],
                }
            ],
        }
    ],
)

P(
    "10562120",
    fanfare=[{"op": "draw", "source": "deck", "count": 1}],
    evolve=[{"op": "replicate", "zone": "fanfare"}],
    triggers=[
        {
            "event": "ally_draw",
            "source": "board",
            "effects": [
                {
                    "op": "damage",
                    "target": "enemy:follower",
                    "amount": 1,
                    "distribution": "all",
                }
            ],
        }
    ],
)

P(
    "10522110",
    fanfare=[
        {"op": "draw", "source": "deck", "count": 1},
        {"op": "restore", "target": "leader", "player": "self", "amount": 3},
    ],
    keywords=["Rush"],
    triggers=[
        {
            "event": "when_drawn",
            "source": "hand",
            "effects": [
                {
                    "op": "cost",
                    "mode": "set",
                    "target": "self",
                    "amount": 3,
                    "until_eot": True,
                }
            ],
        }
    ],
)

P(
    "10803110",
    fanfare=[
        {
            "op": "add_to_hand",
            "source": "destroyed_match",
            "count": 1,
            "filter": {"type": "Follower"},
            "distribution": "random",
        }
    ],
    evolve=[{"op": "replicate", "zone": "fanfare"}],
)

P(
    "10871130",
    fanfare=[
        {
            "op": "add_to_hand",
            "source": "destroyed_match",
            "count": 1,
            "filter": {"type": "Follower", "tribe": "Artifact"},
            "distribution": "random",
        }
    ],
)

P(
    "10572310",
    spell=[
        {"op": "discard", "mode": "select", "count": 1},
        {
            "op": "add_to_hand",
            "source": "destroyed_match",
            "count": 2,
            "filter": {"type": "Follower"},
            "distinct_by": "name",
            "distribution": "random",
        },
    ],
)

P(
    "10532310",
    spell=[
        {
            "op": "earth_rite",
            "cost": 2,
            "effects": [
                {
                    "op": "mode",
                    "pick": "random",
                    "select_count": 2,
                    "options": [
                        {
                            "label": "Summon a Clay Golem",
                            "effects": [
                                {
                                    "op": "summon",
                                    "source": "named",
                                    "name": "Clay Golem",
                                    "count": 1,
                                }
                            ],
                        },
                        {
                            "label": "Restore 2 defense to your leader",
                            "effects": [
                                {
                                    "op": "restore",
                                    "target": "leader",
                                    "player": "self",
                                    "amount": 2,
                                }
                            ],
                        },
                        {
                            "label": "Gain 3 earth sigils",
                            "effects": [
                                {
                                    "op": "summon",
                                    "source": "named",
                                    "name": "Magic Sediment",
                                    "count": 3,
                                }
                            ],
                        },
                    ],
                }
            ],
        }
    ],
)

P(
    "10603110",
    fanfare=[
        {
            "op": "keyword",
            "action": "grant",
            "target": "self",
            "pick": "random",
            "count": 3,
            "keywords": ["Storm", "Bane", "Intimidate", "Drain", "Aura", "Barrier"],
        }
    ],
)

P(
    "10604110",
    fanfare=[
        {
            "op": "mode",
            "pick": "random",
            "select_count": 2,
            "options": [
                {
                    "label": "Destroy a random enemy follower",
                    "effects": [
                        {
                            "op": "destroy",
                            "target": "enemy:follower",
                            "distribution": "random",
                            "count": 1,
                        }
                    ],
                },
                {
                    "label": "Deal 2 damage to the enemy leader",
                    "effects": [
                        {"op": "damage", "target": "enemy:leader", "amount": 2}
                    ],
                },
                {
                    "label": "Recover 2 play points",
                    "effects": [{"op": "pp", "action": "recover", "amount": 2}],
                },
                {
                    "label": "Give this follower +4/+4 and activate its Fanfare ability",
                    "effects": [
                        {
                            "op": "stat",
                            "action": "give",
                            "target": "self",
                            "attack": 4,
                            "defense": 4,
                        },
                        {"op": "replicate", "zone": "fanfare"},
                    ],
                },
            ],
        }
    ],
    superevolve=[{"op": "replicate", "zone": "fanfare"}],
)

P(
    "10811110",
    fanfare=[
        {
            "op": "destroy",
            "target": "enemy:follower",
            "distribution": "random",
            "count": "{enemy_minus_ally_followers}",
        }
    ],
)

P(
    "10603210",
    keywords=[{"name": "Countdown", "turns": 2}],
    triggers=[
        {
            "event": "end_of_turn",
            "source": "board",
            "effects": [
                {
                    "op": "damage",
                    "target": "all:follower",
                    "amount": 2,
                    "condition": {"exclude_tribe": "Encroacher"},
                }
            ],
        }
    ],
)

P(
    "10553110",
    fanfare=[
        {
            "op": "transform",
            "target": "all:follower",
            "distribution": "all",
            "exclude_self": True,
            "into": "Skeleton",
        }
    ],
    evolve=[
        {
            "op": "damage",
            "target": "all:follower",
            "exclude_self": True,
            "amount": 1,
            "condition": {"not_self": True},
        }
    ],
    triggers=[
        {
            "event": "ally_follower_leaves_field",
            "source": "board",
            "condition": {"name": "Skeleton"},
            "effects": [
                {"op": "restore", "target": "leader", "player": "self", "amount": 1}
            ],
        }
    ],
)

P(
    "10741310",
    spell=[
        {"op": "pp", "action": "gain_max", "amount": 1},
        {
            "op": "transform",
            "target": "ally:hand",
            "filter": {"name": "Apathetic Gaze"},
            "into": "Lazing Flame",
        },
        {
            "op": "transform",
            "target": "ally:deck",
            "filter": {"name": "Apathetic Gaze"},
            "into": "Lazing Flame",
        },
    ],
)

P(
    "10804110",
    fanfare=[
        {
            "op": "mode",
            "options": [
                {
                    "label": "Banish all other followers from the field",
                    "effects": [
                        {
                            "op": "banish",
                            "target": "all:follower",
                            "distribution": "all",
                            "condition": {"not_self": True},
                        }
                    ],
                },
                {
                    "label": "Banish all amulets from the field",
                    "effects": [
                        {
                            "op": "banish",
                            "target": "all:amulet",
                            "distribution": "all",
                        }
                    ],
                },
                {
                    "label": "Banish all crests",
                    "effects": [
                        {"op": "crest", "action": "banish_all", "player": "all"}
                    ],
                },
            ],
        }
    ],
)

# --- Crests ---
P(
    "10553310",
    spell=[
        {
            "op": "crest",
            "action": "gain",
            "name": "Rigor of the Nightblossom",
            "image": "images/crests/rigor_of_the_nightblossom.png",
            "description": "Countdown (2)\nAt the end of your turn, draw a card. Then, if you have at least 4 cards with the same cost in your hand, summon a Skeleton and give it Ward.",
            "countdown": 2,
            "triggers": [
                {
                    "event": "end_of_turn",
                    "effects": [
                        {"op": "draw", "source": "deck", "count": 1},
                        {
                            "op": "gate",
                            "condition": "hand_same_cost_gte",
                            "count": 4,
                            "effects": [
                                {
                                    "op": "summon",
                                    "source": "named",
                                    "name": "Skeleton",
                                    "count": 1,
                                    "keywords": ["Ward"],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
    ],
)

P(
    "10622310",
    spell=[
        {
            "op": "crest",
            "action": "gain",
            "name": "Majestic Conquest",
            "image": "images/crests/majestic_conquest.png",
            "description": "Countdown (2)\nWhenever you play an Enhanced card, summon a Fearless Soldier.",
            "countdown": 2,
            "triggers": [
                {
                    "event": "enhanced_play",
                    "effects": [
                        {
                            "op": "summon",
                            "source": "named",
                            "name": "Fearless Soldier",
                            "count": 1,
                        }
                    ],
                }
            ],
        }
    ],
    keywords=[
        {
            "name": "Enhance",
            "cost": 3,
            "effects": [
                {
                    "op": "crest",
                    "action": "delay_countdown",
                    "name": "Majestic Conquest",
                    "amount": 2,
                }
            ],
        }
    ],
)

P(
    "10544120",
    fanfare=[
        {
            "op": "summon",
            "source": "named",
            "name": "Majestic Megalorca",
            "count": 1,
        }
    ],
    evolve=[
        {"op": "discard", "mode": "select", "count": 1},
        {
            "op": "crest",
            "action": "gain",
            "name": "Yube, Crestpetal",
            "image": "images/crests/yube_crestpetal.png",
            "description": "Whenever an allied Marine follower attacks, give it +1/+0 until the end of the turn and, once on each of your turns, add a Majestic Megalorca to your hand.",
            "triggers": [
                {
                    "event": "ally_follower_attacked",
                    "condition": {"tribe": "Marine"},
                    "effects": [
                        {
                            "op": "stat",
                            "action": "give",
                            "target": "attacker",
                            "attack": 1,
                            "defense": 0,
                            "until_eot": True,
                        }
                    ],
                },
                {
                    "event": "ally_follower_attacked",
                    "condition": {"tribe": "Marine"},
                    "once_per_turn": True,
                    "effects": [
                        {
                            "op": "add_to_hand",
                            "name": "Majestic Megalorca",
                            "count": 1,
                        }
                    ],
                },
            ],
        },
    ],
)

P(
    "10634110",
    fanfare=[
        {"op": "summon", "source": "named", "name": "Crystalspawn", "count": 2}
    ],
    keywords=["Drain"],
    superevolve=[
        {
            "op": "crest",
            "action": "gain",
            "name": "Shymm, Love Bewitched",
            "image": "images/crests/shymm_love_bewitched.png",
            "description": "Whenever an allied Crystalspawn attacks, give it +1/+0.",
            "triggers": [
                {
                    "event": "ally_follower_attacked",
                    "condition": {"name": "Crystalspawn"},
                    "effects": [
                        {
                            "op": "stat",
                            "action": "give",
                            "target": "attacker",
                            "attack": 1,
                            "defense": 0,
                        }
                    ],
                }
            ],
        }
    ],
)

P(
    "10704110",
    triggers=[
        {
            "event": "follower_strike",
            "source": "board",
            "effects": [
                {
                    "op": "keyword",
                    "action": "grant",
                    "target": "self",
                    "keywords": ["Barrier"],
                },
                {
                    "op": "keyword",
                    "action": "grant",
                    "target": "clash_opponent",
                    "keywords": ["cant_attack"],
                },
                {
                    "op": "keyword",
                    "action": "grant_trigger",
                    "target": "clash_opponent",
                    "triggers": [
                        {
                            "event": "end_of_turn",
                            "source": "board",
                            "effects": [{"op": "banish", "scope": "self"}],
                        }
                    ],
                },
            ],
        }
    ],
    keywords=[
        {
            "name": "LastWords",
            "effects": [
                {
                    "op": "crest",
                    "action": "gain",
                    "name": "Illamrita, Designated Target",
                    "image": "images/crests/illamrita_designated_target.png",
                    "description": "Countdown (2)\nLast Words: Summon an Illamrita, Designated Target and evolve it.",
                    "countdown": 2,
                    "keywords": ["Last Words"],
                    "effects": [
                        {
                            "op": "summon",
                            "source": "named",
                            "name": "Illamrita, Designated Target",
                            "count": 1,
                            "evolve_summons": True,
                        }
                    ],
                }
            ],
        }
    ],
)

# Thestae deferred: crest needs ally:deck buff capability (owner question / later).

# Apply
applied = []
for path in sorted(SETS.glob("*.json")):
    data = json.loads(path.read_text())
    changed = False
    for card in data:
        cid = card.get("id")
        if cid not in PATCHES:
            continue
        for k, v in PATCHES[cid].items():
            card[k] = v
        for root in (
            "fanfare",
            "spell",
            "evolve",
            "superevolve",
            "triggers",
            "keywords",
        ):
            if root not in card:
                card[root] = []
        applied.append((cid, card.get("name"), path.name))
        changed = True
    if changed:
        path.write_text(json.dumps(data, indent=2) + "\n")

print(f"Patched {len(applied)} cards:")
for cid, name, fn in applied:
    print(f"  {cid} {name} ({fn})")
