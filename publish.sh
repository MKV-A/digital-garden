#!/bin/bash
# One-command publish: sync flagged notes from vault, commit, and push.
set -e
cd "$(dirname "$0")"

npm run sync --silent

git add -A
if git diff --cached --quiet; then
  echo "Inget nytt att publicera."
  exit 0
fi

git commit -q -m "Publish update $(date '+%Y-%m-%d %H:%M')"
git push -q
echo "Publicerat: https://mkv-a.github.io/digital-garden/"
