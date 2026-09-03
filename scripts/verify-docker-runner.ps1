$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "agent-hub-e2e-$PID"
$fakeProvider = Join-Path $fixtureRoot 'fake-claude.ps1'
$testConfig = Join-Path $fixtureRoot 'config.json'
$runnerOutput = Join-Path $fixtureRoot 'runner.out.log'
$runnerError = Join-Path $fixtureRoot 'runner.err.log'
$containerName = "agent-hub-e2e-$PID"
$port = 4321
$token = 'e2e-runner-token-with-at-least-thirty-two-characters'
$runnerProcess = $null

New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
@'
$resumed = $args -contains '--resume'
$result = if ($resumed) { 'E2E_RESUMED' } else { 'E2E_STARTED' }
@{
    type = 'result'
    result = $result
    session_id = '11111111-1111-4111-8111-111111111111'
} | ConvertTo-Json -Compress
'@ | Set-Content -LiteralPath $fakeProvider -Encoding utf8

@{
    port = 4317
    agents = @{
        claude = @{
            enabled = $true
            command = $fakeProvider
            workspace = $projectRoot
            adapter = 'claude'
            role = 'architect'
            aliases = @()
        }
    }
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $testConfig -Encoding utf8

function Wait-ForCondition {
    param([scriptblock]$Condition, [string]$FailureMessage)
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if (& $Condition) { return }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $FailureMessage
}

try {
    docker run --detach --rm `
        --name $containerName `
        --publish "127.0.0.1:${port}:4317" `
        --env AGENT_HUB_BIND=0.0.0.0 `
        --env AGENT_HUB_REMOTE_RUNNER=true `
        --env AGENT_HUB_RUNNER_TOKEN=$token `
        --volume "${testConfig}:/app/config.json:ro" `
        suhayo-agent-hub-coordinator:latest | Out-Null

    Wait-ForCondition {
        try { (Invoke-RestMethod "http://127.0.0.1:$port/health").status -eq 'ok' }
        catch { $false }
    } 'Docker coordinator did not become healthy.'

    $runnerOptions = @{
        FilePath = 'node'
        ArgumentList = 'host-runner.mjs'
        WorkingDirectory = $projectRoot
        WindowStyle = 'Hidden'
        Environment = @{
            AGENT_HUB_URL = "http://127.0.0.1:$port"
            AGENT_HUB_RUNNER_TOKEN = $token
        }
        RedirectStandardOutput = $runnerOutput
        RedirectStandardError = $runnerError
        PassThru = $true
    }
    $runnerProcess = Start-Process @runnerOptions

    $headers = @{ 'Content-Type' = 'application/json' }
    Invoke-RestMethod "http://127.0.0.1:$port/api/messages" `
        -Method Post -Headers $headers `
        -Body (@{ text = '@claude "First turn."' } | ConvertTo-Json) | Out-Null
    Wait-ForCondition {
        $state = Invoke-RestMethod "http://127.0.0.1:$port/api/state"
        $state.runs.Count -eq 1 -and $state.runs[0].status -eq 'SUCCEEDED'
    } 'First host-runner turn did not succeed.'

    Invoke-RestMethod "http://127.0.0.1:$port/api/messages" `
        -Method Post -Headers $headers `
        -Body (@{ text = '@claude "Second turn."' } | ConvertTo-Json) | Out-Null
    Wait-ForCondition {
        $state = Invoke-RestMethod "http://127.0.0.1:$port/api/state"
        $state.runs.Count -eq 2 -and $state.runs[1].status -eq 'SUCCEEDED'
    } 'Resumed host-runner turn did not succeed.'

    $state = Invoke-RestMethod "http://127.0.0.1:$port/api/state"
    $responses = @($state.tasks[0].messages | Where-Object type -eq 'response')
    if ($responses[0].text -ne 'E2E_STARTED') { throw 'First turn did not start.' }
    if ($responses[1].text -ne 'E2E_RESUMED') { throw 'Second turn did not resume.' }
    if ($state.sessions.claude.id -ne '11111111-1111-4111-8111-111111111111') {
        throw 'Provider session ID was not persisted.'
    }

    [pscustomobject]@{
        ContainerHealth = 'ok'
        NativeRunner = 'connected'
        FirstTurn = $responses[0].text
        SecondTurn = $responses[1].text
        SessionPersisted = $true
        RunsSucceeded = 2
    } | Format-List
} finally {
    if ($null -ne $runnerProcess -and -not $runnerProcess.HasExited) {
        Stop-Process -Id $runnerProcess.Id -Force
    }
    docker rm --force $containerName 2>$null | Out-Null
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedFixture.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove test fixture outside the temporary directory: $resolvedFixture"
    }
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
}
