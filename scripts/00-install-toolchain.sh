#!/usr/bin/env bash
# Check (and where safe, install) the toolchain Pratala needs.
#
#   CHECK_ONLY=1 scripts/00-install-toolchain.sh   → prints a version table, installs nothing,
#                                                     exits 1 if anything required is missing
#   scripts/00-install-toolchain.sh                 → same table, then offers to install the
#                                                     Rust-side tools (rustup target, cargo-binstall,
#                                                     cargo-near, near-cli-rs); YES=1 skips the prompt
#
# Rust tools are installed only through rustup / cargo binstall / cargo install --locked.
# No curl|sh installers. Node, pnpm, Docker and jq are checked and a package-manager hint is printed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

CARGO_NEAR_VERSION="${CARGO_NEAR_VERSION:-0.23.0}"
NEAR_CLI_VERSION="${NEAR_CLI_VERSION:-0.31.1}"
NODE_MAJOR_MIN="${NODE_MAJOR_MIN:-24}"
PNPM_MAJOR="${PNPM_MAJOR:-12}"
CHECK_ONLY="${CHECK_ONLY:-0}"

step "Pratala toolchain check"
expect "a table of tool → version; every row ✓ (missing rows say how to install)"

missing=()
installable=()

ver() { "$@" 2>/dev/null | head -n 1 || true; }

row() { # row <status ok|miss|warn> <tool> <detail>
  case "$1" in
    ok)   ok   "$(printf '%-24s %s' "$2" "$3")" ;;
    warn) warn "$(printf '%-24s %s' "$2" "$3")" ;;
    *)    err  "$(printf '%-24s %s' "$2" "$3")" ;;
  esac
}

# --- rustup / rustc / wasm target
if command -v rustup >/dev/null 2>&1; then
  row ok rustup "$(ver rustup --version)"
  # smart-contract/rust-toolchain.toml pins 1.95.0; query inside that dir so we see the pinned toolchain.
  rc_dir="$ROOT_DIR/smart-contract"; [[ -d "$rc_dir" ]] || rc_dir="$ROOT_DIR"
  row ok rustc "$(cd "$rc_dir" && ver rustc --version)"
  if (cd "$rc_dir" && rustup target list --installed 2>/dev/null | grep -qx wasm32-unknown-unknown); then
    row ok "wasm32-unknown-unknown" "installed"
  else
    row miss "wasm32-unknown-unknown" "missing → rustup target add wasm32-unknown-unknown"
    installable+=(wasm-target)
  fi
else
  row miss rustup "missing → install rustup from your OS package manager (brew install rustup / apt install rustup) or see https://rustup.rs"
  missing+=(rustup)
fi

# --- cargo-binstall
if command -v cargo-binstall >/dev/null 2>&1; then
  row ok cargo-binstall "$(ver cargo-binstall -V)"
elif command -v cargo >/dev/null 2>&1; then
  row warn cargo-binstall "missing → cargo install --locked cargo-binstall (optional; speeds up the next two)"
  installable+=(cargo-binstall)
fi

# --- cargo-near
if command -v cargo-near >/dev/null 2>&1; then
  row ok cargo-near "$(ver cargo near --version)"
else
  row miss cargo-near "missing → cargo binstall -y cargo-near@$CARGO_NEAR_VERSION"
  installable+=(cargo-near)
fi

# --- near-cli-rs (binary 'near'; beware the JS near-cli with the same name)
if command -v near >/dev/null 2>&1 && near --version 2>/dev/null | grep -q near-cli-rs; then
  row ok "near (near-cli-rs)" "$(ver near --version)"
elif command -v near >/dev/null 2>&1; then
  row miss "near (near-cli-rs)" "'near' is not near-cli-rs ($(ver near --version)) → cargo binstall -y near-cli-rs@$NEAR_CLI_VERSION"
  installable+=(near-cli-rs)
else
  row miss "near (near-cli-rs)" "missing → cargo binstall -y near-cli-rs@$NEAR_CLI_VERSION"
  installable+=(near-cli-rs)
