# Makes the demo-mode video for a golden fixture (ADR 0010, step 2 of the product plan).
# The fixture's frames.json says what is on screen and when; transcript.json says what is spoken
# and when. This draws each frame's on-screen text from its timestamp until the next frame, and
# has Windows text-to-speech read each transcript line at its start time. So the video, the
# recorded transcript and the recorded frames all agree. No third-party media: plain colour,
# Arial from Windows, and the system voice. Needs ffmpeg 7 or later (for the -/option file syntax) and ffprobe on the PATH.
# Usage: powershell -File scripts\make-scenario-clip.ps1 [-Fixture proofpay-demo] [-Out <path>]
param(
  [string]$Fixture = "proofpay-demo",
  [string]$Out = ""
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root "fixtures\golden\$Fixture"
if (-not $Out) { $Out = Join-Path $root "apps\web\public\scenarios\proofpay-v1\video.mp4" }
$asset = Get-Content (Join-Path $dir "asset-version.json") -Raw | ConvertFrom-Json
# Windows PowerShell 5.1 returns a JSON array as one object: assign it first, then enumerate.
$rawFrames = Get-Content (Join-Path $dir "frames.json") -Raw | ConvertFrom-Json
$frames = @($rawFrames | Sort-Object timestampMs)
$rawLines = Get-Content (Join-Path $dir "transcript.json") -Raw | ConvertFrom-Json
$lines = @($rawLines | Sort-Object startMs)
$totalS = $asset.durationMs / 1000.0

$work = Join-Path $env:TEMP "sleuth-scenario-clip"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work | Out-Null
New-Item -ItemType Directory -Path (Split-Path $Out -Parent) -Force | Out-Null
Push-Location $work
try {
  Copy-Item "C:\Windows\Fonts\arial.ttf" "font.ttf" -Force

  # Video: one drawtext per on-screen line, enabled from its frame's time until the next frame.
  $filters = @()
  for ($i = 0; $i -lt $frames.Count; $i++) {
    $from = $frames[$i].timestampMs / 1000.0
    $to = if ($i + 1 -lt $frames.Count) { $frames[$i + 1].timestampMs / 1000.0 } else { $totalS }
    $y = 200
    $k = 0
    foreach ($text in $frames[$i].onScreenText) {
      $txt = "f${i}_$k.txt"
      [IO.File]::WriteAllText((Join-Path $work $txt), $text)
      $size = if ($k -eq 0) { 84 } else { 60 }
      $filters += "drawtext=fontfile=font.ttf:textfile=${txt}:fontsize=${size}:fontcolor=white:x=96:y=${y}:enable='between(t,$from,$to)'"
      $y += 110
      $k++
    }
  }
  [IO.File]::WriteAllText((Join-Path $work "video.filter"), ($filters -join ",`n"))
  & ffmpeg -nostdin -y -v error -f lavfi -i "color=c=0x1c2a36:s=1280x720:d=${totalS}:r=10" `
    -/vf video.filter -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p video.mp4
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on the picture" }

  # Audio: each spoken line as its own wave file, delayed to its start time, then mixed.
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $inputs = @()
  $chains = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $wav = "l$i.wav"
    $synth.SetOutputToWaveFile((Join-Path $work $wav))
    $synth.Speak($lines[$i].text)
    $synth.SetOutputToNull()
    $inputs += @("-i", $wav)
    $chains += "[${i}:a]aresample=44100,adelay=$($lines[$i].startMs)|$($lines[$i].startMs)[a$i]"
  }
  $synth.Dispose()
  $mix = ($chains -join ";") + ";" + ((0..($lines.Count - 1) | ForEach-Object { "[a$_]" }) -join "") +
    "amix=inputs=$($lines.Count):normalize=0,apad,atrim=0:${totalS}[aout]"
  [IO.File]::WriteAllText((Join-Path $work "audio.filter"), $mix)
  & ffmpeg -nostdin -y -v error @inputs -/filter_complex audio.filter -map "[aout]" -ac 1 -c:a aac -b:a 64k audio.m4a
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on the sound" }

  & ffmpeg -nostdin -y -v error -i video.mp4 -i audio.m4a -c copy -shortest -movflags +faststart $Out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed joining picture and sound" }
} finally {
  Pop-Location
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
$len = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $Out)
$kb = [math]::Round((Get-Item $Out).Length / 1KB)
Write-Output ("clip ready: {0:N1} s, {1} KB, {2}" -f $len, $kb, $Out)
