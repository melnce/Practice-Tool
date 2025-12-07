import json
import os
from collections import defaultdict
import re

# Input JSON
json_path = "cards/card_details.json"  # adjust if needed

# Output folder
output_dir = "cards/classes"
os.makedirs(output_dir, exist_ok=True)

with open(json_path, "r", encoding="utf-8") as f:
    all_cards = json.load(f)

by_class = defaultdict(list)

def normalize_class(value):
    # Handle missing/weird values
    if value is None:
        return "Unknown"
    # Some datasets might use list/array; join if so
    if isinstance(value, list):
        value = " & ".join(map(str, value))
    value = str(value).strip()
    return value if value else "Unknown"

for card in all_cards:
    cls = normalize_class(card.get("class"))
    by_class[cls].append(card)

def safe_filename(name: str) -> str:
    # lower, replace spaces with underscores, drop brackets, keep alnum/_/&/-
    name = name.lower().strip()
    name = name.replace("[", "").replace("]", "").replace(" ", "_")
    name = re.sub(r"[^a-z0-9_&-]", "", name)
    return f"{name}_card_details.json"

# Write one file per class
for cls, cards in by_class.items():
    filename = safe_filename(cls)
    path = os.path.join(output_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cards, f, indent=2, ensure_ascii=False)

print(f"Split {len(all_cards)} cards into {len(by_class)} class files in '{output_dir}'.")
for cls, cards in sorted(by_class.items(), key=lambda x: x[0].lower()):
    print(f"- {cls}: {len(cards)}")
