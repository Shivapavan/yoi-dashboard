#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Git pre-commit hook — YOI Dashboard.
# Runs TypeScript type-check before every commit; blocks on failure.
# Lint is skipped until an ESLint config exists (next lint is
# deprecated and prompts interactively without one).
# Installed at .git/hooks/pre-commit (symlink to this file).
# ─────────────────────────────────────────────────────────────
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; NC="\033[0m"

# Make sure node/npm is available in non-login shells (e.g. GUI git clients).
command -v npm >/dev/null 2>&1 || { [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}✗ npm not found on PATH — cannot run pre-commit checks.${NC}"; exit 1; }

echo "▶ Type-checking (tsc --noEmit)..."
if ! npm run --silent type-check; then
  echo -e "${RED}✗ Type errors found. Fix before committing.${NC}"
  exit 1
fi

# Lint only if an ESLint config is present (otherwise next lint prompts/fails).
if ls .eslintrc* eslint.config.* >/dev/null 2>&1; then
  echo "▶ Linting..."
  if ! npx eslint . --quiet; then
    echo -e "${RED}✗ Lint errors found. Fix before committing.${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}• Skipping lint (no ESLint config). Add one to enable lint gating.${NC}"
fi

echo -e "${GREEN}✓ Checks passed.${NC}"
exit 0
