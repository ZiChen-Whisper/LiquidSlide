param([ValidateSet('Debug', 'Release')][string]$Configuration = 'Debug')
$ErrorActionPreference = "Stop"

# Some non-interactive Windows hosts omit these variables. NuGet uses them
# while resolving machine-wide settings, so keep the workaround local to this
# build process instead of changing the user's system environment.
if (-not $env:ProgramFiles) { $env:ProgramFiles = "C:\Program Files" }
if (-not ${env:ProgramFiles(x86)}) { ${env:ProgramFiles(x86)} = "C:\Program Files (x86)" }
if (-not $env:CommonProgramFiles) { $env:CommonProgramFiles = "C:\Program Files\Common Files" }
if (-not ${env:CommonProgramFiles(x86)}) { ${env:CommonProgramFiles(x86)} = "C:\Program Files (x86)\Common Files" }
if (-not $env:NUGET_PACKAGES) { $env:NUGET_PACKAGES = Join-Path $env:USERPROFILE ".nuget\packages" }

$project = Join-Path $PSScriptRoot "..\src\LiquidSlide.ComAddin\LiquidSlide.ComAddin.csproj"
$version = (Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version
dotnet build $project --configuration $Configuration --property:Platform=x64 --property:Version=$version
if ($LASTEXITCODE -ne 0) { throw "LiquidSlide COM build failed." }
