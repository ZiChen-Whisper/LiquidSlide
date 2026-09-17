#ifndef AppVersion
  #error AppVersion must be supplied by tools/build-installer.ps1
#endif
[Setup]
AppId=LiquidSlide.PowerPointAddin
AppName=LiquidSlide
AppVersion={#AppVersion}
AppPublisher=ZiChen-Whisper
AppPublisherURL=https://github.com/ZiChen-Whisper
AppSupportURL=https://github.com/ZiChen-Whisper/LiquidSlide/issues
AppUpdatesURL=https://github.com/ZiChen-Whisper/LiquidSlide/releases
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
InfoBeforeFile=INSTALL-NOTES.txt
CloseApplications=no
WizardSizePercent=125,120

[Languages]
Name: "bilingual"; MessagesFile: "compiler:Default.isl,Bilingual.isl"

[Files]
Source: "..\src\LiquidSlide.ComAddin\bin\x64\Release\net48\*"; DestDir: "{app}"; Excludes: "web\assets\preview-background.jpg,*.pdb,*.reg,Microsoft.Web.WebView2.Wpf.dll,runtimes\win-arm64\*,runtimes\win-x86\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\tools\install-com-addin.ps1"; DestDir: "{app}\tools"
Source: "..\tools\uninstall-com-addin.ps1"; DestDir: "{app}\tools"
Source: "..\tools\diagnose-com-activation.ps1"; DestDir: "{app}\tools"
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"
Source: "..\LICENSE"; DestDir: "{app}"
Source: "INSTALL-NOTES.txt"; DestDir: "{app}"

[Files]
Source: "licenses\*"; DestDir: "{app}\licenses"

[Code]
procedure InitializeWizard;
var ButtonGap: Integer;
begin
  { Leave enough room for both languages on the navigation buttons. }
  ButtonGap := ScaleX(8);
  WizardForm.CancelButton.Width := ScaleX(110);
  WizardForm.CancelButton.Left := WizardForm.ClientWidth - ScaleX(20) - WizardForm.CancelButton.Width;
  WizardForm.NextButton.Width := ScaleX(135);
  WizardForm.NextButton.Left := WizardForm.CancelButton.Left - ButtonGap - WizardForm.NextButton.Width;
  WizardForm.BackButton.Width := ScaleX(135);
  WizardForm.BackButton.Left := WizardForm.NextButton.Left - ButtonGap - WizardForm.BackButton.Width;
  WizardForm.DirBrowseButton.Width := ScaleX(125);
  WizardForm.DirBrowseButton.Left := WizardForm.DirEdit.Parent.ClientWidth - WizardForm.DirBrowseButton.Width;
  WizardForm.DirEdit.Width := WizardForm.DirBrowseButton.Left - WizardForm.DirEdit.Left - ButtonGap;
end;

function PowerPointRunning: Boolean;
var ResultCode: Integer;
begin
  Result := True;
  if Exec(ExpandConstant('{sysnative}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -Command "if (Get-Process POWERPNT -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := ResultCode <> 0;
end;
procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
    if not Exec(ExpandConstant('{sysnative}\WindowsPowerShell\v1.0\powershell.exe'), ExpandConstant('-NoProfile -ExecutionPolicy Bypass -File "{app}\tools\install-com-addin.ps1" -AssemblyPath "{app}\LiquidSlide.ComAddin.dll" -NoLaunch'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      RaiseException('LiquidSlide 注册失败，请检查日志后重试。 / LiquidSlide registration failed. Please check the installation log and run the installer again.');
end;
function InitializeSetup: Boolean;
begin
  Result := not PowerPointRunning;
  if not Result then MsgBox('安装前请保存演示文稿并关闭 PowerPoint。 / Save your work and close PowerPoint before installing LiquidSlide.', mbError, MB_OK);
end;
function InitializeUninstall: Boolean;
var ResultCode: Integer;
begin
  Result := not PowerPointRunning;
  if not Result then MsgBox('卸载前请保存演示文稿并关闭 PowerPoint。 / Save your work and close PowerPoint before uninstalling LiquidSlide.', mbError, MB_OK);
  if Result then begin
    Result := Exec(ExpandConstant('{sysnative}\WindowsPowerShell\v1.0\powershell.exe'), ExpandConstant('-NoProfile -ExecutionPolicy Bypass -File "{app}\tools\uninstall-com-addin.ps1"'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Result := Result and (ResultCode = 0);
    if not Result then MsgBox('无法注销 LiquidSlide，卸载已取消。 / Unable to unregister LiquidSlide. Uninstall was cancelled.', mbError, MB_OK);
  end;
end;
