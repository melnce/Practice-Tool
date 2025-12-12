
def find_line(filename, target):
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                if target in line:
                    print(f"{i} | {line.strip()[:20]}")
    except Exception as e:
        print(f"Error: {e}")

find_line("cards/card_details.json", '"name": "Puppet"')
find_line("cards/card_details.json", '"name": "Enhanced Puppet"')
