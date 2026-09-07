param([string]$CompilerPath)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $CompilerPath) {
  $localCompiler = Join-Path $repoRoot '.codex-build\inno\ISCC.exe'
  if (Test-Path -LiteralPath $localCompiler) { $CompilerPath = $localCompiler }
  else { $CompilerPath = (Get-Command ISCC.exe -ErrorAction Stop).Source }
}
$version = (Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
Push-Location $repoRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
  & (Join-Path $PSScriptRoot 'build-com.ps1') -Configuration Release
} finally { Pop-Location }
$assemblyPath = Join-Path $repoRoot 'src\LiquidSlide.ComAddin\bin\x64\Release\net48\LiquidSlide.ComAddin.dll'
if ([Reflection.AssemblyName]::GetAssemblyName($assemblyPath).Version.ToString(3) -ne $version) { throw 'Assembly/package version mismatch' }
& $CompilerPath /Q "/DAppVersion=$version" (Join-Path $repoRoot 'installer\LiquidSlide.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compile failed' }
$setupPath = Join-Path $repoRoot "release-output\LiquidSlide-$version-windows-x64-setup.exe"
$hash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $repoRoot 'release-output\SHA256SUMS.txt'), "$hash  $([IO.Path]::GetFileName($setupPath))`n", [Text.Encoding]::ASCII)
Write-Host "Installer built: $setupPath"
