#!/bin/sh
# Stop hook: typecheck and lint before the agent finishes.
# On failure, print the output to stderr and exit 2 so Claude Code shows it to the agent.

input=$(cat)
# Already continuing because of this hook: let it stop, so it never loops.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! out=$( (npm run --silent typecheck && npm run --silent lint) 2>&1); then
  printf 'npm run typecheck && npm run lint failed:\n%s\n' "$out" >&2
  exit 2
fi
exit 0
