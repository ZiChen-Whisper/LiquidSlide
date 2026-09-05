$ErrorActionPreference = "Stop"
$addinKey = "HKCU:\Software\Microsoft\Office\PowerPoint\Addins\LiquidSlide.PowerPointAddin"
$progIdKey = "HKCU:\Software\Classes\LiquidSlide.PowerPointAddin"
$classKey = "HKCU:\Software\Classes\CLSID\{D8097CA2-70BA-4CB0-9D87-2F8917898D6E}"
$controlProgIdKey = "HKCU:\Software\Classes\LiquidSlide.TaskPaneControl"
$controlClassKey = "HKCU:\Software\Classes\CLSID\{8D175711-7BCE-4411-90EC-E20B9EA9BF1B}"

if (Get-Process POWERPNT -ErrorAction SilentlyContinue) {
  throw "Close PowerPoint completely before uninstalling LiquidSlide."
}
if (Test-Path $addinKey) { Remove-Item -LiteralPath $addinKey -Recurse -Force }
if (Test-Path $progIdKey) { Remove-Item -LiteralPath $progIdKey -Recurse -Force }
if (Test-Path $classKey) { Remove-Item -LiteralPath $classKey -Recurse -Force }
if (Test-Path $controlProgIdKey) { Remove-Item -LiteralPath $controlProgIdKey -Recurse -Force }
if (Test-Path $controlClassKey) { Remove-Item -LiteralPath $controlClassKey -Recurse -Force }
Write-Host "LiquidSlide COM add-in unregistered for the current user."
