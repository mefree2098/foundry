#requires -Version 7
Param(
  [string]$SourcePath = (Join-Path $PSScriptRoot "..\\img\\ntrlogo1.PNG"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\\public\\img")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "Source logo not found: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-SquareCanvas([System.Drawing.Image]$image) {
  $size = [Math]::Max($image.Width, $image.Height)
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.Clear([System.Drawing.Color]::Transparent)
  $x = [int](($size - $image.Width) / 2)
  $y = [int](($size - $image.Height) / 2)
  $g.DrawImage($image, $x, $y, $image.Width, $image.Height)
  $g.Dispose()
  return $bmp
}

function Resize-Png([System.Drawing.Image]$image, [int]$size, [string]$destPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($image, 0, 0, $size, $size)
  $g.Dispose()

  $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$src = [System.Drawing.Image]::FromFile($SourcePath)
try {
  $square = New-SquareCanvas $src
  try {
    Resize-Png $square 512 (Join-Path $OutDir "ntr-logo.png")
    Resize-Png $square 64 (Join-Path $OutDir "ntr-logo-64.png")
    Resize-Png $square 32 (Join-Path $OutDir "ntr-logo-32.png")
  } finally {
    $square.Dispose()
  }
} finally {
  $src.Dispose()
}

Write-Host "Generated logo assets in $OutDir" -ForegroundColor Green

