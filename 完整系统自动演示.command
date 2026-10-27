#!/bin/bash
set -e
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  exec node scripts/full-system-demo/run.cjs  --speed 2  "$@"
fi
DEMO_BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$DEMO_BUNDLED_NODE" ]; then
  exec "$DEMO_BUNDLED_NODE" scripts/full-system-demo/run.cjs  --speed 2  "$@"
fi
printf '请先安装Node.js 20或以上版本，再重新运行。\n'
exit 1
