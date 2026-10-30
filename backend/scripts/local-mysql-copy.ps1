param(
    [ValidateSet('Preflight', 'CreateCopy', 'InspectCopy', 'PreflightCompatibility', 'ApplyCompatibility', 'PreflightAccess', 'ActivateAccess', 'PreflightMaps', 'ApplyMaps')][string]$Action = 'Preflight',
    [string]$Confirmation
)
$ErrorActionPreference = 'Stop'
$stage = 'confirmation'
$directory = Join-Path $env:LOCALAPPDATA 'EvaluationDev/inova-nucleo-compat-20261029'
$script = Join-Path $PSScriptRoot 'local-mysql-copy.js'
$previous = @{}
$secrets = @{}
$values = @{}
try {
    if ($Action -in @('PreflightCompatibility', 'ApplyCompatibility', 'PreflightAccess', 'ActivateAccess', 'PreflightMaps', 'ApplyMaps')) {
        $accessAction = $Action -in @('PreflightAccess', 'ActivateAccess')
        $mapsAction = $Action -in @('PreflightMaps', 'ApplyMaps')
        $expectedConfirmation = if ($mapsAction) { 'inova_nucleo_compat_20261029:3306:maps-e3-owner12-exact395-preview' } elseif ($accessAction) { 'inova_nucleo_compat_20261029:3306:access-e2b-all25' } else { 'inova_nucleo_compat_20261029:3306:compatibility-e1-only' }
        if ($Confirmation -cne $expectedConfirmation) { throw 'Explicit stage confirmation is required.' }
        $stage = 'read-protected-operation-keys'
        $encrypted = [IO.File]::ReadAllBytes((Join-Path $directory 'secrets.dpapi'))
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        try { $secrets = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
        finally { [Array]::Clear($plain, 0, $plain.Length) }
        $values = @{ EVAL_LOCAL_COPY_INVENTORY_SECRET = $secrets.inventory; EVAL_LOCAL_COPY_BACKUP_KEY = $secrets.backup }
        if ($mapsAction) { $values.EVAL_LOCAL_MAPS_CONFIRMATION = $Confirmation }
        elseif ($accessAction) { $values.EVAL_LOCAL_ACCESS_CONFIRMATION = $Confirmation }
        else { $values.EVAL_LOCAL_COMPAT_CONFIRMATION = $Confirmation }
        foreach ($name in $values.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
        }
        $operation = if ($Action -in @('ApplyCompatibility', 'ApplyMaps')) { 'apply' } elseif ($Action -eq 'ActivateAccess') { 'activate' } else { 'preflight' }
        $operationScript = if ($mapsAction) { 'local-inova-maps.js' } elseif ($accessAction) { 'local-mysql-access.js' } else { 'local-mysql-compat.js' }
        & node (Join-Path $PSScriptRoot $operationScript) $operation $directory
        if ($LASTEXITCODE -ne 0) { throw 'Compatibility failed; preserve profile and artifacts.' }
        return
    }
    if ($Action -ne 'Preflight' -and $Confirmation -cne 'inova_nucleo:3306->inova_nucleo_compat_20261029:copy-only') {
        throw 'Explicit copy confirmation is required.'
    }
    if ($Action -eq 'InspectCopy') {
        $stage = 'read-protected-review-key'
        $encrypted = [IO.File]::ReadAllBytes((Join-Path $directory 'secrets.dpapi'))
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        try { $secrets = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
        finally { [Array]::Clear($plain, 0, $plain.Length) }
        $values = @{ EVAL_LOCAL_COPY_INVENTORY_SECRET = $secrets.inventory; EVAL_LOCAL_COPY_CONFIRMATION = $Confirmation }
        foreach ($name in $values.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
        }
        & node (Join-Path $PSScriptRoot 'local-mysql-review.js') $directory
        if ($LASTEXITCODE -ne 0) { throw 'Copy review failed; details remain private.' }
        return
    }
    $stage = 'preflight'
    $preflightText = & node $script preflight
    if ($LASTEXITCODE -ne 0) { throw 'Copy preflight failed.' }
    $preflight = $preflightText | ConvertFrom-Json
    if ($preflight.success -ne $true) { throw 'Copy preflight failed.' }
    if ($Action -eq 'Preflight') { $preflight | ConvertTo-Json -Depth 5; return }
    $stage = 'protected-profile'
    if (Test-Path -LiteralPath $directory) { throw 'Existing profiles must be preserved.' }
    New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $directory -AclObject $acl
    $id = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16)).ToLowerInvariant()
    foreach ($name in @('backup', 'inventory')) { $secrets[$name] = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
    $plain = [Text.Encoding]::UTF8.GetBytes(($secrets | ConvertTo-Json -Compress))
    try {
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes((Join-Path $directory 'secrets.dpapi'), $encrypted)
    } finally { [Array]::Clear($plain, 0, $plain.Length) }
    @{ kind = 'evaluation-local-mysql-copy-v1'; id = $id; host = '127.0.0.1'; port = 3306;
        source = 'inova_nucleo'; target = 'inova_nucleo_compat_20261029'; serverUuid = $preflight.serverUuid;
        createdUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'profile.json') -Encoding utf8
    $values = @{ EVAL_LOCAL_COPY_BACKUP_KEY = $secrets.backup; EVAL_LOCAL_COPY_INVENTORY_SECRET = $secrets.inventory; EVAL_LOCAL_COPY_CONFIRMATION = $Confirmation }
    foreach ($name in $values.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    $stage = 'copy'
    & node $script copy $directory
    if ($LASTEXITCODE -ne 0) { throw 'Copy failed; preserve profile and artifacts.' }
} catch {
    [pscustomobject]@{ success = $false; stage = $stage; details = 'Operation failed; source was not modified by this launcher. Inspect only sanitized diagnostics; preserve all artifacts.' } | ConvertTo-Json
    exit 1
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $secrets.Clear()
    if ($values) { $values.Clear() }
}
