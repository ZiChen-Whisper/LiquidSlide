# Release 0.1.0

The maintainer authorized public release and confirmed plugin functionality on 2026-09-07. Liquid DOM root/core MIT license texts are archived in `installer/licenses`; see THIRD_PARTY_NOTICES.md for the upstream commit.

## Build

Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm test`.
Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-installer.ps1
```

An optional `-CompilerPath` selects ISCC.exe. By default the script uses `.codex-build/inno/ISCC.exe` or ISCC.exe from PATH. It rebuilds the production web bundle and x64 Release COM assembly. `package.json` supplies the About page, assembly and installer version. Build prerequisites remain documented in README.

Outputs: `release-output/LiquidSlide-0.1.0-windows-x64-setup.exe` and `release-output/SHA256SUMS.txt`. Upload only these release assets; installed DLLs, uninstaller files and runtime directories at the repository root are local installation artifacts.

## Installation

Requires Windows x64, 64-bit desktop PowerPoint, .NET Framework 4.8 and Microsoft Edge WebView2 Evergreen Runtime with WebGPU support. Save presentations and close PowerPoint before installing/upgrading/removing. The installer registers COM classes and the add-in under HKCU and defaults to `%LOCALAPPDATA%\Programs\LiquidSlide`. Node.js and the .NET SDK are not required on end-user machines.

Use the LiquidSlide ribbon tab to open the panel or About. Both About entry points display the same page, and GitHub links open in the default browser.

## Validation scope

The maintainer confirmed existing plugin functionality. Previous local installer lifecycle checks covered installation, x64 COM registration, uninstall and reinstall. The public package is unsigned, does not install prerequisites automatically and is not verified across clean machines, all Office versions, graphics drivers or DPI settings. Keep this scope visible in release notes.

Preserve all third-party license files when packaging. The source commit and version tag must match the binary build. Publish the installer and SHA-256 checksum using GitHub Releases.
