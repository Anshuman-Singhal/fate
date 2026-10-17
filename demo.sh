#!/usr/bin/env bash
# fate demo: tests plus a full ask/log/resolve/score loop.
# Uses the offline mock judge, so no API key or network is needed.
# Your real log (~/.fate) is untouched: everything runs in a temp dir.
set -euo pipefail
cd "$(dirname "$0")"

export FATE_HOME="$(mktemp -d)/fate-demo"
mkdir -p "$FATE_HOME"

echo "== 1. test suite =="
bun test

echo ""
echo "== 2. ask with evidence (mock judge, deterministic) =="
bun src/main.ts ask "Will I finish this project before dinner?" \
  --for "the core code is already written" \
  --for "tests are quick to write" --weight 2 \
  --against "demos always take longer than expected" \
  --log

echo ""
echo "== 3. ask with a skeptical prior =="
bun src/main.ts ask "Will it rain in Chicago tomorrow?" \
  --prior 0.3 \
  --for "dark clouds are gathering" \
  --against "the forecast says clear skies" \
  --log

echo ""
echo "== 4. resolve the first prediction, then score =="
FIRST_ID="$(bun src/main.ts list --json | node -e 'let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => console.log(JSON.parse(s)[0].id));')"
bun src/main.ts resolve "$FIRST_ID" no
bun src/main.ts score

echo ""
echo "== 5. doctor =="
bun src/main.ts doctor

echo ""
echo "Demo data lived in: $FATE_HOME"
echo "Your real log was untouched. Run without FATE_HOME to use ~/.fate."
