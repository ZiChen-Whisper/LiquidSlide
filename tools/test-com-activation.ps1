param(
    [string]$AssemblyPath = (Join-Path $PSScriptRoot '..\src\LiquidSlide.ComAddin\bin\x64\Release\net48\LiquidSlide.ComAddin.dll'),
    [switch]$LegacyIdentity
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess) {
    throw 'Run in a fresh 64-bit Windows PowerShell 5.1 process.'
}
# Redirect only this script's registration writes to a disposable subtree.
# HKCR override affects only this process; installed add-in registration is untouched.
$sandbox = 'Software\LiquidSlideActivationTest-' + [Guid]::NewGuid().ToString('N')
function Convert-TestPath($Path) { return $Path.Replace('HKCU:\', "HKCU:\$sandbox\") }
function New-Item { param($Path, [switch]$Force)
    Microsoft.PowerShell.Management\New-Item -Path (Convert-TestPath $Path) -Force:$Force
}
function Set-Item { param($Path, $Value)
    Microsoft.PowerShell.Management\Set-Item -Path (Convert-TestPath $Path) -Value $Value
}
function New-ItemProperty { param($Path, $Name, $Value, $PropertyType, [switch]$Force)
    Microsoft.PowerShell.Management\New-ItemProperty -Path (Convert-TestPath $Path) -Name $Name -Value $Value -PropertyType $PropertyType -Force:$Force
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ActivationNative {
    [DllImport("advapi32.dll")] public static extern int RegOverridePredefKey(IntPtr key, IntPtr replacement);
    [DllImport("ole32.dll")] public static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint context, ref Guid iid, out IntPtr instance);
}
'@
$classes = $null
$hkcr = [IntPtr](-2147483648)
try {
    & (Join-Path $PSScriptRoot 'install-com-addin.ps1') -AssemblyPath $AssemblyPath -NoLaunch
    $classes = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$sandbox\Software\Classes", $true)
    $clsid = [Guid]'D8097CA2-70BA-4CB0-9D87-2F8917898D6E'
    $registration = $classes.OpenSubKey("CLSID\{$clsid}\InprocServer32", $true)
    try {
        if ($LegacyIdentity) { $registration.SetValue('Assembly', 'LiquidSlide.ComAddin, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null') }
        $expected = [Reflection.AssemblyName]::GetAssemblyName((Resolve-Path $AssemblyPath).Path).FullName
        if (-not $LegacyIdentity -and $registration.GetValue('Assembly') -ne $expected) { throw 'Registered identity mismatch' }
    } finally { $registration.Dispose() }
    $control = $classes.OpenSubKey('CLSID\{8D175711-7BCE-4411-90EC-E20B9EA9BF1B}\InprocServer32')
    try { if ($control.GetValue('Assembly') -ne $expected) { throw 'Task pane identity mismatch' } }
    finally { $control.Dispose() }
    if ([ActivationNative]::RegOverridePredefKey($hkcr, $classes.Handle.DangerousGetHandle()) -ne 0) { throw 'HKCR override failed' }
    $iid = [Guid]'00000000-0000-0000-C000-000000000046'
    $instance = [IntPtr]::Zero
    $hr = [ActivationNative]::CoCreateInstance([ref]$clsid, [IntPtr]::Zero, 1, [ref]$iid, [ref]$instance)
    if ($instance -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::Release($instance) | Out-Null }
    Write-Output ('CoCreateInstance HRESULT=0x{0:X8}; legacy={1}' -f $hr, $LegacyIdentity)
    if ($LegacyIdentity) {
        if ($hr -eq 0) { Write-Output 'NOT REPRODUCED: legacy identity also activates on this host.' }
        elseif ($hr -ne -2147024894) { [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($hr) }
    } elseif ($hr -ne 0) { [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($hr) }
    Write-Output 'PASS isolated COM activation regression'
} finally {
    [ActivationNative]::RegOverridePredefKey($hkcr, [IntPtr]::Zero) | Out-Null
    if ($classes) { $classes.Dispose() }
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($sandbox, $false)
}
