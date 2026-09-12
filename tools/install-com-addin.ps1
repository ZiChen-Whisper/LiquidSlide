param([string]$AssemblyPath, [switch]$NoLaunch)
$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $AssemblyPath) { $AssemblyPath = Join-Path $projectRoot "src\LiquidSlide.ComAddin\bin\x64\Debug\net48\LiquidSlide.ComAddin.dll" }
$addinKey = "HKCU:\Software\Microsoft\Office\PowerPoint\Addins\LiquidSlide.PowerPointAddin"
$classesRoot = "HKCU:\Software\Classes"
$progIdKey = Join-Path $classesRoot "LiquidSlide.PowerPointAddin"
$classId = "{D8097CA2-70BA-4CB0-9D87-2F8917898D6E}"
$classKey = Join-Path $classesRoot "CLSID\$classId"
$inprocKey = Join-Path $classKey "InprocServer32"
$controlProgIdKey = Join-Path $classesRoot "LiquidSlide.TaskPaneControl"
$controlClassId = "{8D175711-7BCE-4411-90EC-E20B9EA9BF1B}"
$controlClassKey = Join-Path $classesRoot "CLSID\$controlClassId"
$controlInprocKey = Join-Path $controlClassKey "InprocServer32"
$powerPointRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)

if (-not (Test-Path -LiteralPath $assemblyPath)) {
  throw "Build output not found: $assemblyPath. Run npm run build:all first."
}

if (-not [Environment]::Is64BitProcess) { throw 'Run registration with 64-bit PowerShell.' }
$assemblyPath = (Resolve-Path -LiteralPath $assemblyPath).ProviderPath
# COM binding uses the full assembly identity, not the file/product version.
$assemblyIdentity = [Reflection.AssemblyName]::GetAssemblyName($assemblyPath)
if ($assemblyIdentity.Name -ne 'LiquidSlide.ComAddin') { throw 'Not a LiquidSlide COM assembly.' }
$assemblyFullName = $assemblyIdentity.FullName

New-Item -Path $progIdKey -Force | Out-Null
Set-Item -Path $progIdKey -Value "LiquidSlide.ComAddin.ComAddin"
New-Item -Path (Join-Path $progIdKey "CLSID") -Force | Out-Null
Set-Item -Path (Join-Path $progIdKey "CLSID") -Value $classId

New-Item -Path $classKey -Force | Out-Null
Set-Item -Path $classKey -Value "LiquidSlide.ComAddin.ComAddin"
New-Item -Path $inprocKey -Force | Out-Null
Set-Item -Path $inprocKey -Value "mscoree.dll"
New-ItemProperty -Path $inprocKey -Name ThreadingModel -Value Both -PropertyType String -Force | Out-Null
New-ItemProperty -Path $inprocKey -Name Class -Value "LiquidSlide.ComAddin.ComAddin" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $inprocKey -Name Assembly -Value $assemblyFullName -PropertyType String -Force | Out-Null
New-ItemProperty -Path $inprocKey -Name RuntimeVersion -Value "v4.0.30319" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $inprocKey -Name CodeBase -Value ([Uri]$assemblyPath).AbsoluteUri -PropertyType String -Force | Out-Null
New-Item -Path (Join-Path $classKey "ProgId") -Force | Out-Null
Set-Item -Path (Join-Path $classKey "ProgId") -Value "LiquidSlide.PowerPointAddin"
New-Item -Path (Join-Path $classKey "Implemented Categories\{62C8FE65-4EBB-45E7-B440-6E39B2CDBF29}") -Force | Out-Null

New-Item -Path $controlProgIdKey -Force | Out-Null
Set-Item -Path $controlProgIdKey -Value "LiquidSlide.ComAddin.LiquidSlideWindow"
New-Item -Path (Join-Path $controlProgIdKey "CLSID") -Force | Out-Null
Set-Item -Path (Join-Path $controlProgIdKey "CLSID") -Value $controlClassId
New-Item -Path $controlClassKey -Force | Out-Null
Set-Item -Path $controlClassKey -Value "LiquidSlide.ComAddin.LiquidSlideWindow"
New-Item -Path $controlInprocKey -Force | Out-Null
Set-Item -Path $controlInprocKey -Value "mscoree.dll"
New-ItemProperty -Path $controlInprocKey -Name ThreadingModel -Value Both -PropertyType String -Force | Out-Null
New-ItemProperty -Path $controlInprocKey -Name Class -Value "LiquidSlide.ComAddin.LiquidSlideWindow" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $controlInprocKey -Name Assembly -Value $assemblyFullName -PropertyType String -Force | Out-Null
New-ItemProperty -Path $controlInprocKey -Name RuntimeVersion -Value "v4.0.30319" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $controlInprocKey -Name CodeBase -Value ([Uri]$assemblyPath).AbsoluteUri -PropertyType String -Force | Out-Null
New-Item -Path (Join-Path $controlClassKey "ProgId") -Force | Out-Null
Set-Item -Path (Join-Path $controlClassKey "ProgId") -Value "LiquidSlide.TaskPaneControl"
New-Item -Path (Join-Path $controlClassKey "Control") -Force | Out-Null
New-Item -Path (Join-Path $controlClassKey "Implemented Categories\{40FC6ED4-2438-11CF-A3DB-080036F12502}") -Force | Out-Null
New-Item -Path (Join-Path $controlClassKey "Implemented Categories\{7DD95801-9882-11CF-9FA9-00AA006C42C4}") -Force | Out-Null
New-Item -Path (Join-Path $controlClassKey "Implemented Categories\{7DD95802-9882-11CF-9FA9-00AA006C42C4}") -Force | Out-Null

New-Item -Path $addinKey -Force | Out-Null
New-ItemProperty -Path $addinKey -Name FriendlyName -Value "LiquidSlide" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $addinKey -Name Description -Value "Liquid glass static fills for PowerPoint 2019" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $addinKey -Name LoadBehavior -Value 3 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $addinKey -Name CommandLineSafe -Value 0 -PropertyType DWord -Force | Out-Null

Write-Host "LiquidSlide COM add-in registered for the current user."
Write-Host "Assembly: $assemblyFullName"
Write-Host "Path: $assemblyPath"
if ($powerPointRunning) {
  Write-Host "PowerPoint is already running. Close every PowerPoint window and start it again to load LiquidSlide."
} elseif (-not $NoLaunch) {
  Write-Host "Starting PowerPoint..."
  Start-Process POWERPNT.EXE
}
