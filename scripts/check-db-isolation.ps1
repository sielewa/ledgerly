# Windows (PowerShell) version of check-db-isolation.sh — keep the two in sync.
# Verifies the database-per-service setup created by infra/postgres/init/.
# For every service user it checks that:
#   1. it can connect to its own database,
#   2. it can create a table there (i.e. it owns the database / public schema),
#   3. it is REJECTED when connecting to any other service's database.

$ComposeFile = Join-Path $PSScriptRoot '..\infra\docker-compose.yml'

$Services = @(
  @{ Db = 'ledger'; User = 'ledger_svc'; Password = 'ledger_pw' },
  @{ Db = 'invoices'; User = 'invoice_svc'; Password = 'invoice_pw' },
  @{ Db = 'payments'; User = 'payment_svc'; Password = 'payment_pw' },
  @{ Db = 'notifications'; User = 'notification_svc'; Password = 'notification_pw' }
)

$script:pass = 0
$script:fail = 0

function Ok($message) { Write-Output "  PASS  $message"; $script:pass++ }
function Bad($message, $details) {
  Write-Output "  FAIL  $message"
  if ($details) { Write-Output "        $details" }
  $script:fail++
}

# Connect over TCP (-h postgres), not the unix socket, so password auth is enforced like for a real service.
# Returns @{ Ok = <exit code was 0>; Output = <stdout + stderr> }.
function Invoke-PsqlAs($user, $password, $db, $sql) {
  $output = & docker compose -f $ComposeFile exec -T -e "PGPASSWORD=$password" postgres `
    psql -h postgres -U $user -d $db -v ON_ERROR_STOP=1 -tAc $sql 2>&1 | ForEach-Object { "$_" } | Out-String
  @{ Ok = ($LASTEXITCODE -eq 0); Output = $output.Trim() }
}

foreach ($svc in $Services) {
  Write-Output $svc.User

  $r = Invoke-PsqlAs $svc.User $svc.Password $svc.Db 'SELECT 1'
  if ($r.Ok) { Ok "connects to own database '$($svc.Db)'" }
  else { Bad "connects to own database '$($svc.Db)'" $r.Output }

  $r = Invoke-PsqlAs $svc.User $svc.Password $svc.Db 'CREATE TABLE isolation_check(id int); DROP TABLE isolation_check;'
  if ($r.Ok) { Ok "can create tables in '$($svc.Db)'" }
  else { Bad "can create tables in '$($svc.Db)'" $r.Output }

  foreach ($other in $Services) {
    if ($other.Db -eq $svc.Db) { continue }
    $r = Invoke-PsqlAs $svc.User $svc.Password $other.Db 'SELECT 1'
    # Must fail specifically because of missing privileges — not because of e.g. a wrong password.
    if ($r.Output -match 'permission denied for database') { Ok "rejected from '$($other.Db)'" }
    else { Bad "rejected from '$($other.Db)'" (($r.Output -split "`r?`n")[0]) }
  }
}

Write-Output ''
Write-Output "passed: $($script:pass), failed: $($script:fail)"
if ($script:fail -ne 0) { exit 1 }
