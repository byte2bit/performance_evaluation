param(
    [ValidateSet('Reset', 'ResumePrepared', 'Show')][string]$Action = 'Show',
    [string]$Confirmation
)
$ErrorActionPreference = 'Stop'
$directory = Join-Path $env:LOCALAPPDATA 'EvaluationDev/inova-nucleo-compat-20261029'
$vaultFile = Join-Path $directory 'password-reset-account12-20261030.dpapi'
$entropy = [Text.Encoding]::UTF8.GetBytes('evaluation-inova-copy-reset-account12-20261030')
$previousSecret = [Environment]::GetEnvironmentVariable('EVAL_LOCAL_COPY_INVENTORY_SECRET', 'Process')
$payload = $null
$stage = 'profile'
function Write-PrivateVault($Value, [bool]$New) {
    $plain = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Compress))
    try {
        $sealed = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $destination = if ($New) { $vaultFile } else { $vaultFile + '.next' }
        $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($sealed, 0, $sealed.Length) } finally { $stream.Dispose() }
        # Preserve the original generated password if delivery completion fails.
        if (!$New) { [IO.File]::Move($destination, $vaultFile, $true) }
    } finally { [Array]::Clear($plain, 0, $plain.Length) }
}
try {
    $profile = [IO.File]::ReadAllText((Join-Path $directory 'profile.json')) | ConvertFrom-Json
    if ($profile.kind -cne 'evaluation-local-mysql-copy-v1' -or $profile.target -cne 'inova_nucleo_compat_20261029' -or $profile.host -cne '127.0.0.1' -or $profile.port -ne 3306) { throw 'Profile refused.' }
    $acl = Get-Acl -LiteralPath $directory
    $allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
    if (!$acl.AreAccessRulesProtected) { throw 'Private profile ACL required.' }
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids) { throw 'Private profile ACL refused.' }
    }
    if ($Action -in @('Reset', 'ResumePrepared')) {
        if ($Confirmation -cne 'inova_nucleo_compat_20261029:reset-account12:20261030') { throw 'Reset confirmation required.' }
        $stage = 'prepare-delivery-vault'
        if ($Action -eq 'Reset') {
            $payload = @{ kind = 'evaluation-inova-local-reset-v1'; target = $profile.target; profileId = $profile.id; accountId = 12;
                password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)); email = ''; resetCompleted = $false }
            Write-PrivateVault $payload $true
        } else {
            $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($vaultFile), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            try { $payload = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
            finally { [Array]::Clear($plain, 0, $plain.Length) }
            if ($payload.kind -cne 'evaluation-inova-local-reset-v1' -or $payload.profileId -cne $profile.id -or $payload.target -cne $profile.target -or $payload.accountId -ne 12 -or $payload.resetCompleted) { throw 'Prepared delivery refused.' }
        }
        $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $directory 'secrets.dpapi')), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        try { $rootSecrets = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
        finally { [Array]::Clear($plain, 0, $plain.Length) }
        [Environment]::SetEnvironmentVariable('EVAL_LOCAL_COPY_INVENTORY_SECRET', $rootSecrets.inventory, 'Process')
        $stage = 'reset-in-private-child'
        $settings = [Diagnostics.ProcessStartInfo]::new()
        $settings.FileName = (Get-Command node.exe).Source
        $settings.UseShellExecute = $false; $settings.CreateNoWindow = $true
        $settings.RedirectStandardInput = $true; $settings.RedirectStandardOutput = $true; $settings.RedirectStandardError = $true
        $settings.ArgumentList.Add((Join-Path $PSScriptRoot 'local-inova-reset-password.js'))
        $settings.ArgumentList.Add($directory); $settings.ArgumentList.Add($Confirmation)
        if ($Action -eq 'ResumePrepared') { $settings.ArgumentList.Add('resume-prepared') }
        $settings.Environment.Remove('NODE_OPTIONS') | Out-Null
        $child = [Diagnostics.Process]::Start($settings)
        try {
            $output = $child.StandardOutput.ReadToEndAsync(); $errors = $child.StandardError.ReadToEndAsync()
            $child.StandardInput.WriteLine((@{ password = $payload.password } | ConvertTo-Json -Compress)); $child.StandardInput.Close()
            $child.WaitForExit()
            $result = $output.GetAwaiter().GetResult() | ConvertFrom-Json
            $null = $errors.GetAwaiter().GetResult()
            if ($child.ExitCode -ne 0 -or !$result.success) { throw 'Reset failed; preserve vault and backup, do not retry automatically.' }
        } finally { $child.Dispose() }
        $stage = 'complete-delivery-vault'
        $payload.email = $result.email; $payload.resetCompleted = $true
        Write-PrivateVault $payload $false
        $stage = 'show-local-credentials'
        $arguments = @('-NoProfile', '-STA', '-File', ('"' + $PSCommandPath + '"'), '-Action', 'Show')
        $viewer = Start-Process -FilePath (Get-Command pwsh.exe).Source -ArgumentList $arguments -WindowStyle Hidden -PassThru
        [pscustomobject]@{ success = $true; target = $profile.target; accountId = 12; passwordHash = 'Argon2id'; sessionVersionIncremented = $true;
            otherAccountsPreserved = $result.otherAccountsPreserved; profileAndIdentityPreserved = $true; encryptedAccountBackupAuthenticated = $true;
            localCredentialWindowStarted = !$viewer.HasExited; credentialVault = 'password-reset-account12-20261030.dpapi'; sourceNotWritten = $true } | ConvertTo-Json
    } else {
        $stage = 'read-local-delivery'
        $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($vaultFile), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        try { $payload = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json -AsHashtable }
        finally { [Array]::Clear($plain, 0, $plain.Length) }
        if ($payload.kind -cne 'evaluation-inova-local-reset-v1' -or $payload.profileId -cne $profile.id -or $payload.target -cne $profile.target -or $payload.accountId -ne 12 -or !$payload.resetCompleted) { throw 'Delivery refused; preserve artifacts.' }
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $form = [Windows.Forms.Form]::new(); $form.Text = 'Acesso local — conta 12'; $form.Width = 580; $form.Height = 265
        $form.StartPosition = 'CenterScreen'; $form.TopMost = $true; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
        $caption = [Windows.Forms.Label]::new(); $caption.Text = 'Somente cópia local — http://localhost:5174/login'; $caption.SetBounds(18, 15, 530, 24)
        $emailLabel = [Windows.Forms.Label]::new(); $emailLabel.Text = 'E-mail de login'; $emailLabel.SetBounds(18, 51, 120, 22)
        $emailBox = [Windows.Forms.TextBox]::new(); $emailBox.Text = $payload.email; $emailBox.ReadOnly = $true; $emailBox.SetBounds(145, 48, 395, 26)
        $passwordLabel = [Windows.Forms.Label]::new(); $passwordLabel.Text = 'Nova senha'; $passwordLabel.SetBounds(18, 91, 120, 22)
        $passwordBox = [Windows.Forms.TextBox]::new(); $passwordBox.Text = $payload.password; $passwordBox.ReadOnly = $true; $passwordBox.UseSystemPasswordChar = $true; $passwordBox.SetBounds(145, 88, 395, 26)
        $reveal = [Windows.Forms.CheckBox]::new(); $reveal.Text = 'Mostrar senha'; $reveal.SetBounds(145, 126, 180, 26)
        $reveal.Add_CheckedChanged({ $passwordBox.UseSystemPasswordChar = !$reveal.Checked })
        $notice = [Windows.Forms.Label]::new(); $notice.Text = 'Guarde a senha em seu gerenciador. Não compartilhe pelo chat.'; $notice.SetBounds(18, 171, 530, 28)
        $form.Controls.AddRange(@($caption, $emailLabel, $emailBox, $passwordLabel, $passwordBox, $reveal, $notice))
        $form.Add_Shown({ $form.Activate() }); $null = $form.ShowDialog()
        $emailBox.Clear(); $passwordBox.Clear(); $form.Dispose()
    }
} catch {
    [pscustomobject]@{ success = $false; stage = $stage; sensitiveDiagnosticsSuppressed = $true; preserveArtifacts = $true; doNotRepeatReset = $true } | ConvertTo-Json
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('EVAL_LOCAL_COPY_INVENTORY_SECRET', $previousSecret, 'Process')
    if ($payload) { $payload.password = $null; $payload.email = $null }
    if ($rootSecrets) { $rootSecrets.Clear() }
}
