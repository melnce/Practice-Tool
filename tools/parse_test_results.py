
import json
import os

def main():
    if not os.path.exists("test-results.json"):
        print("No test-results.json found")
        return

    with open("test-results.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Total Tests: {data.get('numTotalTestSuites', 0)} suites")
    
    failed_test_files = data.get("testResults", [])
    failed = False

    for result in failed_test_files:
        if result.get("status") == "failed":
            failed = True
            print(f"\nFAIL: {result.get('name')}")
            for assertion in result.get("assertionResults", []):
                if assertion.get("status") == "failed":
                    print(f"  X {assertion.get('title')}")
                    for msg in assertion.get("failureMessages", []):
                        print(f"    ERROR: {msg}")

    if not failed:
        print("\nAll tests passed or no failed suites found (check logic).")

if __name__ == "__main__":
    main()
