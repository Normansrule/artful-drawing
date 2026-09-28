#!/usr/bin/env bash
# Check every outside link on the site and list any that fail.
# Usage: bash scripts/check-links.sh
set -uo pipefail
cd "$(dirname "$0")/.."
urls=$(grep -ohE 'href="https?://[^"]+"' ./*.html | sed -E 's/^href="|"$//g' | sort -u | grep -v 'fonts.g')
fail=0
for u in $urls; do
  code=$(curl -s -o /dev/null -L --max-time 15 -A 'Mozilla/5.0 artful drawing link check' -w '%{http_code}' "$u")
  if [[ "$code" =~ ^(2|3) ]]; then printf 'ok   %s  %s\n' "$code" "$u"
  else printf 'FAIL %s  %s\n' "$code" "$u"; fail=$((fail + 1)); fi
done
echo "$fail link(s) failed. Some sites (museums, Flickr) block scripts; open any FAIL in a browser to confirm."
