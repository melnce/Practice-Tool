
const { Project, SyntaxKind } = require("ts-morph");
const path = require("path");
const fs = require("fs");

async function main() {
    console.log("Initializing project from tsconfig.json...");
    // Initialize project based on tsconfig.json
    const project = new Project({
        tsConfigFilePath: "tsconfig.json",
        skipAddingFilesFromTsConfig: false,
    });
    project.addSourceFilesAtPaths("tests/**/*.ts");

    const sourceFiles = project.getSourceFiles();
    console.log(`Files found in project: ${sourceFiles.length}`);

    let modifications = 0;

    // Helper to determine if a specifier is an alias we want to rewrite
    const aliases = ["@core", "@data", "@logic", "@ui", "@helpers", "@ops", "#core", "#logic", "#ui", "#helpers", "#data"];

    function isAliased(specifier) {
        return aliases.some(a => specifier.startsWith(a));
    }

    // Helper: Determine if we should attempt to resolve this specifier
    function shouldRewrite(specifier) {
        return isAliased(specifier);
    }

    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();

        // Skip dist and node_modules explicitly
        if (filePath.includes("/dist/") || filePath.includes("/node_modules/")) continue;

        // console.log(`Processing ${path.relative(process.cwd(), filePath)}...`);

        // Helper import rewriter
        const rewrite = (specifier, nodeToWarn) => {
            if (!shouldRewrite(specifier)) return null;

            // Try to resolve
            const resolvedSourceFile = nodeToWarn.getModuleSpecifierSourceFile();

            if (resolvedSourceFile) {
                const resolvedPath = resolvedSourceFile.getFilePath();

                let relativePath = path.relative(path.dirname(filePath), resolvedPath);

                // Normalize separators
                relativePath = relativePath.split(path.sep).join("/");

                if (!relativePath.startsWith(".")) {
                    relativePath = "./" + relativePath;
                }

                // Remove extension
                // Logic: strict removal of .ts, .tsx, .d.ts, .js
                // We want extensionless imports for TS source files
                const ext = path.extname(relativePath);
                // remove extension if present
                if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
                    relativePath = relativePath.substring(0, relativePath.length - ext.length);
                }
                else if (relativePath.endsWith(".d.ts")) {
                    relativePath = relativePath.substring(0, relativePath.length - 5);
                }

                // Handle index
                if (relativePath.endsWith("/index")) {
                    relativePath = relativePath.substring(0, relativePath.length - 6);
                    if (relativePath === "") relativePath = ".";
                }

                if (specifier === relativePath) return null; // No change

                // console.log(`  Rewrite: ${specifier} -> ${relativePath}`);
                return relativePath;

            } else {
                // Fallback for # imports if they point to .js files in dist?
                // Since tsconfig maps @core etc., but not #core unless we add it to paths?
                // But user has #core mapped to ./dist/core/*.js in package.json
                // ts-morph reading tsconfig might NOT resolve #core if it's not in paths.
                // We need to handle this manually if getModuleSpecifierSourceFile fails.

                // Manual fallback for # aliases
                if (specifier.startsWith("#")) {
                    // Map #core/foo -> src/core/foo
                    // Helper map based on user info
                    const manualMap = {
                        "#core": "src/core",
                        "#logic": "src/logic",
                        "#ui": "src/ui",
                        "#helpers": "src/helpers",
                        "#data": "src/data"
                    };

                    for (const [alias, targetDir] of Object.entries(manualMap)) {
                        if (specifier.startsWith(alias)) {
                            const rest = specifier.substring(alias.length);
                            // construct absolute path
                            // removing leading slash if any
                            const cleanRest = rest.startsWith("/") ? rest.substring(1) : rest;

                            // Target is src/core/foo
                            // We need to find the file file in project that matches this
                            // But wait, the import might be checks for .js?
                            // e.g. #core/foo -> dist/core/foo.js
                            // We want to link to src/core/foo.ts

                            const targetAbs = path.resolve(process.cwd(), targetDir, cleanRest);

                            // try to find source file with extensions
                            const extensions = [".ts", ".tsx", ".d.ts"]; // assuming source is TS
                            let foundSource = null;

                            // Try exact match first (unlikely if checks for directory)
                            for (const ext of extensions) {
                                // check if targetAbs + ext is a file in project
                                // ts-morph SourceFiles are keyed by normalized path
                                const probe = targetAbs + ext;
                                const f = project.getSourceFile(probe); // naive check
                                if (f) {
                                    foundSource = f;
                                    break;
                                }

                                // Also check file system if project doesn't have it loaded
                            }

                            if (foundSource) {
                                let relativePath = path.relative(path.dirname(filePath), foundSource.getFilePath());
                                relativePath = relativePath.split(path.sep).join("/");
                                if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
                                const ext = path.extname(relativePath);
                                if (ext) relativePath = relativePath.substring(0, relativePath.length - ext.length);
                                if (relativePath.endsWith("/index")) relativePath = relativePath.substring(0, relativePath.length - 6);
                                if (relativePath === "") relativePath = ".";

                                return relativePath;
                            }
                        }
                    }
                }

                console.warn(`[WARN] Could not resolve '${specifier}' in ${filePath}`);
                return null;
            }
        };

        // Rewrites
        sourceFile.getImportDeclarations().forEach(importDecl => {
            const specifier = importDecl.getModuleSpecifierValue();
            const newSpecifier = rewrite(specifier, importDecl);
            if (newSpecifier) {
                importDecl.setModuleSpecifier(newSpecifier);
                modifications++;
            }
        });

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
    }

    if (modifications > 0) {
        console.log(`Saving ${modifications} changes...`);
        await project.save();
        console.log("Done.");
    } else {
        console.log("No changes made.");
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
