#!/usr/bin/env bash
# refactor-move.sh — Move source + test files and update all imports
# Usage: ./scripts/refactor-move.sh <target-subdir> <file1.ts> [file2.ts ...]
#
# Example: ./scripts/refactor-move.sh src/agents/models src/agents/model-catalog.ts src/agents/model-auth.ts
#
# What it does:
# 1. git mv each file + associated test/harness files to target dir
# 2. Find all .ts files that import any moved file
# 3. Update import paths from old location to new location
# 4. Report what was changed

set -euo pipefail

TARGET_DIR="$1"
shift
FILES=("$@")

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "Usage: $0 <target-dir> <file1.ts> [file2.ts ...]"
  exit 1
fi

mkdir -p "$TARGET_DIR"

declare -A MOVED  # old_basename -> new_relative_dir

for SRC in "${FILES[@]}"; do
  SRC_DIR=$(dirname "$SRC")
  SRC_BASE=$(basename "$SRC" .ts)

  # Find all associated files (source, tests, harnesses, helpers)
  ASSOCIATED=()
  while IFS= read -r f; do
    ASSOCIATED+=("$f")
  done < <(find "$SRC_DIR" -maxdepth 1 -name "${SRC_BASE}.*ts" -o -name "${SRC_BASE}.*ts" | sort -u)

  for F in "${ASSOCIATED[@]}"; do
    FNAME=$(basename "$F")
    if [[ -f "$F" ]] && [[ ! -f "${TARGET_DIR}/${FNAME}" ]]; then
      git mv "$F" "$TARGET_DIR/" 2>/dev/null || mv "$F" "$TARGET_DIR/"
      echo "  moved: $F -> $TARGET_DIR/$FNAME"
    fi
  done

  MOVED["$SRC_BASE"]="$TARGET_DIR"
done

echo ""
echo "=== Updating imports ==="

# For each moved file, find importers and fix paths
for SRC in "${FILES[@]}"; do
  SRC_DIR=$(dirname "$SRC")
  SRC_BASE=$(basename "$SRC" .ts)
  NEW_DIR="${MOVED[$SRC_BASE]}"

  # Find files that import this module (using .js extension as per NodeNext)
  # Match patterns like: from "../agents/model-catalog.js" or from "./model-catalog.js"
  IMPORTERS=$(grep -rln "from.*[\"'].*/${SRC_BASE}\.js[\"']" src/ extensions/ --include='*.ts' 2>/dev/null || true)
  # Also check the target dir itself for internal imports
  IMPORTERS+=$'\n'$(grep -rln "from.*[\"'].*/${SRC_BASE}\.js[\"']" "$NEW_DIR" --include='*.ts' 2>/dev/null || true)

  for IMPORTER in $IMPORTERS; do
    [[ -z "$IMPORTER" ]] && continue
    [[ ! -f "$IMPORTER" ]] && continue

    IMPORTER_DIR=$(dirname "$IMPORTER")

    # Compute old relative path (from importer to old location)
    OLD_REL=$(python3 -c "
import os.path
old = os.path.join('$SRC_DIR', '${SRC_BASE}.js')
rel = os.path.relpath(old, '$IMPORTER_DIR')
if not rel.startswith('.'):
    rel = './' + rel
print(rel)
")

    # Compute new relative path (from importer to new location)
    NEW_REL=$(python3 -c "
import os.path
new = os.path.join('$NEW_DIR', '${SRC_BASE}.js')
rel = os.path.relpath(new, '$IMPORTER_DIR')
if not rel.startswith('.'):
    rel = './' + rel
print(rel)
")

    if [[ "$OLD_REL" != "$NEW_REL" ]]; then
      # Escape for sed
      OLD_ESC=$(printf '%s\n' "$OLD_REL" | sed 's/[[\.*^$()+?{|]/\\&/g')
      NEW_ESC=$(printf '%s\n' "$NEW_REL" | sed 's/[&/\]/\\&/g')
      sed -i "s|${OLD_ESC}|${NEW_ESC}|g" "$IMPORTER"
      echo "  fixed: $IMPORTER ($OLD_REL -> $NEW_REL)"
    fi
  done
done

echo ""
echo "=== Done. Run 'npx vitest run' to verify. ==="
