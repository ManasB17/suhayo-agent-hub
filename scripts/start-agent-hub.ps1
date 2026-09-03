$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$tokenPath = Join-Path $projectRoot '.agent-hub-token'
$pidPath = Join-Path $projectRoot '.host-runner.pid'

docker info *> $null

if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [System.IO.File]::WriteAllText(
        $tokenPath,
        [Convert]::ToHexString($bytes).ToLowerInvariant()
    )
}

$runnerToken = [System.IO.File]::ReadAllText($tokenPath).Trim()
$env:AGENT_HUB_RUNNER_TOKEN = $runnerToken
docker compose --project-directory $projectRoot up --detach --build

$health = $null
$deadline = [DateTime]::UtcNow.AddSeconds(60)
do {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:4317/health'
        if ($health.status -eq 'ok') { break }
    } catch {
        Start-Sleep -Milliseconds 500
    }
} while ([DateTime]::UtcNow -lt $deadline)

if ($null -eq $health -or $health.status -ne 'ok') {
    throw 'Agent Hub coordinator did not become healthy within 60 seconds.'
}

$runnerActive = $false
if (Test-Path -LiteralPath $pidPath) {
    $savedPid = [int][System.IO.File]::ReadAllText($pidPath)
    $runnerActive = $null -ne (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)
}

if (-not $runnerActive) {
    $runnerOptions = @{
        FilePath = 'node'
        ArgumentList = 'host-runner.mjs'
        WorkingDirectory = $projectRoot
        WindowStyle = 'Hidden'
        Environment = @{
            AGENT_HUB_URL = 'http://127.0.0.1:4317'
            AGENT_HUB_RUNNER_TOKEN = $runnerToken
        }
        PassThru = $true
    }
    $runner = Start-Process @runnerOptions
    [System.IO.File]::WriteAllText($pidPath, $runner.Id.ToString())
}

Start-Process 'http://127.0.0.1:4317/'
