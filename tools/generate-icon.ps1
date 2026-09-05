Add-Type -AssemblyName System.Drawing
$output = Join-Path $PSScriptRoot "..\assets\icon-32.png"
$bitmap = [System.Drawing.Bitmap]::new(32, 32)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(23, 91, 196))
$glassBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(105, 255, 255, 255))
$glassPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(205, 255, 255, 255), 1.5)
$graphics.FillEllipse($glassBrush, 7, 5, 18, 22)
$graphics.DrawEllipse($glassPen, 7, 5, 18, 22)
$highlightPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230, 255, 255, 255), 1.2)
$graphics.DrawArc($highlightPen, 10, 8, 12, 8, 200, 135)
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$highlightPen.Dispose()
$glassPen.Dispose()
$glassBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
