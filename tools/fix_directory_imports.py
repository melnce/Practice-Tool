
import os
import re

ROOT = r"c:\Projects\Practice Tool\src"

# Regex to find imports ending in .js
# import ... from "path.js"
PATTERN = re.compile(r'(from\s+|import\s+|import\()(["\'])([^"\']+\.js)("|\')')

def resolve_path(current_file, import_path):
    # import_path is relative, e.g. "../logic.js"
    # current_file is absolute, e.g. "c:\Projects\...\src\boot\boot.ts"
    
    dir_name = os.path.dirname(current_file)
    
    # Strip .js suffix to check if it refers to a directory
    base_import = import_path[:-3] # remove .js
    
    # Construct absolute path candidate
    candidate = os.path.normpath(os.path.join(dir_name, base_import))
    
    # Check if candidate is a directory
    if os.path.isdir(candidate):
        return candidate
    return None

def fix_file(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    def replacer(match):
        prefix = match.group(1)
        quote = match.group(2)
        import_path = match.group(3)
        end_quote = match.group(4)
        
        directory = resolve_path(path, import_path)
        if directory:
            # Check if index.ts exists in that directory
            if os.path.exists(os.path.join(directory, "index.ts")) or \
               os.path.exists(os.path.join(directory, "index.tsx")):
                # Replace .js with /index.js
                new_path = import_path[:-3] + "/index.js"
                return f'{prefix}{quote}{new_path}{end_quote}'
        
        return match.group(0)

    new_content = PATTERN.sub(replacer, content)
    
    if new_content != content:
        print(f"Fixing directory import in {path}")
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)

for root, dirs, files in os.walk(ROOT):
    for name in files:
        if name.endswith(".ts"):
            fix_file(os.path.join(root, name))
