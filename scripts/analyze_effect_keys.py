#!/usr/bin/env python3
"""Scan cards/sets/*.json for effect object keys grouped by op."""

import json
from collections import defaultdict
from pathlib import Path

SUSPICIOUS = {
    "card_type",
    "type_eq",
    "amount_dynamic",
    "exclude_self",
    "once_per_turn",
    "enabled",
    "target_type",
}

# suspicious key -> ops where it was flagged (for context)
suspicious_hits: dict[str, set[str]] = defaultdict(set)


def collect_keys_from_obj(obj: dict, bucket: set[str]) -> None:
    for k in obj:
        if k != "op":
            bucket.add(k)
            if k in SUSPICIOUS:
                suspicious_hits[k].add(obj.get("op", "<no-op>"))


def collect_nested_keys(obj, field_name: str, bucket: set[str]) -> None:
    if field_name not in obj:
        return
    val = obj[field_name]
    if isinstance(val, dict):
        bucket.update(val.keys())
        for k in val:
            if k in SUSPICIOUS:
                suspicious_hits[k].add(obj.get("op", "<no-op>"))
    elif isinstance(val, list):
        for item in val:
            if isinstance(item, dict):
                bucket.update(item.keys())
                for k in item:
                    if k in SUSPICIOUS:
                        suspicious_hits[k].add(obj.get("op", "<no-op>"))


def walk(node, op_keys: dict[str, set[str]], condition_keys: set[str],
         filter_keys: set[str], filters_keys: set[str]) -> None:
    if isinstance(node, dict):
        if "op" in node and isinstance(node["op"], str):
            op = node["op"]
            if op not in op_keys:
                op_keys[op] = set()
            collect_keys_from_obj(node, op_keys[op])
            collect_nested_keys(node, "condition", condition_keys)
            collect_nested_keys(node, "filter", filter_keys)
            collect_nested_keys(node, "filters", filters_keys)
        for v in node.values():
            walk(v, op_keys, condition_keys, filter_keys, filters_keys)
    elif isinstance(node, list):
        for item in node:
            walk(item, op_keys, condition_keys, filter_keys, filters_keys)


def main() -> None:
    sets_dir = Path(__file__).resolve().parents[1] / "cards" / "sets"
    op_keys: dict[str, set[str]] = {}
    condition_keys: set[str] = set()
    filter_keys: set[str] = set()
    filters_keys: set[str] = set()

    files = sorted(sets_dir.glob("*.json"))
    for path in files:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        walk(data, op_keys, condition_keys, filter_keys, filters_keys)

    print("=" * 72)
    print("1. TOP-LEVEL KEYS BY OP (excluding 'op')")
    print("=" * 72)
    for op in sorted(op_keys):
        keys = sorted(op_keys[op])
        print(f"\n{op} ({len(keys)} keys):")
        print("  " + ", ".join(keys))

    print("\n" + "=" * 72)
    print("2. KEYS IN condition / filter / filters NESTED WITHIN OPS")
    print("=" * 72)
    print(f"\ncondition ({len(condition_keys)} keys):")
    print("  " + (", ".join(sorted(condition_keys)) if condition_keys else "(none)"))
    print(f"\nfilter ({len(filter_keys)} keys):")
    print("  " + (", ".join(sorted(filter_keys)) if filter_keys else "(none)"))
    print(f"\nfilters ({len(filters_keys)} keys):")
    print("  " + (", ".join(sorted(filters_keys)) if filters_keys else "(none)"))

    all_nested = condition_keys | filter_keys | filters_keys
    only_in_one = []
    if condition_keys - filter_keys - filters_keys:
        only_in_one.append(("condition-only", condition_keys - filter_keys - filters_keys))
    if filter_keys - condition_keys - filters_keys:
        only_in_one.append(("filter-only", filter_keys - condition_keys - filters_keys))
    if filters_keys - condition_keys - filter_keys:
        only_in_one.append(("filters-only", filters_keys - condition_keys - filter_keys))
    if only_in_one:
        print("\nKeys unique to one nested field type:")
        for label, keys in only_in_one:
            print(f"  {label}: {', '.join(sorted(keys))}")

    print("\n" + "=" * 72)
    print("3. SUSPICIOUS KEYS FOUND IN CARD DATA")
    print("=" * 72)
    found_any = False
    for key in sorted(SUSPICIOUS):
        ops = suspicious_hits.get(key, set())
        if ops:
            found_any = True
            print(f"\n  {key}: found on ops {sorted(ops)}")
        else:
            print(f"\n  {key}: NOT FOUND in card data")
    if not found_any:
        print("\n  (none of the flagged keys appear in card data)")

    # Also report suspicious keys anywhere in op top-level keys
    print("\n" + "-" * 72)
    print("Suspicious keys as top-level op fields (by op):")
    for op in sorted(op_keys):
        sus = sorted(op_keys[op] & SUSPICIOUS)
        if sus:
            print(f"  {op}: {', '.join(sus)}")


if __name__ == "__main__":
    main()