fi

# --- node ≥ 24
if command -v node >/dev/null 2>&1; then
  node_v="$(node -v)"; node_major="${node_v#v}"; node_major="${node_major%%.*}"
  if (( node_major >= NODE_MAJOR_MIN )); then row ok node "$node_v"
  else row miss node "$node_v < v$NODE_MAJOR_MIN → nvm install $NODE_MAJOR_MIN (repo has .nvmrc) or brew install node@$NODE_MAJOR_MIN"; missing+=(node)
  fi
else
  row miss node "missing → nvm install $NODE_MAJOR_MIN or brew install node@$NODE_MAJOR_MIN"; missing+=(node)
fi

# --- pnpm
if command -v pnpm >/dev/null 2>&1; then
  row ok pnpm "$(ver pnpm -v)"
else
  row miss pnpm "missing → npm install -g pnpm@$PNPM_MAJOR"
  missing+=(pnpm)
fi

# --- docker + compose v2
if command -v docker >/dev/null 2>&1; then
  row ok docker "$(ver docker --version)"
  if docker compose version >/dev/null 2>&1; then row ok "docker compose" "$(ver docker compose version)"
  else row miss "docker compose" "compose v2 plugin missing → install Docker Desktop or docker-compose-plugin"; missing+=(compose)
  fi
  if ! docker info >/dev/null 2>&1; then row warn "docker daemon" "not running (start Docker Desktop before docker compose up)"; fi
else
  row miss docker "missing → install Docker Desktop / docker-ce"; missing+=(docker)
fi

# --- jq (scripts need it) and curl
for t in jq curl; do
  if command -v "$t" >/dev/null 2>&1; then row ok "$t" "$(ver "$t" --version)"
  else row miss "$t" "missing → brew install $t / apt-get install -y $t"; missing+=("$t")
  fi
done

# --- optional extras
if command -v shellcheck >/dev/null 2>&1; then row ok shellcheck "$(ver shellcheck --version | sed -n 2p)"; else row warn shellcheck "optional → brew install shellcheck"; fi
if command -v gitleaks >/dev/null 2>&1; then row ok gitleaks "$(ver gitleaks version)"; else row warn gitleaks "optional (secret scan before submission) → brew install gitleaks"; fi

if [[ "$CHECK_ONLY" == "1" ]]; then
  log ""
  if (( ${#missing[@]} + ${#installable[@]} == 0 )); then
    ok "CHECK_ONLY: toolchain complete"
    exit 0
  fi
  err "CHECK_ONLY: missing → ${missing[*]:-} ${installable[*]:-}"
  exit 1
fi

if (( ${#installable[@]} > 0 )); then
  confirm "Install via rustup/cargo: ${installable[*]}"
  for item in "${installable[@]}"; do
    case "$item" in
      wasm-target)
        (cd "$ROOT_DIR/smart-contract" 2>/dev/null || cd "$ROOT_DIR"; rustup target add wasm32-unknown-unknown) ;;
      cargo-binstall)
        cargo install --locked cargo-binstall ;;
      cargo-near)
        if command -v cargo-binstall >/dev/null 2>&1; then cargo binstall -y "cargo-near@$CARGO_NEAR_VERSION"
        else cargo install --locked "cargo-near@$CARGO_NEAR_VERSION"; fi ;;
      near-cli-rs)
        if command -v cargo-binstall >/dev/null 2>&1; then cargo binstall -y "near-cli-rs@$NEAR_CLI_VERSION"
        else cargo install --locked "near-cli-rs@$NEAR_CLI_VERSION"; fi ;;
    esac
  done
  ok "installed: ${installable[*]} — re-run with CHECK_ONLY=1 to confirm"
fi

if (( ${#missing[@]} > 0 )); then
  warn "still missing (install with your package manager, see hints above): ${missing[*]}"
  exit 1
fi
ok "toolchain ready → next: scripts/01-install-skills.sh"
