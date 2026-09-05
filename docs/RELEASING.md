# Release preparation — 0.1.0 (not released)

No tag, GitHub Release, or public installer has been created. A local personal-preview EXE is now built for the maintainer only; do not redistribute it. The maintainer has contacted the upstream author and is awaiting a response.

## Planned distribution

One per-user Windows x64 EXE installer, built with Inno Setup 7.1.0 (local non-commercial personal build) from `installer/LiquidSlide.iss`. It places the COM DLL, WebView2 loader and bundled web UI under `%LOCALAPPDATA%\Programs\LiquidSlide`, registers the two COM classes and PowerPoint add-in under HKCU, and provides an uninstaller. Users do not need Node.js or a .NET SDK. PowerPoint must be closed during installation, upgrades and removal.

The installer has been tested on the maintainer machine for installation, x64 COM registration, uninstall and reinstall. PowerPoint-running rejection was also observed. It is not a clean-machine compatibility-tested release. Public distribution remains blocked on the gates below.

## Gates before any binary distribution

- Obtain an explicit license/permission covering the exact `@liquid-dom/core@0.1.1` JavaScript and WGSL shader implementation and its redistribution in a bundled desktop application. Upstream currently has no root/core license. Attribution alone is insufficient.
- Archive upstream permission and all required dependency license texts in the installer; inventory React, React DOM, scheduler, liquid-dom/layout and WebView2 SDK/runtime terms.
- Confirm redistribution rights for preview artwork. Local-only artwork must not be packaged.
- Verify Windows 10/11, 64-bit PowerPoint, .NET Framework 4.8, current WebView2 Runtime and WebGPU-capable GPU/driver. Test clean install, upgrade, repair and uninstall under a standard user.
- Verify selected shape geometry, rotation, slides sharing shape IDs, selection changes, shadow properties, preview/apply separation, parameter tags and save/reopen in PowerPoint.
- Add prerequisite detection and actionable download links to the installer, verify registration errors are surfaced, then test the installer. The current draft only checks that PowerPoint is closed.
- Sign EXE/DLL with a publisher certificate before a broad release, and publish SHA-256 checksums. Unsigned test builds may trigger Windows warnings.

## Proposed end-user installation

1. Install 64-bit desktop PowerPoint, .NET Framework 4.8 and Microsoft Edge WebView2 Evergreen Runtime if missing.
2. Save presentations and close PowerPoint.
3. Download `LiquidSlide-0.1.0-windows-x64-setup.exe` from a future GitHub Release, verify the published checksum, run it as the current user.
4. Open PowerPoint, open LiquidSlide from the Add-ins tab, select a circle/rounded rectangle and try Real Preview.
5. Uninstall through Windows Settings → Apps after closing PowerPoint.

There is no downloadable installer yet. Source-build instructions are in README.

## Local personal packaging

Run `npm run build:all`, then `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-installer.ps1 -CompilerPath "path\to\ISCC.exe"`.

Outputs stay in Git-ignored `release-output/`. The personal package includes the local preview image and dependencies and must not be attached to GitHub or sent to others. The Inno Setup compiler license must be checked before changing this personal/non-commercial workflow into a commercial distribution process.

The x64 registration path is explicit via `{sysnative}`. Installer tests found and corrected an earlier 32-bit PowerShell registration bug. Full WebGPU rendering inside the installed PowerPoint host still requires manual observation; registration and matching hashes do not prove rendering compatibility.