param([string]$AssemblyPath, [switch]$KeepOpen)
$ErrorActionPreference = 'Stop'
if (Get-Process POWERPNT -ErrorAction SilentlyContinue) {
    throw 'Close PowerPoint before this isolated smoke test. No existing presentations will be touched.'
}
if (-not $AssemblyPath) {
    $AssemblyPath = Join-Path $PSScriptRoot '..\src\LiquidSlide.ComAddin\bin\x64\Debug\net48\LiquidSlide.ComAddin.dll'
}
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName System.Drawing
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path -LiteralPath $AssemblyPath).Path)
$bridgeType = $assembly.GetType('LiquidSlide.ComAddin.PowerPointBridge', $true)
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
function Invoke-Bridge($name, $payload) {
    $arguments = if ($null -eq $payload) { [object[]]@() } else { [object[]]@($payload) }
    try { return $bridgeType.GetMethod($name).Invoke($script:bridge, $arguments) }
    catch { throw $_.Exception.GetBaseException() }
}
function Read-Selection { return $json.DeserializeObject($json.Serialize((Invoke-Bridge 'InspectSelection' $null)))['shape'] }
function Target-Payload($shape) {
    $payload = New-Object 'System.Collections.Generic.Dictionary[string,object]'
    $payload['shapeId'] = $shape['id']; $payload['slideId'] = $shape['slideId']; $payload['expectedShape'] = $shape
    return ,$payload
}
function Assert-True($condition, $message) { if (-not $condition) { throw $message }; Write-Output "PASS $message" }
$app = $null; $deck = $null; $other = $null
$success = $false
try {
    $app = New-Object -ComObject PowerPoint.Application
    $app.Visible = -1
    $deck = $app.Presentations.Add(-1)
    $slide = $deck.Slides.Add(1, 12)
    $lower = $slide.Shapes.AddShape(1, 0, 0, $deck.PageSetup.SlideWidth, $deck.PageSetup.SlideHeight)
    $lower.Fill.Solid(); $lower.Fill.ForeColor.RGB = 16711680; $lower.Line.Visible = 0
    $target = $slide.Shapes.AddShape(5, 100, 100, 200, 100)
    $upper = $slide.Shapes.AddShape(1, 100, 100, 200, 100)
    $upper.Fill.Solid(); $upper.Fill.ForeColor.RGB = 255
    $invisible = $slide.Shapes.AddShape(1, 120, 120, 50, 50); $invisible.Visible = 0
    $target.Select(-1)
    $script:bridge = $bridgeType.GetConstructors()[0].Invoke([object[]]@($app.PSObject.BaseObject))
    $shape = Read-Selection
    $payload = Target-Payload $shape
    $background = Invoke-Bridge 'CaptureBackground' $payload
    $stream = New-Object IO.MemoryStream(,[Convert]::FromBase64String($background))
    $bitmap = [Drawing.Bitmap]::FromStream($stream)
    $pixel = $bitmap.GetPixel([int](200 * $bitmap.Width / $deck.PageSetup.SlideWidth), [int](150 * $bitmap.Height / $deck.PageSetup.SlideHeight))
    Assert-True ($pixel.B -gt 240 -and $pixel.R -lt 10) 'Capture excludes both the target and the red upper layer'
    $bitmap.Dispose(); $stream.Dispose()
    Assert-True ($target.Visible -eq -1 -and $upper.Visible -eq -1 -and $invisible.Visible -eq 0) 'Original layer visibility restored, including a pre-hidden upper shape'
    $after = Read-Selection
    Assert-True ($after['id'] -eq $shape['id']) 'Capture preserves the selected shape'
    Invoke-Bridge 'RemoveOutline' $payload | Out-Null
    Assert-True ($target.Line.Visible -eq 0) 'Remove outline changes the native shape line'
    $payload['pngBase64'] = $background
    $payload['settings'] = $json.DeserializeObject('{"schemaVersion":1}')
    $applied = $json.DeserializeObject($json.Serialize((Invoke-Bridge 'ApplyFill' $payload)))
    Assert-True $applied['applied'] 'Valid frame writes to the original selected shape'
    $target.Left = 110
    $stale = $json.DeserializeObject($json.Serialize((Invoke-Bridge 'ApplyFill' $payload)))
    Assert-True (-not $stale['applied']) 'Moved geometry rejects a stale frame'
    $other = $app.Presentations.Add(-1)
    $otherSlide = $other.Slides.Add(1, 12)
    $otherShape = $otherSlide.Shapes.AddShape(5, 100, 100, 200, 100); $otherShape.Select(-1)
    $wrongDeck = $json.DeserializeObject($json.Serialize((Invoke-Bridge 'ApplyFill' $payload)))
    Assert-True (-not $wrongDeck['applied']) 'Another presentation rejects the old document frame'
    $triangle = $otherSlide.Shapes.AddShape(7, 100, 100, 100, 100); $triangle.Select(-1)
    $rejected = $false
    try { Invoke-Bridge 'InspectSelection' $null | Out-Null } catch { $rejected = $_.Exception.Message -match '\u6b63\u5706|\u5706\u89d2\u77e9\u5f62' }
    Assert-True $rejected 'Unsupported triangle returns an actionable selection error'
    $ribbon = [Activator]::CreateInstance($assembly.GetType('LiquidSlide.ComAddin.ComAddin'))
    [xml]$xml = $ribbon.GetCustomUI('Microsoft.PowerPoint.Presentation')
    Assert-True ($xml.customUI.ribbon.tabs.tab.group.button.Count -eq 5) 'Ribbon resource contains four materials and the panel command'
    foreach ($button in $xml.customUI.ribbon.tabs.tab.group.button) {
        $imageMethod = $assembly.GetType('LiquidSlide.ComAddin.RibbonImages').GetMethod('Get', [Reflection.BindingFlags]'Static,NonPublic')
        $icon = $imageMethod.Invoke($null, [object[]]@([string]$button.tag))
        Assert-True ($null -ne $icon) "Ribbon icon available: $($button.tag)"
    }
    $success = $true
} finally {
    if ($other) { $other.Saved = -1; $other.Close() }
    if ($KeepOpen -and $success) {
        $deck.Windows[1].Activate()
        for ($tagIndex = $target.Tags.Count; $tagIndex -ge 1; $tagIndex--) {
            if ($target.Tags.Name($tagIndex).StartsWith('LIQUIDSLIDE_SETTINGS_V1_')) { $target.Tags.Delete($target.Tags.Name($tagIndex)) }
        }
        $sample = Join-Path $PSScriptRoot '..\assets\preview-background.jpg'
        if (Test-Path -LiteralPath $sample) { $lower.Fill.UserPicture((Resolve-Path $sample).Path) }
        $upper.Width = 70; $upper.Height = 30; $upper.Left = 260; $upper.Top = 85
        $target.Select(-1)
        Write-Output 'The isolated test deck is open for UI acceptance. It contains no user content.'
    } else {
        if ($deck) { $deck.Saved = -1; $deck.Close() }
        if ($app) { $app.Quit(); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) | Out-Null }
    }
}
