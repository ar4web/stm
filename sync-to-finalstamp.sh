#!/usr/bin/env bash
# sync-to-finalstamp.sh
# After building in Lovable (magic-html-ring.lovable.app), run this to push the
# updated standalone editor + OSS docs into the canonical public repo (FinalStamp).
#
# What it does:
#   1. Fetches latest stamp-studio (the Lovable-connected repo)
#   2. Extracts public/stamp/* (app.js, index.html, style.css, logo.svg)
#      + README.md, LICENSE, CONTRIBUTING.md
#   3. Drops them into the FinalStamp clone, prettier-formats
#   4. Commits + pushes FinalStamp
#
# Usage:  ./sync-to-finalstamp.sh
# Requirements: git, gh, npx (prettier), and local clones at:
#   STAMP_STUDIO = the Lovable repo (default: parent of this script)
#   FINALSTAMP    = clone of ar4web/FinalStamp (default: ../FinalStamp_sync)

set -euo pipefail

# ---- paths (override via env if your clones live elsewhere) ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP_STUDIO="${STAMP_STUDIO:-$SCRIPT_DIR}"
FINALSTAMP="${FINALSTAMP:-$(cd "$SCRIPT_DIR/../FinalStamp_sync" && pwd)}"

echo "▸ stamp-studio : $STAMP_STUDIO"
echo "▸ FinalStamp  : $FINALSTAMP"

# ---- 1. get latest Lovable output ----
cd "$STAMP_STUDIO"
echo "▸ fetching latest stamp-studio (Lovable) ..."
git fetch origin main --quiet
# extract public/stamp + docs directly from the remote tree (no checkout needed)
rm -rf .sync_tmp && mkdir -p .sync_tmp
git archive origin/main public/stamp README.md LICENSE CONTRIBUTING.md | tar -x -C .sync_tmp --strip-components=0

# ---- 2. copy into FinalStamp ----
cd "$FINALSTAMP"
git checkout main --quiet
git pull origin main --quiet
echo "▸ copying editor + docs into FinalStamp ..."
mkdir -p assets
cp "$STAMP_STUDIO/.sync_tmp/public/stamp/app.js"        app.js
cp "$STAMP_STUDIO/.sync_tmp/public/stamp/index.html"    index.html
cp "$STAMP_STUDIO/.sync_tmp/public/stamp/style.css"     style.css
cp "$STAMP_STUDIO/.sync_tmp/public/stamp/logo.svg"      logo.svg
cp "$STAMP_STUDIO/.sync_tmp/README.md"                  README.md
cp "$STAMP_STUDIO/.sync_tmp/LICENSE"                    LICENSE
cp "$STAMP_STUDIO/.sync_tmp/CONTRIBUTING.md"            CONTRIBUTING.md
[ -f "$STAMP_STUDIO/.sync_tmp/public/stamp/logo.svg" ] && cp "$STAMP_STUDIO/.sync_tmp/public/stamp/logo.svg" assets/ 2>/dev/null || true

# ---- 3. prettier format (LF, clean diffs) ----
echo "▸ prettier formatting ..."
npx --yes prettier --write app.js index.html style.css logo.svg README.md CONTRIBUTING.md >/dev/null 2>&1 || true

# ---- 4. commit + push ----
if git diff --quiet; then
  echo "✓ FinalStamp already up to date — nothing to push."
else
  git add -A
  git commit -m "Sync from Lovable stamp-studio: editor + OSS docs" --quiet
  git push origin main --quiet
  echo "✓ Pushed to ar4web/FinalStamp (public canonical repo)."
fi

# cleanup
rm -rf "$STAMP_STUDIO/.sync_tmp"
echo "▸ done."
