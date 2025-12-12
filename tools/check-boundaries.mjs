import { Project } from "ts-morph";
import path from "path";
import fs from "fs";

const project = new Project({
    tsConfigFilePath: "tsconfig.json",
});

const FORBIDDEN_LAYER = "/src/ui";
const GUARDED_LAYERS = ["/src/core", "/src/logic"];

let violations = 0;

console.log("🛡️  Checking Architecture Boundaries...");
try { fs.unlinkSync("boundary_errors.txt"); } catch (e) { }

const sourceFiles = project.getSourceFiles();

for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();

    // Check if this file is in a guarded layer
    const guarded = GUARDED_LAYERS.find(layer => filePath.includes(layer));
    if (!guarded) continue;

    const imports = sourceFile.getImportDeclarations();
    const exports = sourceFile.getExportDeclarations();
    const dynamicImports = sourceFile.getDescendantsOfKind(210); // SyntaxKind.CallExpression, need to check for import()

    // Helper to check specifier
    const checkSpecifier = (specifier, nodeType, lineNum) => {
        if (!specifier) return;

        // Resolve path roughly or use TS module resolution if needed.
        // ts-morph sourceFile.getReferencedSourceFiles() is easiest but doesn't show *which* import caused it easily.
        // We'll trust specifier string manipulation for strictness or use resolution.

        // Better: let ts-morph resolve it.
        let resolvedFile;
        try {
            // This works for static imports/exports
            if (nodeType === "import" || nodeType === "export") {
                const declaration = nodeType === "import"
                    ? sourceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === specifier)
                    : sourceFile.getExportDeclaration(d => d.getModuleSpecifierValue() === specifier);

                if (declaration) {
                    const sf = declaration.getModuleSpecifierSourceFile();
                    if (sf) resolvedFile = sf.getFilePath();
                }
            }
        } catch (e) { }

        // Fallback: manual resolution if ts-morph didn't find it (non-ts file?) or just simple check
        if (!resolvedFile) {
            if (specifier.startsWith(".")) {
                resolvedFile = path.resolve(path.dirname(filePath), specifier);
            }
        }

        if (resolvedFile && resolvedFile.toLowerCase().replace(/\\/g, "/").includes(FORBIDDEN_LAYER)) {
            const msg = `❌ [VIOLATION] ${path.relative(process.cwd(), filePath)}:${lineNum}\n   Imports UI layer: '${specifier}' -> ${resolvedFile}\n`;
            console.error(msg);
            fs.appendFileSync("boundary_errors.txt", msg);
            violations++;
        }
    };

    // 1. Static Imports
    for (const decl of imports) {
        checkSpecifier(decl.getModuleSpecifierValue(), "import", decl.getStartLineNumber());
    }

    // 2. Static Exports
    for (const decl of exports) {
        if (decl.hasModuleSpecifier()) {
            checkSpecifier(decl.getModuleSpecifierValue(), "export", decl.getStartLineNumber());
        }
    }

    // 3. Dynamic Imports (manual AST walk for ImportKeyword usually)
    // ts-morph simplifies this: sourceFile.getImportStringLiterals() gives all?
    // Let's stick to simple CallExpression check for import('...')
    // actually imports are usually distinct.

    const callExpressions = sourceFile.getDescendants().filter(n => {
        // SyntaxKind.CallExpression = 213 (in newer TS) or similar. 
        // Safer to check input form.
        return n.getKindName() === "CallExpression" && n.getExpression().getKindName() === "ImportKeyword";
    });

    for (const call of callExpressions) {
        const args = call.getArguments();
        if (args.length > 0 && args[0].getKindName() === "StringLiteral") {
            const specifier = args[0].getLiteralText();
            checkSpecifier(specifier, "dynamic", call.getStartLineNumber());
        }
    }
}

if (violations > 0) {
    console.error(`\n🚨 Found ${violations} architecture violations.`);
    console.error("   Core/Logic modules MUST NOT import from UI.");
    process.exit(1);
} else {
    console.log("✅ Boundaries respected.");
    process.exit(0);
}
