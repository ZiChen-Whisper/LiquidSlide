# Release preparation — 0.1.0 (not released)

No tag, GitHub Release, or public installer has been created.

## Planned distribution

One per-user Windows x64 EXE installer, built with Inno Setup 6 from `installer/LiquidSlide.iss`. It places the COM DLL, WebView2 loader and bundled web UI under `%LOCALAPPDATA%\Programs\LiquidSlide`, registers the two COM classes and PowerPoint add-in under HKCU, and provides an uninstaller. Users do not need Node.js or a .NET SDK. PowerPoint must be closed during installation, upgrades and removal.

The installer source is a preparation draft, not an installation-tested release. Do not compile and distribute it until all gates below pass.

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
