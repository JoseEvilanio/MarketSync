Add-Type -AssemblyName System.Drawing

$width  = 164
$height = 314
$outFile = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "welcome.bmp"

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g   = [System.Drawing.Graphics]::FromImage($bmp)

# Fundo gradiente verde escuro -> verde medio
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.Point]::new(0, 0),
    [System.Drawing.Point]::new(0, $height),
    [System.Drawing.Color]::FromArgb(22, 101, 52),
    [System.Drawing.Color]::FromArgb(34, 197, 94)
)
$g.FillRectangle($brush, 0, 0, $width, $height)

# Texto "MercadoPro" centralizado
$font      = New-Object System.Drawing.Font("Arial", 13, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Arial", 8,  [System.Drawing.FontStyle]::Regular)
$white     = [System.Drawing.Brushes]::White

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$g.DrawString("MercadoPro", $font, $white, [System.Drawing.RectangleF]::new(0, 120, $width, 40), $sf)
$g.DrawString("ERP Local", $fontSmall, $white, [System.Drawing.RectangleF]::new(0, 155, $width, 25), $sf)
$g.DrawString("v1.0", $fontSmall, $white, [System.Drawing.RectangleF]::new(0, 175, $width, 25), $sf)

$g.Dispose()
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

Write-Host "BMP salvo: $outFile ($((Get-Item $outFile).Length) bytes)"
