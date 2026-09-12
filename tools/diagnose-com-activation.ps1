param([string]$AssemblyPath = (Join-Path $env:LOCALAPPDATA 'Programs\LiquidSlide\LiquidSlide.ComAddin.dll'))
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess) { throw 'Use 64-bit Windows PowerShell 5.1.' }
Write-Output "Process: $PID; CLR: $([Environment]::Version)"
if (Test-Path -LiteralPath $AssemblyPath) {
    Write-Output "Disk identity: $([Reflection.AssemblyName]::GetAssemblyName((Resolve-Path -LiteralPath $AssemblyPath).Path).FullName)"
    Get-FileHash -LiteralPath $AssemblyPath -Algorithm SHA256
}
foreach ($id in @('{D8097CA2-70BA-4CB0-9D87-2F8917898D6E}', '{8D175711-7BCE-4411-90EC-E20B9EA9BF1B}')) {
    # Effective COM registration, plus any versioned subkeys.
    $key = "Registry::HKEY_CLASSES_ROOT\CLSID\$id\InprocServer32"
    Get-ItemProperty -LiteralPath $key -ErrorAction Continue | Format-List
    Get-ChildItem -LiteralPath $key -ErrorAction Continue | Get-ItemProperty | Format-List
}
# Deliberately no LoadFrom before COM activation: it can mask binding failures.
try {
    $type = [Type]::GetTypeFromProgID('LiquidSlide.PowerPointAddin', $true)
    $instance = [Activator]::CreateInstance($type)
    Write-Output "COM activation succeeded: $($instance.GetType().FullName)"
} catch {
    Write-Output $_.Exception.ToString()
    $errorObject = $_.Exception
    while ($errorObject) {
        Write-Output ('{0}: HRESULT=0x{1:X8}' -f $errorObject.GetType().FullName, $errorObject.HResult)
        if ($errorObject -is [IO.FileNotFoundException]) { Write-Output "FileName: $($errorObject.FileName); FusionLog: $($errorObject.FusionLog)" }
        $errorObject = $errorObject.InnerException
    }
    exit 1
}
Write-Output "Startup log (if managed entry was reached): $env:LOCALAPPDATA\LiquidSlide\logs\startup-$PID.log"
