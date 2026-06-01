#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# sync.sh — "are we on the current version?" check for opus-echoes.
#
#   bash scripts/sync.sh        fetch origin + print a status report  (default)
#   bash scripts/sync.sh pull   report, then  git pull --rebase origin main
#
# Runs automatically at the start of every Claude Code session (the SessionStart
# hook in .claude/settings.json) and is available as `bun run sync`. The point:
# no agent (Claude, Codex) or human ever works on a stale clone unknowingly.
# Source of truth is always GitHub `origin/main` — Lovable publishes from it.
# ──────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "sync: not a git repo"; exit 0; }
cd "$ROOT" || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

if ! git fetch -q origin 2>/dev/null; then
  echo "── opus-echoes · git sync ── (could not reach origin — offline?) · branch: $BRANCH"
  exit 0
fi

BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
LAST="$(git log -1 --format='%h %s' origin/main 2>/dev/null)"

echo "── opus-echoes · git sync ────────────────────────────────"
echo "   branch:           $BRANCH"
echo "   vs origin/main:   $BEHIND behind · $AHEAD ahead"
echo "   uncommitted:      $DIRTY file(s)"
echo "   remote main now:  $LAST"
if [ "$BEHIND" != "0" ] && [ "$BEHIND" != "?" ]; then
  echo "   >> STALE: sync before working —  git pull --rebase origin main   (or: bun run sync:pull)"
fi
echo "──────────────────────────────────────────────────────────"

if [ "${1:-}" = "pull" ]; then
  echo "   pulling (rebase) from origin/main…"
  git pull --rebase origin main
fi
