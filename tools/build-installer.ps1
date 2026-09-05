param([string]$CompilerPath)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $CompilerPath) {
  $localCompiler = Join-Path $repoRoot '.codex-build\inno\ISCC.exe'
  if (Test-Path -LiteralPath $localCompiler) { $CompilerPath = $localCompiler }
  else { $CompilerPath = (Get-Command ISCC.exe -ErrorAction Stop).Source }
}
$webBundle = Join-Path $repoRoot 'src\LiquidSlide.ComAddin\bin\x64\Debug\net48\web\taskpane.js'
if (-not (Test-Path -LiteralPath $webBundle)) { throw 'Build LiquidSlide first: npm run build:all' }
& $CompilerPath /Q (Join-Path $repoRoot 'installer\LiquidSlide.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compile failed' }
$setupPath = Join-Path $repoRoot 'release-output\LiquidSlide-0.1.0-personal-preview-windows-x64-setup.exe'
$hash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $repoRoot 'release-output\SHA256SUMS.txt'), "$hash  $([IO.Path]::GetFileName($setupPath))`n", [Text.Encoding]::ASCII)
Write-Host "Personal preview only. No public release was created: $setupPath"
