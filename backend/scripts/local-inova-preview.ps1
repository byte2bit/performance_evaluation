param(
    [ValidateSet('Check', 'Start', 'Status', 'VerifyScopes', 'Stop')][string]$Action = 'Check',
    [string]$Confirmation
)
$ErrorActionPreference = 'Stop'
$stage = 'confirmation'
$directory = Join-Path $env:LOCALAPPDATA 'EvaluationDev/inova-nucleo-compat-20261029'
$script = Join-Path $PSScriptRoot 'local-inova-preview.js'
$previous = @{}
$values = @{}
$rootSecrets = @{}
$previewSecrets = @{}
try {
    if ($Confirmation -cne 'inova_nucleo_compat_20261029:3306:maps-e3-owner12-exact395-preview') { throw 'Explicit E3 confirmation required.' }
    $profile = [IO.File]::ReadAllText((Join-Path $directory 'profile.json')) | ConvertFrom-Json
    if ($profile.kind -cne 'evaluation-local-mysql-copy-v1' -or $profile.host -cne '127.0.0.1' -or $profile.port -ne 3306 -or $profile.target -cne 'inova_nucleo_compat_20261029' -or $profile.id -cnotmatch '^[a-f0-9]{32}$') { throw 'Profile refused.' }
    if ($Action -eq 'Stop') {
        $stage = 'verify-owned-preview-processes'
        $runtimeFile = Join-Path $directory 'inova-preview-runtime.json'
        $runtime = [IO.File]::ReadAllText($runtimeFile) | ConvertFrom-Json
        if ($runtime.profileId -cne $profile.id -or $runtime.target -cne $profile.target) { throw 'Runtime identity refused.' }
        $frontendScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../frontend/scripts/serve-inova-preview.mjs'))
        foreach ($entry in @(@{ Id = $runtime.apiPid; Script = $script }, @{ Id = $runtime.frontendPid; Script = $frontendScript })) {
            $owned = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$entry.Id)
            if ($owned) {
                if ([IO.Path]::GetFileName($owned.ExecutablePath) -cne 'node.exe' -or !$owned.CommandLine.Contains($entry.Script) -or !$owned.CommandLine.Contains($directory)) { throw 'Process ownership refused; no stop attempted for that process.' }
                Stop-Process -Id ([int]$entry.Id) -ErrorAction Stop
            }
        }
        [pscustomobject]@{ success = $true; stoppedOnlyOwnedPreview = $true; primaryPreserved = $true } | ConvertTo-Json
        return
    }
    $stage = 'read-inventory-key'
    $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $directory 'secrets.dpapi')), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { $rootSecrets = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
    $values.EVAL_LOCAL_COPY_INVENTORY_SECRET = $rootSecrets.inventory
    $previous.EVAL_LOCAL_COPY_INVENTORY_SECRET = [Environment]::GetEnvironmentVariable('EVAL_LOCAL_COPY_INVENTORY_SECRET', 'Process')
    [Environment]::SetEnvironmentVariable('EVAL_LOCAL_COPY_INVENTORY_SECRET', $rootSecrets.inventory, 'Process')
    $operation = if ($Action -eq 'VerifyScopes') { 'verify-scopes' } else { 'check' }
    & node $script $operation $directory
    if ($LASTEXITCODE -ne 0) { throw 'Preview validation failed.' }
    if ($Action -in @('Check', 'VerifyScopes')) { return }
    if ($Action -eq 'Status') {
        $apiReady = $false
        $frontendReady = $false
        $runtime = [IO.File]::ReadAllText((Join-Path $directory 'inova-preview-runtime.json')) | ConvertFrom-Json
        if ($runtime.profileId -cne $profile.id -or $runtime.target -cne $profile.target) { throw 'Runtime identity refused.' }
        try { $response = Invoke-RestMethod 'http://127.0.0.1:8002/__inova_preview' -NoProxy -TimeoutSec 3; $apiReady = $response.nonce -ceq $runtime.nonce -and $response.pid -eq $runtime.apiPid } catch {}
        try { $response = Invoke-RestMethod 'http://127.0.0.1:5174/__inova_preview' -NoProxy -TimeoutSec 3; $frontendReady = $response.nonce -ceq $runtime.nonce -and $response.pid -eq $runtime.frontendPid } catch {}
        [pscustomobject]@{ success = $true; apiReady = $apiReady; frontendReady = $frontendReady; primaryPreserved = $true } | ConvertTo-Json
        return
    }
    $stage = 'preview-vault'
    $vault = Join-Path $directory 'inova-preview-secrets.dpapi'
    $entropy = [Text.Encoding]::UTF8.GetBytes(($profile.id + ':' + $profile.target + ':preview-v1'))
    if (Test-Path -LiteralPath $vault) {
        $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($vault), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        try { $previewSecrets = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
        finally { [Array]::Clear($plain, 0, $plain.Length) }
    } else {
        $previewSecrets = @{ kind = 'evaluation-inova-preview-v1'; profileId = $profile.id; target = $profile.target; serverUuid = $profile.serverUuid;
            session = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant();
            rate = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
        $plain = [Text.Encoding]::UTF8.GetBytes(($previewSecrets | ConvertTo-Json -Compress))
        try {
            $protected = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            $stream = [IO.File]::Open($vault, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $stream.Write($protected, 0, $protected.Length) } finally { $stream.Dispose() }
        } finally { [Array]::Clear($plain, 0, $plain.Length) }
    }
    if ($previewSecrets.kind -cne 'evaluation-inova-preview-v1' -or $previewSecrets.profileId -cne $profile.id -or $previewSecrets.target -cne $profile.target -or $previewSecrets.serverUuid -cne $profile.serverUuid -or
        $previewSecrets.session -cnotmatch '^[a-f0-9]{64}$' -or $previewSecrets.rate -cnotmatch '^[a-f0-9]{64}$' -or $previewSecrets.session -ceq $previewSecrets.rate) { throw 'Preview vault refused.' }
    $values.EVAL_INOVA_SESSION = $previewSecrets.session
    $values.EVAL_INOVA_RATE = $previewSecrets.rate
    foreach ($name in @('EVAL_INOVA_SESSION', 'EVAL_INOVA_RATE')) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    $stage = 'start-owned-preview'
    & node $script start $directory
    if ($LASTEXITCODE -ne 0) { throw 'Preview start failed; preserve vault and logs.' }
} catch {
    [pscustomobject]@{ success = $false; stage = $stage; details = 'Local preview failed; sensitive diagnostics suppressed. Preserve artifacts; primary and source were not changed by this launcher.' } | ConvertTo-Json
    exit 1
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $values.Clear(); $rootSecrets.Clear(); $previewSecrets.Clear()
}
