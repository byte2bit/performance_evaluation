param(
    [ValidateSet('Initialize', 'Start', 'NewSchema', 'Validate', 'RecoveryTest', 'VisualReview', 'Stop', 'Serve', 'Info')]
    [string]$Action = 'Info',
    [string]$ProfileDirectory,
    [string]$MySqlBinary = 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe',
    [string]$VisualToolDirectory
)

$ErrorActionPreference = 'Stop'
$stage = 'profile'
$nodeScript = Join-Path $PSScriptRoot 'isolated-auth.js'

function New-RandomSecret {
    return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
}

function Read-Vault([string]$directory) {
    $encrypted = [IO.File]::ReadAllBytes((Join-Path $directory 'secrets.dpapi'))
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { return [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
}

function Invoke-IsolatedNode([string]$verb, [string]$directory) {
    $secrets = Read-Vault $directory
    if ($verb -eq 'recoverytest' -and -not $secrets.ContainsKey('recovery')) {
        $secrets.recovery = New-RandomSecret
        $plain = [Text.Encoding]::UTF8.GetBytes(($secrets | ConvertTo-Json -Compress))
        try {
            $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            $temporaryVault = Join-Path $directory 'secrets.recovery.tmp'
            [IO.File]::WriteAllBytes($temporaryVault, $encrypted)
            [IO.File]::Move($temporaryVault, (Join-Path $directory 'secrets.dpapi'), $true)
        } finally { [Array]::Clear($plain, 0, $plain.Length) }
    }
    $values = @{
        EVAL_ISOLATED_PROFILE = (Join-Path $directory 'profile.json')
        EVAL_ISOLATED_ROOT_PASSWORD = $secrets.root
        EVAL_ISOLATED_MIGRATION_PASSWORD = $secrets.migrator
        EVAL_ISOLATED_APP_PASSWORD = $secrets.application
        EVAL_ISOLATED_ADMIN_PASSWORD = $secrets.admin
        EVAL_ISOLATED_EVALUATOR_PASSWORD = $secrets.evaluator
        SESSION_SECRET = $secrets.session
        AUTH_RATE_LIMIT_SECRET = $secrets.limiter
        NODE_ENV = 'development'
        FRONTEND_ORIGIN = 'http://localhost:5173'
        SESSION_SAME_SITE = 'lax'
        TRUST_PROXY = $null
        EVAL_ISOLATED_RECOVERY_KEY = $(if ($verb -eq 'recoverytest') { $secrets.recovery } else { $null })
        EVAL_VISUAL_TOOL_DIRECTORY = $(if ($verb -eq 'visualreview') { $VisualToolDirectory } else { $null })
    }
    $previous = @{}
    try {
        foreach ($name in $values.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
        }
        & node $nodeScript $verb
        if ($LASTEXITCODE -ne 0) { throw 'Isolated validation failed.' }
    }
    finally {
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
        $secrets.Clear()
        $values.Clear()
    }
}

try {
    if ($Action -eq 'Initialize') {
        $stage = 'initialize-directory'
        if (-not (Test-Path -LiteralPath $MySqlBinary)) { throw 'MySQL binary unavailable.' }
        $profileId = [guid]::NewGuid().ToString('N')
        if (-not $ProfileDirectory) {
            $ProfileDirectory = Join-Path $env:LOCALAPPDATA ('EvaluationDev/mysql-isolated-' + $profileId.Substring(0, 12))
        }
        $ProfileDirectory = [IO.Path]::GetFullPath($ProfileDirectory)
        if (Test-Path -LiteralPath $ProfileDirectory) { throw 'Refusing to overwrite an existing profile.' }
        $workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\') + '\'
        if (($ProfileDirectory.TrimEnd('\') + '\').StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Secrets and data must stay outside the repository.'
        }
        New-Item -ItemType Directory -Path $ProfileDirectory | Out-Null
        $identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($identitySid)
        foreach ($sid in @($identitySid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
        }
        Set-Acl -LiteralPath $ProfileDirectory -AclObject $acl

        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        $listener.Stop()
        if ($port -eq 3306) { throw 'Refusing the default MySQL port.' }
        $dataDirectory = Join-Path $ProfileDirectory 'data'
        $secrets = @{}
        foreach ($name in @('root', 'migrator', 'application', 'admin', 'evaluator', 'session', 'limiter')) { $secrets[$name] = New-RandomSecret }
        $plain = [Text.Encoding]::UTF8.GetBytes(($secrets | ConvertTo-Json -Compress))
        try {
            $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            [IO.File]::WriteAllBytes((Join-Path $ProfileDirectory 'secrets.dpapi'), $encrypted)
        } finally { [Array]::Clear($plain, 0, $plain.Length) }
        $profile = @{
            kind = 'evaluation-isolated-mysql-v1'; id = $profileId; host = '127.0.0.1'; port = $port
            database = ('evaluation_isolated_' + $profileId.Substring(0, 12)); dataDirectory = $dataDirectory
            binary = [IO.Path]::GetFullPath($MySqlBinary); createdUtc = [DateTime]::UtcNow.ToString('o')
        }
        $profile | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ProfileDirectory 'profile.json') -Encoding utf8
        $baseDirectory = Split-Path (Split-Path $MySqlBinary -Parent) -Parent
        $stage = 'initialize-mysql'
        $mysqlTask = Start-Process -FilePath $MySqlBinary -ArgumentList @('--no-defaults', '--initialize-insecure',
            ('--basedir="' + $baseDirectory.Replace('\', '/') + '"'), ('--datadir="' + $dataDirectory.Replace('\', '/') + '"')) `
            -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $ProfileDirectory 'initialize.stdout.log') `
            -RedirectStandardError (Join-Path $ProfileDirectory 'initialize.stderr.log')
        if ($mysqlTask.ExitCode -ne 0) { throw 'MySQL initialization failed.' }
        $serverUuid = (Get-Content -LiteralPath (Join-Path $dataDirectory 'auto.cnf') | Where-Object { $_ -match '^server-uuid=' }) -replace '^server-uuid=', ''
        $profile.serverUuid = $serverUuid.Trim()
        $profile | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ProfileDirectory 'profile.json') -Encoding utf8
        $configuration = @"
[mysqld]
basedir="$($baseDirectory.Replace('\', '/'))"
datadir="$($dataDirectory.Replace('\', '/'))"
port=$port
bind-address=127.0.0.1
mysqlx=0
skip-name-resolve=ON
skip-log-bin
local-infile=OFF
secure-file-priv=NULL
innodb-buffer-pool-size=67108864
log-error="$((Join-Path $ProfileDirectory 'mysql.error.log').Replace('\', '/'))"
"@
        $configuration | Set-Content -LiteralPath (Join-Path $ProfileDirectory 'my.ini') -Encoding utf8
        $bootstrap = @"
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$($secrets.root)';
CREATE USER 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '$($secrets.root)';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
"@
        $bootstrap | Set-Content -LiteralPath (Join-Path $ProfileDirectory 'root-init.sql') -Encoding utf8
        $secrets.Clear()
        [pscustomobject]@{ profileDirectory = $ProfileDirectory; port = $port; initialized = $true; secrets = 'DPAPI CurrentUser, ACL restricted' } | ConvertTo-Json
        return
    }

    if (-not $ProfileDirectory) { throw 'An explicit profile directory is required.' }
    $ProfileDirectory = [IO.Path]::GetFullPath($ProfileDirectory)
    $profile = Get-Content -Raw -LiteralPath (Join-Path $ProfileDirectory 'profile.json') | ConvertFrom-Json
    if ($profile.kind -ne 'evaluation-isolated-mysql-v1' -or $profile.port -eq 3306 -or $profile.host -ne '127.0.0.1') { throw 'Invalid isolated profile.' }
    if ($Action -eq 'Info') { $profile | Select-Object kind,id,host,port,database,dataDirectory | ConvertTo-Json; return }
    if ($Action -eq 'NewSchema') {
        $stage = 'new-schema-profile'
        $generation = if ($profile.PSObject.Properties.Name -contains 'generation') { [int]$profile.generation } else { 1 }
        if ($generation -lt 1 -or $generation -ge 20) { throw 'Invalid schema generation.' }
        $profilePath = Join-Path $ProfileDirectory 'profile.json'
        $backupPath = Join-Path $ProfileDirectory ('profile.generation-' + $generation + '.json')
        if (Test-Path -LiteralPath $backupPath) { throw 'Refusing to overwrite a profile backup.' }
        Copy-Item -LiteralPath $profilePath -Destination $backupPath
        $reportPath = Join-Path $ProfileDirectory 'validation-report.json'
        if (Test-Path -LiteralPath $reportPath) {
            Copy-Item -LiteralPath $reportPath -Destination (Join-Path $ProfileDirectory ('validation-report.generation-' + $generation + '.json'))
        }
        $generation++
        $profile | Add-Member -NotePropertyName generation -NotePropertyValue $generation -Force
        $profile.database = 'evaluation_isolated_' + $profile.id.Substring(0, 12) + '_v' + $generation
        $profile | ConvertTo-Json | Set-Content -LiteralPath $profilePath -Encoding utf8
        [pscustomobject]@{ newSchemaSelected = $true; database = $profile.database; existingSchemasPreserved = $true } | ConvertTo-Json
        return
    }
    if ($Action -eq 'Start') {
        $stage = 'start-mysql'
        $probe = [Net.Sockets.TcpClient]::new()
        $alreadyListening = $false
        try { $probe.Connect('127.0.0.1', [int]$profile.port); $alreadyListening = $true }
        catch { $alreadyListening = $false }
        finally { $probe.Dispose() }
        if ($alreadyListening) {
            Invoke-IsolatedNode 'ready' $ProfileDirectory
            [pscustomobject]@{ alreadyRunning = $true; port = $profile.port } | ConvertTo-Json
            return
        }
        $arguments = @(('--defaults-file="' + (Join-Path $ProfileDirectory 'my.ini').Replace('\', '/') + '"'))
        $bootstrapPath = Join-Path $ProfileDirectory 'root-init.sql'
        if (Test-Path -LiteralPath $bootstrapPath) { $arguments += '--init-file="' + $bootstrapPath.Replace('\', '/') + '"' }
        $mysqlTask = Start-Process -FilePath $profile.binary -ArgumentList $arguments -WindowStyle Hidden -PassThru
        $mysqlTask.Id | Set-Content -LiteralPath (Join-Path $ProfileDirectory 'mysql.pid')
        Invoke-IsolatedNode 'ready' $ProfileDirectory
        if (Test-Path -LiteralPath $bootstrapPath) { Remove-Item -LiteralPath $bootstrapPath }
        [pscustomobject]@{ started = $true; port = $profile.port; processId = $mysqlTask.Id } | ConvertTo-Json
        return
    }
    $stage = $Action.ToLowerInvariant()
    Invoke-IsolatedNode $stage $ProfileDirectory
}
catch {
    [pscustomobject]@{ success = $false; stage = $stage; details = 'Operation failed; inspect the protected local profile. Secrets were not printed.' } | ConvertTo-Json
    exit 1
}
