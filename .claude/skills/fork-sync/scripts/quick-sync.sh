#!/bin/bash
# OpenClaw Fork Quick Sync Script
# Automates the full fork sync workflow for routine updates
# WARNING: This assumes no merge conflicts. Review changes manually first!

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Starting OpenClaw fork sync workflow...${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW}📋 Pre-flight checks...${NC}"

if [[ -n $(git status -s) ]]; then
  echo -e "${RED}❌ Working directory is not clean. Please commit or stash changes first.${NC}"
  git status -s
  exit 1
fi

if ! git remote | grep -q "^upstream$"; then
  echo -e "${RED}❌ Upstream remote not configured.${NC}"
  echo "Add it with: git remote add upstream https://github.com/openclaw/openclaw.git"
  exit 1
fi

echo -e "${GREEN}✓ Working directory is clean${NC}"
echo -e "${GREEN}✓ Upstream remote configured${NC}"
echo ""

# Fetch latest from upstream
echo -e "${YELLOW}📥 Fetching latest from upstream...${NC}"
git fetch upstream
echo ""

# Check if there are new commits
NEW_COMMITS=$(git log --oneline main..upstream/main | wc -l)
if [[ $NEW_COMMITS -eq 0 ]]; then
  echo -e "${GREEN}✓ Already up to date with upstream. No sync needed.${NC}"
  exit 0
fi

echo -e "${BLUE}Found $NEW_COMMITS new commit(s) from upstream:${NC}"
git log --oneline main..upstream/main
echo ""

read -p "Continue with sync? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Sync cancelled.${NC}"
  exit 0
fi
echo ""

# Phase 1: Sync main
echo -e "${BLUE}📥 Phase 1: Syncing main with upstream...${NC}"
git checkout main
git merge --ff-only upstream/main
git push origin main
echo -e "${GREEN}✓ Main branch synced${NC}"
echo ""

# Phase 2: Update DEV
echo -e "${BLUE}🔧 Phase 2: Updating DEV branch...${NC}"
git checkout DEV
if git merge main --no-edit; then
  git push origin DEV
  echo -e "${GREEN}✓ DEV branch updated${NC}"
else
  echo -e "${RED}❌ Merge conflict in DEV branch. Please resolve manually.${NC}"
  exit 1
fi
echo ""

# Return to main
git checkout main

echo -e "${GREEN}✅ Fork sync complete!${NC}"
echo ""
echo -e "${BLUE}📊 Branch status:${NC}"
git log --oneline --graph --all --decorate -15
echo ""
echo -e "${BLUE}📝 Verification:${NC}"
echo -n "Main vs upstream: "
if [[ $(git log --oneline main..upstream/main | wc -l) -eq 0 ]]; then
  echo -e "${GREEN}✓ In sync${NC}"
else
  echo -e "${RED}✗ Out of sync${NC}"
fi

echo -n "DEV contains main: "
if git merge-base --is-ancestor main DEV 2>/dev/null; then
  echo -e "${GREEN}✓ Yes${NC}"
else
  echo -e "${RED}✗ No${NC}"
fi
echo ""
echo -e "${YELLOW}💡 Consider running tests: pnpm build && pnpm test${NC}"
echo -e "${YELLOW}💡 Feature branches and PRD are not auto-synced. Update them manually when needed.${NC}"
