#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Add-Type -Path @(
    (Join-Path $root 'src/LiquidSlide.ComAddin/WindowPaneRegistry.cs'),
    (Join-Path $PSScriptRoot 'tests/WindowPaneRegistryTests.cs')
)
[LiquidSlide.ComAddin.WindowPaneRegistryTests]::Run() | ForEach-Object { Write-Output "PASS $_" }
