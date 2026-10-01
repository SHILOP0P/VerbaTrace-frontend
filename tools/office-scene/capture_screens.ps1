<#
.SYNOPSIS
  Photographs each demo screen at its starting position for the 3D office.

.DESCRIPTION
  The monitors in the landing's office carry the live product in an iframe, but
  only while the camera looks straight at them: the page is placed by a plain 2D
  box, which matches the glass in no other position. Everywhere else the glass
  needs a picture, and a blank rectangle reads as a monitor that is switched off.

  This takes one shot of every screen in both themes, exactly as the recording
  starts, and writes them small enough to ship. Re-run it after a redesign.

  The dev server must be running (npm run dev, 127.0.0.1:5173).

.EXAMPLE
  pwsh tools/office-scene/capture_screens.ps1
#>
[CmdletBinding()]
param(
  [string]$Origin = "http://127.0.0.1:5173",
  [int]$Width = 1400,
  [int]$Height = 787,
  # What is stored: a quarter of the pixels is plenty for glass that is never
  # read at this size, and the live page takes over the moment it could be.
  [int]$OutWidth = 700,
  [int]$Quality = 72,
  [string]$OutDir = "$PSScriptRoot/../../public/assets/scene/screens"
)

$ErrorActionPreference = "Stop"

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "No Chrome or Edge found to take the screenshots with." }

try { Invoke-WebRequest -Uri $Origin -TimeoutSec 5 -UseBasicParsing | Out-Null }
catch { throw "The dev server is not answering at $Origin. Start it with npm run dev." }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("vt-screens-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

Add-Type -AssemblyName System.Drawing

function Save-Small {
  param([string]$Source, [string]$Destination, [int]$TargetWidth, [int]$JpegQuality)

  $image = [System.Drawing.Image]::FromFile($Source)
  try {
    $height = [int][math]::Round($image.Height * ($TargetWidth / $image.Width))
    $small = New-Object System.Drawing.Bitmap $TargetWidth, $height
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($small)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($image, 0, 0, $TargetWidth, $height)
      $graphics.Dispose()

      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
      $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
      $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$JpegQuality)
      $small.Save($Destination, $codec, $parameters)
      $parameters.Dispose()
    } finally { $small.Dispose() }
  } finally { $image.Dispose() }
}

$roles = @("employee", "leader", "deputy", "owner")
$themes = @("light", "dark")

foreach ($role in $roles) {
  foreach ($theme in $themes) {
    $raw = Join-Path $temp "$role-$theme.png"
    $url = "$Origin/demo.html?role=$role&theme=$theme"
    $profile = Join-Path $temp "profile-$role-$theme"

    & $chrome `
      --headless=new `
      --disable-gpu `
      --hide-scrollbars `
      --no-first-run `
      --no-default-browser-check `
      --user-data-dir="$profile" `
      --window-size="$Width,$Height" `
      --virtual-time-budget=9000 `
      --screenshot="$raw" `
      $url 2>$null | Out-Null

    if (-not (Test-Path $raw)) { throw "Chrome took no picture of $role/$theme." }

    $out = Join-Path $OutDir "$role-$theme.jpg"
    Save-Small -Source $raw -Destination $out -TargetWidth $OutWidth -JpegQuality $Quality
    $size = [int]((Get-Item $out).Length / 1KB)
    Write-Host ("{0,-9} {1,-5} -> {2} ({3} KB)" -f $role, $theme, (Split-Path $out -Leaf), $size)
  }
}

Remove-Item -Recurse -Force $temp
Write-Host "Done. Screens written to $OutDir"
