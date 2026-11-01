$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $repoRoot '.local'
$appExecutable = Join-Path $localRoot 'builds\current\win-unpacked\T3 Code (Beta).exe'
$profileRoot = Join-Path $localRoot 'profile'
$recordRoot = Join-Path $localRoot 'records'
$existingRecordPath = Join-Path $recordRoot 'launch.json'
if (Test-Path -LiteralPath $existingRecordPath) {
    $existingRecord = Get-Content -LiteralPath $existingRecordPath -Raw | ConvertFrom-Json
    $existingProcess = Get-Process -Id $existingRecord.pid -ErrorAction SilentlyContinue
    if ($existingProcess -and $existingProcess.Path -eq $appExecutable -and
        $existingProcess.StartTime.ToUniversalTime().ToString('o') -eq $existingRecord.processStartedAt) {
        Write-Output 'The private T3 app is already open.'
        return
    }
}
if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw 'Build the private Windows app first. See CUSTOM_CHANGES.md.'
}
New-Item -ItemType Directory -Force -Path $profileRoot, $recordRoot | Out-Null
$env:APPDATA = Join-Path $profileRoot 'appdata'
$env:T3CODE_HOME = Join-Path $profileRoot 't3-data'
$env:T3CODE_TELEMETRY_ENABLED = 'false'
$env:T3CODE_OTEL_SDK_DISABLED = 'true'
$env:OTEL_SDK_DISABLED = 'true'
$env:T3CODE_DISABLE_AUTO_UPDATE = 'true'
New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:T3CODE_HOME | Out-Null
# The user-facing app is intentionally visible; no debug port is enabled.
$appProcess = Start-Process -FilePath $appExecutable -WorkingDirectory $repoRoot -PassThru
$launchRecord = [ordered]@{
    pid = $appProcess.Id
    exe = $appExecutable
    profileBase = $profileRoot
    appData = $env:APPDATA
    t3Home = $env:T3CODE_HOME
    workingDirectory = $repoRoot
    launchedAt = (Get-Date).ToUniversalTime().ToString('o')
    processStartedAt = $appProcess.StartTime.ToUniversalTime().ToString('o')
    debugPortEnabled = $false
}
[System.IO.File]::WriteAllText(
    (Join-Path $recordRoot 'launch.json'),
    (($launchRecord | ConvertTo-Json) -replace "`r`n", "`n") + "`n",
    [System.Text.UTF8Encoding]::new($false)
)
Write-Output "Opened the repository's private T3 build (PID $($appProcess.Id))."
