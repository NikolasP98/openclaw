#!/usr/bin/env bash
# Fix KG entity with wrong database path on protopi server.
#
# The KG entity for panik has data.database pointing to ~/.minion/memory/panik.sqlite
# (the chunks/embeddings DB). It should point to ~/.minion/agents/panik/KG/kg.sqlite.
#
# Run this on protopi as the minion user:
#   bash scripts/fix-kg-entity-path.sh

set -euo pipefail

KG_DB="${HOME}/.minion/agents/panik/KG/kg.sqlite"

if [[ ! -f "$KG_DB" ]]; then
  echo "ERROR: KG database not found at $KG_DB"
  exit 1
fi

echo "Checking for entities with wrong database path..."
sqlite3 "$KG_DB" "SELECT id, label, data FROM memory_objects WHERE data LIKE '%memory/panik.sqlite%';"

echo ""
echo "Fixing database path in KG entities..."
sqlite3 "$KG_DB" "UPDATE memory_objects SET data = REPLACE(data, 'memory/panik.sqlite', 'agents/panik/KG/kg.sqlite') WHERE data LIKE '%memory/panik.sqlite%';"

echo "Done. Updated entities:"
sqlite3 "$KG_DB" "SELECT id, label, data FROM memory_objects WHERE data LIKE '%kg.sqlite%';"
