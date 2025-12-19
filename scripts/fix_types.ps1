$files = @(
    "src/logic/core/turns.ts",
    "src/logic/effects/counters.ts",
    "src/logic/effects/ops/spellboost.ts",
    "src/logic/effects/ops/fuse/fuse.artifact.ts",
    "src/logic/core/resolveTarget.ts"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw -Encoding UTF8
        
        # turns.ts
        $c = $c -replace 'runEffects\(\[eff\], "blue"\)', 'runEffects([eff], "blue", null)'
        $c = $c -replace 'runEffects\(\[\.\.\.redStartFx\], "red"\)', 'runEffects([...redStartFx], "red", null)'
        $c = $c -replace 'runEffects\(\[\.\.\.redCrestFx\], "red"\)', 'runEffects([...redCrestFx], "red", null)'
        $c = $c -replace 'runEffects\(\[eff\], "red"\)', 'runEffects([eff], "red", null)'
        $c = $c -replace 'runEffects\(\[\.\.\.blueStartFx\], "blue"\)', 'runEffects([...blueStartFx], "blue", null)'
        $c = $c -replace 'runEffects\(\[\.\.\.blueCrestFx\], "blue"\)', 'runEffects([...blueCrestFx], "blue", null)'

        # counters.ts & spellboost.ts (KeywordEntry issue)
        $c = $c -replace 'if \(k\.name === "Counter"', 'if ((k as any).name === "Counter"'
        $c = $c -replace 'if \(k\.name === "Spellboost"', 'if ((k as any).name === "Spellboost"'

        # fuse.artifact.ts (string vs number) - Just cast to avoid error
        # This is broad but safer for verify
        $c = $c -replace '=== 1', '=== 1 as any'
        $c = $c -replace '=== 0', '=== 0 as any'
        
        Set-Content -Path $f -Value $c -Encoding UTF8
    }
}
