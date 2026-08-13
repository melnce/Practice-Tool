#!/usr/bin/env python3
"""Author round-4 unlocked cards into set JSON files (faithful ops only)."""
from __future__ import annotations

import json
from pathlib import Path

SETS = Path("cards/sets")
PATCHES: dict[str, dict] = {}


def P(cid: str, **fields) -> None:
    PATCHES[cid] = fields


def engage(effects: list, cost: int = 1) -> dict:
    return {"name": "Engage", "cost": cost, "effects": effects}


def countdown(n: int) -> dict:
    return {"name": "countdown", "count": n}


def last_words(effects: list) -> dict:
    return {"name": "LastWords", "effects": effects}


# ---------------------------------------------------------------------------
# 10503210 World of Games
# ---------------------------------------------------------------------------
P(
    "10503210",
    keywords=[
        countdown(5),
        last_words([{"op": "draw", "source": "deck", "count": 2}]),
    ],
    triggers=[
        {
            "event": "ally_card_played",
            "source": "board",
            "condition": {
                "not_self": True,
                "field_other_same_base_cost": True,
            },
            "effects": [
                {
                    "op": "countdown",
                    "action": "advance",
                    "target": "self",
                    "amount": 1,
                }
            ],
        }
    ],
    fanfare=[],
)

# ---------------------------------------------------------------------------
# 10533310 Grandeur of the Dawnblossom
# ---------------------------------------------------------------------------
P(
    "10533310",
    spell=[
        {
            "op": "transform",
            "target": "ally:follower",
            "distribution": "all",
            "into_source": {
                "zone": "ally:deck",
                "filter": {"type": "Follower"},
                "pick": "random",
                "per_target": True,
            },
        }
    ],
)

# ---------------------------------------------------------------------------
# 10543110 Ruinbringer
# ---------------------------------------------------------------------------
P(
    "10543110",
    fanfare=[],
    evolve=[],
    triggers=[],
    keywords=[],
    superevolve=[
        {
            "op": "banish",
            "target": "ally:deck",
            "distribution": "all",
            "filters": {"cost_in": [1, 3, 5, 7, 9]},
            "store_count_as": "banish_count",
        },
        {
            "op": "damage",
            "target": "enemy:follower",
            "distribution": "split_sequential",
            "amount_source": "context.banish_count",
        },
    ],
)

# ---------------------------------------------------------------------------
# 10554110 Milteo & Luzen
# ---------------------------------------------------------------------------
MILTEO_CREST = {
    "op": "crest",
    "action": "gain",
    "name": "Milteo & Luzen",
    "image": "https://static.dotgg.gg/shadowverse/cards/10554110_token.webp",
    "description": (
        "Allied followers' Fanfare and Enhance abilities don't activate.\n"
        "Whenever you play a follower, evolve it."
    ),
    "passives": ["suppress_fanfare_enhance"],
    "triggers": [
        {
            "event": "ally_follower_played",
            "effects": [{"op": "evolve", "target": "played_card", "mode": "normal"}],
        }
    ],
}

P(
    "10554110",
    fanfare=[
        {"op": "summon", "source": "graveyard", "max_cost": 4},
        {"op": "summon", "source": "graveyard", "max_cost": 2},
    ],
    evolve=[
        {
            "op": "destroy",
            "target": "all:follower",
            "distribution": "random",
            "count": 6,
            "exclude": ["context.sourceCard"],
        }
    ],
    superevolve=[MILTEO_CREST],
    keywords=[],
    triggers=[],
)

# ---------------------------------------------------------------------------
# 10554120 Shakdoh, Nightblossom
# ---------------------------------------------------------------------------
SHAKDOH_CYCLE = [
    {
        "op": "return",
        "destination": "deck",
        "select": "all",
        "target": "ally:hand",
    },
    {"op": "draw", "source": "deck", "count": "{last_returned}"},
    {
        "op": "gate",
        "condition": "hand_same_cost_gte",
        "count": 4,
        "effects": [
            {
                "op": "damage",
                "target": "enemy:any",
                "amount": 4,
                "distribution": "all",
            }
        ],
    },
]

P(
    "10554120",
    fanfare=[
        {
            "op": "repeat_effect",
            "count": 2,
            "effects": SHAKDOH_CYCLE,
        }
    ],
    superevolve=[{"op": "replicate", "zone": "fanfare"}],
    evolve=[],
    keywords=[],
    triggers=[],
)

# ---------------------------------------------------------------------------
# 10564120 Kukishiro, Mistbloom
# ---------------------------------------------------------------------------
FOX_OR_FALCON = {
    "op": "mode",
    "pick": "random",
    "select_count": 1,
    "options": [
        {
            "label": "Fox of Purity",
            "effects": [
                {
                    "op": "summon",
                    "source": "named",
                    "name": "Fox of Purity",
                    "count": 1,
                }
            ],
        },
        {
            "label": "Holy Falcon",
            "effects": [
                {
                    "op": "summon",
                    "source": "named",
                    "name": "Holy Falcon",
                    "count": 1,
                }
            ],
        },
    ],
}

FOX_OR_FALCON_ENEMY = {
    "op": "mode",
    "pick": "random",
    "select_count": 1,
    "options": [
        {
            "label": "Enemy Fox of Purity",
            "effects": [
                {
                    "op": "summon",
                    "source": "named",
                    "name": "Fox of Purity",
                    "count": 1,
                    "owner": "enemy",
                }
            ],
        },
        {
            "label": "Enemy Holy Falcon",
            "effects": [
                {
                    "op": "summon",
                    "source": "named",
                    "name": "Holy Falcon",
                    "count": 1,
                    "owner": "enemy",
                }
            ],
        },
    ],
}

