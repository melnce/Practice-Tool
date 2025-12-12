
import { Project, SyntaxKind } from "ts-morph";
import path from "path";
import fs from "fs";

// Initialize project based on tsconfig.json to leverage path mapping resolution
const project = new Project({
    tsConfigFilePath: "tsconfig.json",
    skipAddingFilesFromTsConfig: false,
});

console.log("Files found in project: " + project.getSourceFiles().length);

// Also need to handle package.json '#' imports if they aren't covered by tsconfig
// However, tsconfig usually has the source-of-truth for the build.
// The user noted: "@core/* -> src/core/*" etc.
// ts-morph using tsconfig should handle resolving "@core/foo" to "src/core/foo.ts" automatically
// IF the resolution finds the file.

let modifications = 0;

const sourceFiles = project.getSourceFiles();

// Helper to determine if a specifier is an alias we want to rewrite
const aliases = ["@core", "@data", "@logic", "@ui", "@helpers", "@ops", "#core", "#logic", "#ui", "#helpers", "#data"];

function isAliased(specifier) {
    return aliases.some(a => specifier.startsWith(a));
}

function processFile(sourceFile) {
    const filePath = sourceFile.getFilePath();
    // Skip dist and node_modules explicitly just in case (though tsconfig exclusion handles most)
    if (filePath.includes("/dist/") || filePath.includes("/node_modules/")) return;

    // Helper to rewrite a specifier
    const rewrite = (specifier, nodeToWarn) => {
        if (!isAliased(specifier)) return null;

        // Try to resolve the module specifier to a source file
        const resolvedSourceFile = nodeToWarn.getModuleSpecifierSourceFile();

        if (resolvedSourceFile) {
            const resolvedPath = resolvedSourceFile.getFilePath();

            // Allow extensionless relative path calculation
            let relativePath = path.relative(path.dirname(filePath), resolvedPath);

            // Normalize separators
            relativePath = relativePath.split(path.sep).join("/");

            // Ensure ./ prefix
            if (!relativePath.startsWith(".")) {
                relativePath = "./" + relativePath;
            }

            // Remove extension (.ts, .tsx, .d.ts, .js)
            // User requested explicit extensionless imports
            const ext = path.extname(relativePath);
            if (ext) {
                relativePath = relativePath.substring(0, relativePath.length - ext.length);
            }

            // Special handling for index files?
            // "src/logic/index.ts" -> resolved as "../logic/index" -> "../logic" is cleaner but "../logic/index" is valid.
            // Keeping "../logic/index" is safer for now unless we want to strip /index
            if (relativePath.endsWith("/index")) {
                relativePath = relativePath.substring(0, relativePath.length - 6);
                if (relativePath === "") relativePath = ".";
            }

            return relativePath;

        } else {
            // Fallback or warning
            // If we can't resolve it via AST (maybe it's a runtime-only alias not in tsconfig properly?), we log
            console.warn(`[WARN] Could not resolve '${specifier}' in ${filePath}`);
            return null;
        }
    }

    // Rewrite ImportDeclarations
    sourceFile.getImportDeclarations().forEach(importDecl => {
        const specifier = importDecl.getModuleSpecifierValue();
        const newSpecifier = rewrite(specifier, importDecl);
        if (newSpecifier) {
            importDecl.setModuleSpecifier(newSpecifier);
            modifications++;
        }
    });

    // Rewrite ExportDeclarations (export * from "...", export { x } from "...")
    sourceFile.getExportDeclarations().forEach(exportDecl => {
        const specifier = exportDecl.getModuleSpecifierValue();
        if (specifier) {
            const newSpecifier = rewrite(specifier, exportDecl);
            if (newSpecifier) {
                exportDecl.setModuleSpecifier(newSpecifier);
                modifications++;
            }
        }
    });

    // Rewrite ImportEqualsDeclarations? (Usually for CommonJS: import x = require('...'))
    // Not expecting much in ESNext modules but good to check
    sourceFile.getImportEqualsDeclarations().forEach(importDecl => {
        const ref = importDecl.getModuleReference();
        if (SyntaxKind.ExternalModuleReference && ref.getKind() === SyntaxKind.ExternalModuleReference) {
            const specifierExpression = ref.getExpression();
            if (specifierExpression && (specifierExpression.getKind() === SyntaxKind.StringLiteral)) {
                const specifier = specifierExpression.getLiteralText();
                // Cannot easily use getModuleSpecifierSourceFile on ImportEquals
                // Skipping for now unless we see errors.
            }
        }
    });

    // Dynamic Imports: import("...")
    // ts-morph wraps these in CallExpression
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    callExpressions.forEach(callExpr => {
        if (callExpr.getExpression().getKind() === SyntaxKind.ImportKeyword) {
            const args = callExpr.getArguments();
            if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
                const stringLiteral = args[0];
                const specifier = stringLiteral.getLiteralText();

                // Manual resolution attempt or leverage TypeChecker?
                // ts-morph's getSymbol() or local resolution might be hard on dynamic import
                // But we can try to resolve it if it matches our alias pattern

                if (isAliased(specifier)) {
                    // Since we can't easily get "ModuleSpecifierSourceFile" from a dynamic import string literal node directly
                    // in the same way, we might have to rely on the fact that if it's an alias we know,
                    // we should try to find it.
                    // However, without the resolver, we are guessing.
                    // But wait, we can ask the TypeChecker to resolve the module specifier?
                    // Or just skip dynamic imports for now?
                    // Let's log it.
                    console.log(`[INFO] Found dynamic import '${specifier}' in ${filePath}. Attempting resolve.`);

                    // Try to use the project's resolution (hacky)
                    // If we are strict, maybe we just log fail for now.
                    // Or we can try to find the file manually? 
                    // Let's mark as manual intervention needed if we see output.
                }
            }
        }
    });
}

sourceFiles.forEach(processFile);

if (modifications > 0) {
    console.log(`Saving ${modifications} changes...`);
    project.saveSync();
    console.log("Done.");
} else {
    console.log("No changes made.");
}
