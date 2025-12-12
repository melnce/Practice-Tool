
import json
import os

try:
    with open("test-results.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    for result in data.get("testResults", []):
        if result.get("status") == "failed":
            print(f"FAIL FILE: {result.get('name')}")
            if result.get("message"):
                print(f"  MSG: {result.get('message')}")
            for assertion in result.get("assertionResults", []):
                if assertion.get("status") == "failed":
                    print(f"  TEST: {assertion.get('title')}")
                    for msg in assertion.get("failureMessages", []):
                        print(f"    MSG: {msg}")
except Exception as e:
    print(f"Error parsing: {e}")
