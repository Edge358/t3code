$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = Join-Path $repoRoot '.local\profile'
if (-not (Test-Path -LiteralPath $profileRoot -PathType Container)) {
    throw "No private profile at $profileRoot."
}
$launchRecord = Join-Path $repoRoot '.local\records\launch.json'
if (Test-Path -LiteralPath $launchRecord) {
    $record = Get-Content -LiteralPath $launchRecord -Raw | ConvertFrom-Json
    $running = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if ($running -and $running.StartTime.ToUniversalTime().ToString('o') -eq $record.processStartedAt) {
        throw 'Close the private T3 app before backing up its profile.'
    }
}
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$backupRoot = Join-Path $env:USERPROFILE 'T3PrivateBackups'
$destination = Join-Path $backupRoot "profile-$stamp"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
# /E copies empty folders too; /R:2 /W:2 keeps a locked file from stalling the run.
& robocopy.exe $profileRoot $destination /E /R:2 /W:2 /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy reported failures (exit $LASTEXITCODE); check $destination."
}
$count = (Get-ChildItem -LiteralPath $destination -Recurse -File | Measure-Object).Count
Write-Output "Copied $count files to $destination"
