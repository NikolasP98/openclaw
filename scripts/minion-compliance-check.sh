#!/bin/bash
# minion-compliance-check.sh
# Checks all agents in minion.json for structural and config compliance.
# Exit 0 = fully compliant. Exit 1 = issues found.

set -euo pipefail

CONFIG="/home/minion/.minion/minion.json"
CRON="/home/minion/.minion/cron/jobs.json"
WORKSPACES="/home/minion/.minion/workspaces"
AGENTS_BASE="/home/minion/.minion/agents"
GHOST_WORKSPACE="/home/minion/.minion/workspace"

REQUIRED_WS_FILES=(AGENTS.md IDENTITY.md SOUL.md TOOLS.md USER.md)
REQUIRED_AGENT_DIR_FILES=(auth-profiles.json auth.json models.json)
EMBEDDING_MODEL="openai/text-embedding-3-small"
OPENROUTER_BASE="https://openrouter.ai/api/v1"

RED='\033[0;31m'
YLW='\033[0;33m'
GRN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

ISSUES=0
WARNINGS=0

fail()    { echo -e "  ${RED}[FAIL]${NC} $*"; ((ISSUES++)) || true; }
warn()    { echo -e "  ${YLW}[WARN]${NC} $*"; ((WARNINGS++)) || true; }
pass()    { echo -e "  ${GRN}[OK]${NC}   $*"; }
section() { echo -e "\n${BOLD}=== $* ===${NC}"; }

echo ""
echo "================================================================"
echo " Minion Compliance Check — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "================================================================"

if [ ! -f "$CONFIG" ]; then
  echo -e "${RED}ERROR: minion.json not found at $CONFIG${NC}"
  exit 1
fi

# ── 1. Config-level checks ───────────────────────────────────────────────────
section "Config"

MEM_MODEL=$(python3 -c "import json; cfg=json.load(open('$CONFIG')); print(cfg['agents']['defaults']['memorySearch']['model'])")
MEM_BASE=$(python3 -c "import json; cfg=json.load(open('$CONFIG')); print(cfg['agents']['defaults']['memorySearch']['remote']['baseUrl'])" 2>/dev/null || echo "")
if [ "$MEM_MODEL" = "$EMBEDDING_MODEL" ]; then
  pass "Memory embedding model: $MEM_MODEL"
else
  fail "Memory embedding model is '$MEM_MODEL', expected '$EMBEDDING_MODEL'"
fi
if [ "$MEM_BASE" = "$OPENROUTER_BASE" ]; then
  pass "Memory embedding remote: $MEM_BASE"
else
  warn "Memory embedding remote baseUrl: '$MEM_BASE' (expected OpenRouter)"
fi

DEFAULT_COUNT=$(python3 -c "import json; cfg=json.load(open('$CONFIG')); print(sum(1 for a in cfg['agents']['list'] if a.get('default') == True))")
if [ "$DEFAULT_COUNT" -eq 1 ]; then
  DEFAULT_ID=$(python3 -c "import json; cfg=json.load(open('$CONFIG')); print(next(a['id'] for a in cfg['agents']['list'] if a.get('default') == True))")
  pass "Default agent: $DEFAULT_ID"
elif [ "$DEFAULT_COUNT" -eq 0 ]; then
  fail "No default agent defined (gateway needs exactly one)"
else
  fail "Multiple default agents ($DEFAULT_COUNT) — gateway behavior undefined"
fi

if [ -d "$GHOST_WORKSPACE" ]; then
  fail "Ghost /workspace (singular) directory still exists at $GHOST_WORKSPACE"
else
  pass "No ghost workspace/ (singular) directory"
fi

# ── 2. Per-agent checks ──────────────────────────────────────────────────────
section "Agents"

python3 << PYEOF
import json, os, sys

cfg  = json.load(open("$CONFIG"))
cron = json.load(open("$CRON")) if os.path.exists("$CRON") else {"jobs": []}

agents   = cfg["agents"]["list"]
bindings = cfg.get("bindings", [])
bound_agents = set(b.get("agentId") for b in bindings)
cron_agents  = set(j.get("agentId") for j in cron["jobs"] if j.get("enabled", True))

required_ws = ["AGENTS.md", "IDENTITY.md", "SOUL.md", "TOOLS.md", "USER.md"]
required_ad = ["auth-profiles.json", "auth.json", "models.json"]

issues = 0
warnings = 0

