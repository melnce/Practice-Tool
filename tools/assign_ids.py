import json
import re
import os

CARD_FILES = [
    "cards/card_details.json",
    "cards/token_details.json"
]

# Start fallback IDs at 99000000 (custom/token range)
FALLBACK_START = 99000000
current_fallback = FALLBACK_START

existing_ids = set()

def extract_id(card):
    # Try URL first: .../10001110-name -> 10001110
    url = card.get("url", "")
    match = re.search(r"(\d{8,})", url)
    if match:
        return match.group(1)
    
    # Try image: .../10001110.webp -> 10001110
    img = card.get("base_image", "")
    match = re.search(r"(\d{8,})", img)
    if match:
        return match.group(1)
        
    return None

def process_file(filepath):
    global current_fallback
    print(f"Processing {filepath}...")
    
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated_count = 0
    skipped_count = 0
    assigned_count = 0

    for i, card in enumerate(data):
        current_id = None
        
        # Determine ID
        if "id" in card and card["id"]:
            current_id = str(card["id"])
            skipped_count += 1
        else:
            # Extract or Fallback
            new_id = extract_id(card)
            if not new_id:
                new_id = str(current_fallback)
                current_fallback += 1
                print(f"Warning: No ID found for '{card.get('name')}', assigning fallback {new_id}")
            current_id = new_id
            updated_count += 1
            
        # Collision check (only for new IDs really, but good to know)
        if current_id not in existing_ids:
             existing_ids.add(current_id)

        # Reconstruct dict to force 'id' to top
        new_card = {"id": current_id}
        for k, v in card.items():
            if k != "id":
                new_card[k] = v
        
        # In-place replace
        data[i] = new_card

    # Save
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(f"  Updated: {updated_count}")
    print(f"  Skipped (Already had ID): {skipped_count}")

def main():
    for f in CARD_FILES:
        process_file(f)
    print("Done.")

if __name__ == "__main__":
    main()
