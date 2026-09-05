#define AppVersion "0.1.0"
[Setup]
AppId=LiquidSlide.PowerPointAddin
AppName=LiquidSlide
AppVersion={#AppVersion}
AppPublisher=ZiChen-Whisper
DefaultDirName={localappdata}\Programs\LiquidSlide
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=LiquidSlide
OutputDir=..\release-output
OutputBaseFilename=LiquidSlide-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
LicenseFile=..\LICENSE
CloseApplications=no

[Files]
Source: "..\src\LiquidSlide.ComAddin\bin\x64\Debug\net48\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\tools\install-com-addin.ps1"; DestDir: "{app}\tools"
Source: "..\tools\uninstall-com-addin.ps1"; DestDir: "{app}\tools"
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"
Source: "..\LICENSE"; DestDir: "{app}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\install-com-addin.ps1"" -AssemblyPath ""{app}\LiquidSlide.ComAddin.dll"" -NoLaunch"; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\uninstall-com-addin.ps1"""; Flags: runhidden waituntilterminated

[Code]
function PowerPointRunning: Boolean;
var ResultCode: Integer;
begin
  Result := True;
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -Command "if (Get-Process POWERPNT -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := ResultCode <> 0;
end;
function InitializeSetup: Boolean;
begin
  Result := not PowerPointRunning;
  if not Result then MsgBox('Save your work and close PowerPoint before installing LiquidSlide.', mbError, MB_OK);
end;
function InitializeUninstall: Boolean;
begin
  Result := not PowerPointRunning;
  if not Result then MsgBox('Save your work and close PowerPoint before uninstalling LiquidSlide.', mbError, MB_OK);
end;
