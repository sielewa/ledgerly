#!/usr/bin/env bash
# Verifies the database-per-service setup created by infra/postgres/init/.
# For every service user it checks that:
#   1. it can connect to its own database,
#   2. it can create a table there (i.e. it owns the database / public schema),
#   3. it is REJECTED when connecting to any other service's database.
set -u

COMPOSE=(docker compose -f "$(dirname "$0")/../infra/docker-compose.yml")

# db:user:password
SERVICES=(
  "ledger:ledger_svc:ledger_pw"
  "invoices:invoice_svc:invoice_pw"
  "payments:payment_svc:payment_pw"
  "notifications:notification_svc:notification_pw"
)

pass=0
fail=0

ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "        $2"; fail=$((fail + 1)); }

# Connect over TCP (-h postgres), not the unix socket, so password auth is enforced like for a real service.
psql_as() {
  local user=$1 pw=$2 db=$3 sql=$4
  "${COMPOSE[@]}" exec -T -e PGPASSWORD="$pw" postgres \
    psql -h postgres -U "$user" -d "$db" -v ON_ERROR_STOP=1 -tAc "$sql" 2>&1
}

for entry in "${SERVICES[@]}"; do
  IFS=: read -r db user pw <<<"$entry"
  echo "$user"

  if out=$(psql_as "$user" "$pw" "$db" "SELECT 1"); then
    ok "connects to own database '$db'"
  else
    bad "connects to own database '$db'" "$out"
  fi

  if out=$(psql_as "$user" "$pw" "$db" "CREATE TABLE isolation_check(id int); DROP TABLE isolation_check;"); then
    ok "can create tables in '$db'"
  else
    bad "can create tables in '$db'" "$out"
  fi

  for other in "${SERVICES[@]}"; do
    other_db=${other%%:*}
    [ "$other_db" = "$db" ] && continue
    out=$(psql_as "$user" "$pw" "$other_db" "SELECT 1")
    # Must fail specifically because of missing privileges — not because of e.g. a wrong password.
    if echo "$out" | grep -q 'permission denied for database'; then
      ok "rejected from '$other_db'"
    else
      bad "rejected from '$other_db'" "$(echo "$out" | head -1)"
    fi
  done
done

echo
echo "passed: $pass, failed: $fail"
[ "$fail" -eq 0 ]
