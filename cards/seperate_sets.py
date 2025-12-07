import json
import os

# Use the correct relative or absolute path
json_path = "cards/card_details.json"  # adjust if needed

with open(json_path, "r", encoding="utf-8") as f:
    all_cards = json.load(f)

output_dir = "cards/card_sets"
os.makedirs(output_dir, exist_ok=True)

sets = {}
for card in all_cards:
    set_name = card.get("set", "Unknown").strip()
    if set_name not in sets:
        sets[set_name] = []
    sets[set_name].append(card)

for set_name, cards in sets.items():
    safe_name = set_name.lower().replace(" ", "_").replace("[", "").replace("]", "")
    filename = f"{safe_name}_card_details.json"
    path = os.path.join(output_dir, filename)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(cards, f, indent=2)

print(f"Split into {len(sets)} files in '{output_dir}' folder.")
