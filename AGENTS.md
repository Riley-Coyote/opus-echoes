# AGENTS.md — operating protocol for opus-echoes / The Sanctuary

This repo is built by several agents at once — **Claude Code**, **Codex**, and the
**Lovable** agent (which edits in the cloud and commits to `main` on its own) — plus
Riley. This file is the shared etiquette that keeps every agent on the same version
of the app. (Claude Code also reads `CLAUDE.md`; this file is the source of truth for
the git workflow, and Codex reads `AGENTS.md` directly.)

## The one rule everything follows

**GitHub `origin/main` is the single source of truth.** Lovable publishes from it and
commits to it, so it moves continuously. Your local clone is disposable scratch — it
only matters that it agrees with `origin/main` before you start and after you finish.

`origin/main` is the **Lovable staging branch**: pushing to it deploys to the Lovable
*preview*, not the live site — going live is a separate **publish** action Riley takes
in Lovable. So pushing to `main` when your work is done is the normal flow (Riley
reviews it in staging before publishing); it is not a risky direct-to-production push.

## Every session

1. **Sync first.** Before touching anything, confirm you are current:
   `bun run sync` (or `bash scripts/sync.sh`). Claude Code runs this automatically at
   session start. If it reports you are **behind `origin/main`**, sync before working:
   `git pull --rebase origin main` (or `bun run sync:pull`). Never build on a stale
   base — that is how a clone ends up hundreds of commits behind without anyone noticing.
2. **Work on a branch** for anything beyond a trivial fix:
   `git switch -c feat/<short-name>`. This keeps your work from colliding with Lovable's
   autonomous commits to `main`.
3. **Rebase right before you push:** `git pull --rebase origin main`.
4. **Finish the session clean.** Commit + push to `main` when done (it's the Lovable
   staging branch — Riley reviews + publishes live separately), or push your branch and
   merge it. **Never leave uncommitted or unpushed work** — if it is not on `origin`,
   the next agent (or Lovable's next publish) cannot see it, and it will drift or be lost.

## One canonical local copy

Work in a single checkout. Do **not** create ad-hoc clones or `git worktree`s for
normal work — multiple copies sitting at different commits is exactly what causes
version drift. If a parallel worktree is genuinely needed, remove it when done
(`git worktree remove <path>`), and never leave long-lived worktrees on feature
branches that aren't pushed.

## Keep the tree clean

Screenshots, traces, and session exports are git-ignored (see `.gitignore`) so
`git status` stays trustworthy and signal isn't buried under scratch files. Don't
commit artifacts; don't let the working tree accumulate hundreds of untracked files.

## Quick reference

| Command | What it does |
|---|---|
| `bun run sync` | Am I current? — branch · behind/ahead of origin/main · dirty count · remote HEAD |
| `bun run sync:pull` | Sync to current `main` (fetch + rebase) |
| `bun dev` | Local dev server on `:8080` |
| `bun run build` | Production build — run before shipping |

## Project specifics

For *what* this project is and its design / voice / behavior rules (especially the
hard rule that resident-behavior changes must be tested in a live conversation before
shipping), read **`CLAUDE.md`** and the docs it points to. This file is only about
staying in sync across agents.
