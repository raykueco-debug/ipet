#!/usr/bin/env bash
# The try-out copy (public: github.com/raykueco-debug/fox-pick, app/ → raykueco-debug.github.io/fox-pick/app/): ipet's
# app as it is committed — every file the pages use, none of the making of them (tools, docs, GPT's sheets, Wan's
# input pictures, the LAN server) — copied into ../fox-pick/app, what's gone from ipet gone from there too.
# usage: bash tools/sync_foxpick.sh [--push]     (--push: commit "App <version>" there and push)
set -eu
IPET="$(cd "$(dirname "$0")/.." && pwd)"
FP="$IPET/../fox-pick"
APP="$FP/app"
cd "$IPET"
LIST="$(mktemp)"
git ls-files | grep -vE '^(\.claude/|tools/|docs/|data/|assets/source/|assets/fox/wan_in/|README\.md$|\.gitignore$|localtts\.py$|server\.py$|requirements\.txt$)' > "$LIST"
mkdir -p "$APP"
# gone from ipet: gone from the copy
(cd "$APP" && find . -type f | sed 's|^\./||') | sort | comm -23 - <(sort "$LIST") | while read -r f; do rm -f "$APP/$f"; done
find "$APP" -type d -empty -delete
# the rest: copied where changed
n=0
while read -r f; do
  if ! cmp -s "$f" "$APP/$f" 2>/dev/null; then mkdir -p "$APP/$(dirname "$f")"; cp "$f" "$APP/$f"; n=$((n + 1)); fi
done < "$LIST"
rm -f "$LIST"
VER="$(grep -o 'v20[0-9.]*-[0-9]*' index.html | head -1)"
echo "$n files copied ($VER)"
if [ "${1:-}" = --push ]; then
  cd "$FP" && git add -A app && git commit -qm "App $VER" && git push -q && echo "pushed: https://raykueco-debug.github.io/fox-pick/app/"
fi
