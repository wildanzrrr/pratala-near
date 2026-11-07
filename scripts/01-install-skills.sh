#!/usr/bin/env bash
# Reproduce the agent-skill installs for each workspace folder.
#
#   scripts/01-install-skills.sh            → restores smart-contract/, backend/, frontend/ skills
#   DRY_RUN=1 scripts/01-install-skills.sh  → shows what would be restored, writes nothing
#   FOLDERS="backend" scripts/01-install-skills.sh → only one folder
#
# If <folder>/skills-lock.json exists the pinned set is restored with
#   npx -y skills experimental_install
# otherwise the docs/PLAN.md §8 commands are run:
#   npx -y skills add <repo> --skill <name> -a claude-code -y
# Expect: each folder ends with its skills under <folder>/.claude/skills (or .agents/skills)
# and an unchanged skills-lock.json (git diff shows nothing).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

require_cmd npx
FOLDERS="${FOLDERS:-smart-contract backend frontend}"
DRY_RUN="${DRY_RUN:-0}"

# Fallback lists (docs/PLAN.md §8), used only when a folder has no skills-lock.json.
# Format: "<repo> <skill>"
fallback_skills() {
  case "$1" in
    smart-contract) cat <<'EOF'
near/agent-skills near-smart-contracts
near/agent-skills near-contract-audit
near/agent-skills near-cli-rs
EOF
    ;;
    backend) cat <<'EOF'
near/agent-skills near-api-js
near/agent-skills near-intents
near/agent-skills near-ai-cloud
kadajett/agent-nestjs-skills nestjs-best-practices
jeffallan/claude-skills nestjs-expert
prisma/skills prisma-cli
prisma/skills prisma-client-api
prisma/skills prisma-database-setup
prisma/skills prisma-postgres
EOF
    ;;
    frontend) cat <<'EOF'
near/agent-skills near-dapp
near/agent-skills near-api-js
near/agent-skills near-intents
nearbuilders/near-skills near-connect-hooks
vercel-labs/agent-skills vercel-react-best-practices
vercel-labs/agent-skills vercel-composition-patterns
shadcn/ui shadcn
wshobson/agents tailwind-design-system
deckardger/tanstack-agent-skills tanstack-query-best-practices
sanity-io/agent-toolkit seo-aeo-best-practices
leonxlnx/taste-skill design-taste-frontend
pbakaus/impeccable impeccable
EOF
    ;;
  esac
}

step "Agent skills"
expect "per folder: 'restored from skills-lock.json' or 'installed N skills'; lock files unchanged"

plan=()
for f in $FOLDERS; do
  dir="$ROOT_DIR/$f"
  [[ -d "$dir" ]] || { warn "$f/ does not exist — skipped"; continue; }
  if [[ -f "$dir/skills-lock.json" ]]; then
    n="$(jq '.skills | length' "$dir/skills-lock.json" 2>/dev/null || echo '?')"
    info "$f: skills-lock.json pins $n skills → npx -y skills experimental_install"
    jq -r '.skills | to_entries[] | "    \(.value.source) → \(.key)"' "$dir/skills-lock.json" >&2 2>/dev/null || true
  else
    info "$f: no skills-lock.json → PLAN.md §8 fallback list:"
    fallback_skills "$f" | sed 's/^/    /' >&2
  fi
  plan+=("$f")
done
(( ${#plan[@]} > 0 )) || die "no folders to process"

if [[ "$DRY_RUN" != "1" ]]; then
  confirm "Install agent skills into: ${plan[*]} (writes <folder>/.claude/skills and .agents/skills)"
fi

for f in "${plan[@]}"; do
  dir="$ROOT_DIR/$f"
  step "$f"
  if [[ -f "$dir/skills-lock.json" ]]; then
    args=(experimental_install)
    [[ "$DRY_RUN" == "1" ]] && args+=(--dry-run)
    (cd "$dir" && npx -y skills "${args[@]}")
    if [[ "$DRY_RUN" == "1" ]]; then ok "$f: dry run only"; else ok "$f: restored from skills-lock.json"; fi
  else
    count=0
    while read -r repo skill; do
      [[ -n "$repo" ]] || continue
      if [[ "$DRY_RUN" == "1" ]]; then
        dim "  would run: npx -y skills add $repo --skill $skill -a claude-code -y"
      else
        (cd "$dir" && npx -y skills add "$repo" --skill "$skill" -a claude-code -y)
      fi
      count=$((count + 1))
    done < <(fallback_skills "$f")
    ok "$f: installed $count skills (commit $f/skills-lock.json)"
  fi
done

ok "skills done → next: scripts/02-create-accounts.sh"
