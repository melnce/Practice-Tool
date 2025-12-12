
import json
import sys

def find(query):
    with open("cards/card_details.json", "r", encoding="utf-8") as f:
        data = json.load(f)
        for card in data:
            if query.lower() in card.get("name", "").lower():
                print(json.dumps(card, indent=2))

if __name__ == "__main__":
    find(sys.argv[1])
