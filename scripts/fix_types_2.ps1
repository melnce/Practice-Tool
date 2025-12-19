$files = @("src/logic/effects/counters.ts", "src/logic/effects/ops/spellboost.ts")
foreach ($f in $files) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw -Encoding UTF8
        $c = $c -replace 'k\.name', '(k as any).name'
        $c = $c -replace 'k\.key', '(k as any).key'
        $c = $c -replace 'k\.count', '(k as any).count'
        $c = $c -replace 'k\.destroyOnEmpty', '(k as any).destroyOnEmpty'
        $c = $c -replace 'k\.effects', '(k as any).effects'
        Set-Content $f -Value $c -Encoding UTF8
    }
}
