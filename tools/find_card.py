
import json
import os

def find_card(filename, query):
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        print(f"--- Scanning {filename} ({len(data)} items) ---")
        found = False
        for i, card in enumerate(data):
            # card is a dict. We can't strictly map line numbers from JSON object alone easily without a custom parser,
            # but we can find the index and then we can approximate or use exact match if we dump it.
            # Actually, to get line numbers for editing, we usually rely on text search.
            # But first let's just confirm EXISTENCE.
            if query.lower() in card.get('name', '').lower():
                print(f"FOUND matches for '{query}':")
                print(f"Index: {i}")
                print(f"ID: {card.get('id')}")
                print(f"Name: {card.get('name')}")
                print(f"Effects/Keywords: {json.dumps(card.get('keywords', []) + card.get('spell', []) + card.get('fanfare', []))[:100]}...")
                found = True
        
        if not found:
            print(f"NOT FOUND: '{query}'")

    except Exception as e:
        print(f"Error checking {filename}: {e}")

find_card("cards/card_details.json", "Puppet")
find_card("cards/card_details.json", "Enhanced Puppet")
