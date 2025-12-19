Get-ChildItem -Path src -Recurse -Filter *.ts | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -Encoding UTF8
    $content = $content -replace '\.js"', '"'
    $content = $content -replace "\.js'", "'"
    Set-Content -Path $_.FullName -Value $content -Encoding UTF8
}
