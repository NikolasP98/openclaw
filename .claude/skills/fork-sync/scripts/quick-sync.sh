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

# Phase 2a: Update docker workflow branch
echo -e "${BLUE}🐳 Phase 2a: Updating docker workflow branch...${NC}"
git checkout feature/docker-workflow-automation
if git merge main --no-edit; then
  git push origin feature/docker-workflow-automation
  echo -e "${GREEN}✓ Docker workflow branch updated${NC}"
else
  echo -e "${RED}❌ Merge conflict in docker workflow branch. Please resolve manually.${NC}"
  exit 1
fi
echo ""

# Phase 2b: Update custom setup branch
echo -e "${BLUE}⚙️  Phase 2b: Updating custom setup branch...${NC}"
git checkout nikolas/custom-setup
if git merge main --no-edit; then
  git push origin nikolas/custom-setup
  echo -e "${GREEN}✓ Custom setup branch updated${NC}"
else
  echo -e "${RED}❌ Merge conflict in custom setup branch. Please resolve manually.${NC}"
  exit 1
fi
echo ""

# Phase 3: Update DEV
echo -e "${BLUE}🔧 Phase 3: Updating DEV branch...${NC}"
git checkout DEV
git merge main --no-edit
git merge feature/docker-workflow-automation --no-edit
git merge nikolas/custom-setup --no-edit
git push origin DEV
echo -e "${GREEN}✓ DEV branch updated${NC}"
echo ""

# Phase 4: Update PRD
echo -e "${BLUE}🚀 Phase 4: Updating PRD branch...${NC}"
git checkout PRD
git merge DEV --no-edit
git push origin PRD
echo -e "${GREEN}✓ PRD branch updated${NC}"
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

echo -n "DEV vs PRD: "
if [[ -z $(git diff DEV PRD) ]]; then
  echo -e "${GREEN}✓ Identical${NC}"
else
  echo -e "${YELLOW}⚠ Different${NC}"
fi
echo ""
echo -e "${YELLOW}💡 Consider running tests: pnpm build && pnpm test${NC}"
