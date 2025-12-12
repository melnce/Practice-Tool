
import os
import re

# Map alias prefixes to source directories (relative to project root)
ALIAS_MAP = {
    "@core": "src/core",
    "#core": "src/core",
    "@logic": "src/logic",
    "#logic": "src/logic",
    "@data": "src/data",
    "#data": "src/data",
    "@ui": "src/ui",
    "#ui": "src/ui",
    "@helpers": "src/helpers",
    "#helpers": "src/helpers",
    "gameLogic": "src/logic/index.js", # handling specialized path
}

def resolve_alias(import_path, current_file_path):
    # import_path example: "@core/utils.js"
    # current_file_path example: "src/logic/effects/ops/draw.ts"

    for alias, target_dir in ALIAS_MAP.items():
        if import_path.startswith(alias):
            # Remove alias part
            remainder = import_path[len(alias):]
            if remainder.startswith("/"):
                remainder = remainder[1:]
            
            # Construct absolute target path (assuming project root is cwd)
            # handle special "gameLogic" case which maps to a file, not just a dir prefix?
            if alias == "gameLogic":
                 target_abs = os.path.abspath(target_dir)
            else:
                 target_abs = os.path.abspath(os.path.join(target_dir, remainder))

            # current directory
            current_dir = os.path.dirname(os.path.abspath(current_file_path))
            
            # Calculate relative path
            rel_path = os.path.relpath(target_abs, current_dir)
            
            # Formatting: ensure ./ if it's in same dir or subdir, replacing \ with /
            rel_path = rel_path.replace("\\", "/")
            if not rel_path.startswith(".") and not rel_path.startswith("/"):
                rel_path = "./" + rel_path
            
            return rel_path
    
    return None

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    modified = False
    
    # Regex for import/export ... from '...'
    # Matches: import ... from "..." or export ... from "..."
    # Capture group 2 is the quote type, group 3 is the path
    import_regex = re.compile(r'^(import|export)\s+.*?from\s+([\'"])(.*?)([\'"]);?$')
    # Regex for side-effect import: import "..."
    side_effect_regex = re.compile(r'^import\s+([\'"])(.*?)([\'"]);?$')
    # Regex for dynamic import: import("...")
    dynamic_import_regex = re.compile(r'import\(([\'"])(.*?)([\'"])\)')

    for line in lines:
        new_line = line
        
        # Check standard import/export
        match = import_regex.match(line)
        if match:
            quote = match.group(2)
            path = match.group(3)
            new_path = resolve_alias(path, filepath)
            if new_path:
                new_line = line.replace(f"{quote}{path}{quote}", f"{quote}{new_path}{quote}")
                modified = True
        
        # Check side effect import
        elif side_effect_regex.match(line):
            match = side_effect_regex.match(line)
            quote = match.group(1)
            path = match.group(2)
            new_path = resolve_alias(path, filepath)
            if new_path:
                 new_line = line.replace(f"{quote}{path}{quote}", f"{quote}{new_path}{quote}")
                 modified = True

        # Check dynamic import (naive replace, assumes one per line or simple structure)
        elif "import(" in line:
            match = dynamic_import_regex.search(line)
            if match:
                quote = match.group(1)
                path = match.group(2)
                new_path = resolve_alias(path, filepath)
                if new_path:
                    new_line = line.replace(f"{quote}{path}{quote}", f"{quote}{new_path}{quote}")
                    modified = True

        new_lines.append(new_line)

    if modified:
        print(f"Modifying {filepath}")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

def main():
    target_exts = ['.ts', '.tsx', '.js', '.jsx']
    for root, dirs, files in os.walk("src"):
        for file in files:
            if any(file.endswith(ext) for ext in target_exts):
                process_file(os.path.join(root, file))
    
    # Also process tests
    for root, dirs, files in os.walk("tests"):
        for file in files:
             if any(file.endswith(ext) for ext in target_exts):
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
