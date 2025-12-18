#requires -Version 7
Param(
  [string]$SourcePath = (Join-Path $PSScriptRoot "..\\img\\fixed.png"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\\public\\img")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "Source logo not found: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-CenteredSquareCrop([System.Drawing.Image]$image) {
  $size = [Math]::Min($image.Width, $image.Height)
  $srcX = [int](($image.Width - $size) / 2)
  $srcY = [int](($image.Height - $size) / 2)
  $srcRect = New-Object System.Drawing.Rectangle $srcX, $srcY, $size, $size
  $destRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size

  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($image, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $bmp
}

function New-CircularMask([System.Drawing.Image]$squareImage) {
  $size = $squareImage.Width
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $path.AddEllipse(0, 0, $size, $size) | Out-Null
    $g.SetClip($path)
    $g.DrawImage($squareImage, 0, 0, $size, $size)
    $g.ResetClip()
  } finally {
    $path.Dispose()
    $g.Dispose()
  }
  return $bmp
}

function Resize-Png([System.Drawing.Image]$image, [int]$size, [string]$destPath, [int]$paddingPx) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $inner = $size - (2 * $paddingPx)
  $g.DrawImage($image, $paddingPx, $paddingPx, $inner, $inner)
  $g.Dispose()

  $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$src = [System.Drawing.Image]::FromFile($SourcePath)
try {
  $square = New-CenteredSquareCrop $src
  try {
    $masked = New-CircularMask $square
    try {
      Resize-Png $masked 512 (Join-Path $OutDir "ntr-logo.png") 0
      Resize-Png $masked 64 (Join-Path $OutDir "ntr-logo-64.png") 3
      Resize-Png $masked 32 (Join-Path $OutDir "ntr-logo-32.png") 2
    } finally {
      $masked.Dispose()
    }
  } finally {
    $square.Dispose()
  }
} finally {
  $src.Dispose()
}

Write-Host "Generated logo assets in $OutDir" -ForegroundColor Green
