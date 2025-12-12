
import os
import re

ROOT = r"c:\Projects\Practice Tool\src"

# Matches relative imports: from "./..." or import "./..."
# Captures the path in group 1.
# Handles:
# import ... from "./foo"
# import "./foo"
# export ... from "./foo"
# import("./foo")
# Groups:
# 1: import/export/from/import(
# 2: quote
# 3: path (must start with . or ..)
# 4: quote
PATTERN = re.compile(r'(from\s+|import\s+|import\()(["\'])(\.{1,2}/[^"\']+)("|\')')

def fix_file(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    def replacer(match):
        prefix = match.group(1)
        quote = match.group(2)
        import_path = match.group(3)
        end_quote = match.group(4)
        
        # Don't double add
        if import_path.endswith(".js"):
            return match.group(0)
        
        # Skip if it involves .json? usually browsers can't import json without assert, 
        # but user specifically asked for .js extensions on imports.
        # Boot.ts has some JSON logic but imports are "import ... from ...".
        
        if import_path.endswith(".json"):
             # User probably keeps .json? Standard ESM needs import assertions for json.
             # But let's assume TS handles the import, and we want "foo.json" -> "foo.json" NOT "foo.json.js"
             return match.group(0)
        
        # Determine strict replacement
        # "foo/bar" -> "foo/bar.js"
        # "foo" -> "foo.js" (if relative)
        
        new_path = import_path + ".js"
        return f'{prefix}{quote}{new_path}{end_quote}'

    new_content = PATTERN.sub(replacer, content)
    
    if new_content != content:
        print(f"Fixing {path}")
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)

for root, dirs, files in os.walk(ROOT):
    for name in files:
        if name.endswith(".ts"):
            fix_file(os.path.join(root, name))