RED = "\033[0;31m"; YLW = "\033[0;33m"; GRN = "\033[0;32m"; NC = "\033[0m"

def fail(msg):
    global issues
    print(f"  {RED}[FAIL]{NC} {msg}")
    issues += 1

def warn(msg):
    global warnings
    print(f"  {YLW}[WARN]{NC} {msg}")
    warnings += 1

def ok(msg):
    print(f"  {GRN}[OK]{NC}   {msg}")

for a in agents:
    aid = a["id"]
    ws  = a.get("workspace", "")
    ad  = a.get("agentDir", "")
    print(f"\n  [{aid}]")

    if not ws:
        fail("no workspace configured")
    elif not os.path.isdir(ws):
        fail(f"workspace missing: {ws}")
    else:
        ok(f"workspace: {ws}")
        ws_files = set(os.listdir(ws))
        missing = [f for f in required_ws if f not in ws_files]
        if missing:
            warn(f"missing workspace files: {missing}")
        else:
            ok("all required workspace files present")

    if not ad:
        fail("no agentDir configured")
    elif not os.path.isdir(ad):
        fail(f"agentDir missing: {ad}")
    else:
        ok(f"agentDir: {ad}")
        ad_files = set(os.listdir(ad))
        missing_ad = [f for f in required_ad if f not in ad_files]
        if missing_ad:
            fail(f"missing agentDir files: {missing_ad}")
        else:
            ok("all required agentDir files present")
        stale_tmp = [f for f in ad_files if f.endswith(".tmp")]
        if stale_tmp:
            warn(f"stale .tmp files: {stale_tmp}")

    is_default = a.get("default") == True
    is_bound   = aid in bound_agents
    has_cron   = aid in cron_agents
    if is_default:
        ok("routing: default agent")
    elif is_bound:
        ok("routing: bound to channel(s)")
    elif has_cron:
        ok("routing: cron-only agent")
    else:
        warn("routing: no binding, not default, no active cron — web UI only")

    model = a.get("model", "")
    if model and not model.startswith("openrouter/") and not model.startswith("anthropic/"):
        warn(f"explicit model '{model}' doesn't use a known provider prefix")

    for job in cron["jobs"]:
        if job.get("agentId") != aid: continue
        msg = job.get("payload", {}).get("message", "")
        if "/.minion/workspace/" in msg and "/.minion/workspaces/" not in msg:
            fail(f"cron job '{job['name']}' references old singular /workspace/ path")

sys.stdout.flush()
print(f"\n{'='*50}")
print(f"Per-agent issues: {issues}, warnings: {warnings}")
sys.exit(1 if issues > 0 else 0)
PYEOF
PY_EXIT=$?

# ── 3. Embedding API live test ───────────────────────────────────────────────
section "Live API test"

MEM_KEY=$(python3 -c "import json; cfg=json.load(open('$CONFIG')); print(cfg['agents']['defaults']['memorySearch']['remote']['apiKey'])" 2>/dev/null || echo "")
if [ -z "$MEM_KEY" ]; then
  warn "Could not read embedding API key from config"
else
  EMBED_RESULT=$(curl -sf "$OPENROUTER_BASE/embeddings"     -H "Authorization: Bearer $MEM_KEY"     -H "Content-Type: application/json"     -d "{\"model\": \"$EMBEDDING_MODEL\", \"input\": \"compliance test\"}"     | python3 -c "
import sys,json
r=json.load(sys.stdin)
if 'data' in r:
    print('OK dim=' + str(len(r['data'][0]['embedding'])))
else:
    print('FAIL ' + str(r.get('error',r)))
" 2>/dev/null || echo "FAIL curl error")

  if [[ "$EMBED_RESULT" == OK* ]]; then
    pass "Embeddings API: $EMBED_RESULT"
  else
    fail "Embeddings API: $EMBED_RESULT"
  fi
fi

# ── Final summary ────────────────────────────────────────────────────────────
section "Summary"
TOTAL_ISSUES=$((ISSUES + (PY_EXIT != 0 ? 1 : 0)))
echo -e "  Config issues  : $ISSUES"
echo -e "  Config warnings: $WARNINGS"
if [ $TOTAL_ISSUES -gt 0 ]; then
  echo -e "\n${RED}${BOLD}COMPLIANCE: FAIL${NC}"
  exit 1
else
  echo -e "\n${GRN}${BOLD}COMPLIANCE: PASS${NC}"
  exit 0
fi