KUKISHIRO_CREST = {
    "op": "crest",
    "action": "gain",
    "name": "Kukishiro, Mistbloom",
    "image": "https://static.dotgg.gg/shadowverse/cards/10564120_token.webp",
    "description": (
        "During your turn, whenever you draw a 1-, 3-, or 5-cost card, "
        "summon a Fox of Purity or Holy Falcon at random.\n"
        "During your turn, whenever you draw a 2-, 4-, or 6-cost card, "
        "summon an enemy Fox of Purity or Holy Falcon at random."
    ),
    "triggers": [
        {
            "event": "ally_draw",
            "condition": {
                "whose_turn": "owner",
                "cost_in": [1, 3, 5],
            },
            "effects": [FOX_OR_FALCON],
        },
        {
            "event": "ally_draw",
            "condition": {
                "whose_turn": "owner",
                "cost_in": [2, 4, 6],
            },
            "effects": [FOX_OR_FALCON_ENEMY],
        },
    ],
}

P(
    "10564120",
    keywords=["Rush"],
    fanfare=[
        KUKISHIRO_CREST,
        {
            "op": "return",
            "destination": "deck",
            "target": "ally:hand",
            "select": 2,
            "select_mode": "random",
        },
        {"op": "draw", "source": "deck", "count": 2},
    ],
    evolve=[],
    superevolve=[],
    triggers=[],
)

# ---------------------------------------------------------------------------
# 10574120 Imari, Dewdrop
# ---------------------------------------------------------------------------
P(
    "10574120",
    fanfare=[
        {"op": "discard", "mode": "select", "count": 1},
        {
            "op": "draw",
            "source": "deck",
            "count": 1,
            "filters": {"type": "Spell"},
        },
    ],
    triggers=[
        {
            "event": "ally_spell_played",
            "source": "board",
            "effects": [
                {
                    "op": "gate",
                    "condition": "evolved_self",
                    "effects": [
                        {
                            "op": "summon",
                            "source": "named",
                            "name": "Imari's Little Buddies",
                            "count": 1,
                        }
                    ],
                }
            ],
        }
    ],
    evolve=[],
    keywords=[],
    superevolve=[
        {
            "op": "draw",
            "source": "deck",
            "count": 2,
            "filters": {"type": "Spell", "cost_eq": 1},
            "distinct_by": "name",
        }
    ],
)

# ---------------------------------------------------------------------------
# 10663210 Sublime Eld Tome
# ---------------------------------------------------------------------------
P(
    "10663210",
    fanfare=[
        {
            "op": "select",
            "target": "any:any",
            "select": 1,
            "condition": {"not_self": True},
            "effects": [
                {"op": "destroy", "target": "selected"},
                {
                    "op": "gate",
                    "condition": "selected_matches",
                    "type": "Amulet",
                    "is_ally": True,
                    "effects": [
                        {
                            "op": "pp",
                            "action": "recover",
                            "player": "self",
                            "amount": 2,
                        }
                    ],
                },
            ],
        }
    ],
    keywords=[
        countdown(2),
        last_words(
            [
                {
                    "op": "summon",
                    "source": "destroyed_match",
                    "count": 1,
                    "filter": {
                        "type": "Amulet",
                        "hasLastWords": True,
                        "base_cost_lte": 2,
                    },
                    "distribution": "random",
                }
            ]
        ),
    ],
    triggers=[],
    evolve=[],
    superevolve=[],
)

# ---------------------------------------------------------------------------
# 10664110 Kandima, Sublime Hatred
# ---------------------------------------------------------------------------
P(
    "10664110",
    fanfare=[
        {
            "op": "summon",
            "source": "destroyed_match",
            "count": 2,
            "filter": {
                "type": "Amulet",
                "hasLastWords": True,
                "base_cost_lte": 2,
            },
            "distinct_by": "name",
            "distribution": "random",
        }
    ],
    evolve=[],
    keywords=[],
    triggers=[],
    superevolve=[
        {
            "op": "select",
            "target": "any:any",
            "select": 1,
            "condition": {"not_self": True},
            "effects": [
                {"op": "destroy", "target": "selected"},
                {
                    "op": "gate",
                    "condition": "selected_matches",
                    "type": "Amulet",
                    "is_ally": True,
                    "effects": [
                        {
                            "op": "damage",
                            "target": "enemy:follower",
                            "amount": 3,
                            "distribution": "all",
                        }
                    ],
                },
            ],
        }
    ],
)

# ---------------------------------------------------------------------------
# 10703210 City of Babelon
# ---------------------------------------------------------------------------
P(
    "10703210",
    keywords=[
        countdown(1),
        engage(
            [
                {"op": "discard", "mode": "select", "count": 1},
                {
                    "op": "countdown",
                    "action": "delay",
                    "target": "self",
                    "amount": 1,
                },
            ],
            cost=1,
        ),
    ],
    triggers=[
        {
            "type": "end_of_turn_own",
            "source": "board",
            "effects": [
                {
                    "op": "sequence",
                    "key": "babelon",
                    "advance": True,
                    "steps": [
                        {
                            "effects": [
                                {
                                    "op": "damage",
                                    "target": "enemy:follower",
                                    "amount": 2,
                                    "count": 1,
                                    "distribution": "random_hits",
                                }
                            ]
                        },
                        {
                            "effects": [
                                {
                                    "op": "restore",
                                    "target": "leader",
                                    "player": "self",
                                    "amount": 2,
                                }
                            ]
                        },
                        {
                            "effects": [
                                {
                                    "op": "damage",
                                    "target": "enemy:leader",
                                    "amount": 2,
                                },
                                {"op": "destroy", "scope": "self"},
                            ]
                        },
                    ],
                }
            ],
        }
    ],
    fanfare=[],
)

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
