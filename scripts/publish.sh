#!/usr/bin/env bash
# Publish artful drawing as a GitHub repository with GitHub Pages turned on.
#
# Usage (from anywhere):
#   GH_OWNER=YourGitHubName bash scripts/publish.sh
# Optional:
#   REPO=artful-drawing          repository name (default: artful-drawing)
#   SSH_HOST=github.com      SSH host or ~/.ssh/config alias to push through
#   VISIBILITY=public        public or private (Pages on private repos needs a paid plan)
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${REPO:-artful-drawing}"
SSH_HOST="${SSH_HOST:-github.com}"
VISIBILITY="${VISIBILITY:-public}"
: "${GH_OWNER:?Set GH_OWNER to your GitHub username, e.g. GH_OWNER=octocat bash scripts/publish.sh}"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "Missing '$1'. Install it first (see README: Publish from a terminal)."; exit 1; }; }
need git; need gh; need node

say "Running the tests"
node --test

say "Checking GitHub login"
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol ssh --web
ACTIVE="$(gh api user --jq .login 2>/dev/null || true)"
if [ "${ACTIVE,,}" != "${GH_OWNER,,}" ]; then
  echo "The GitHub CLI is using '$ACTIVE'; switching to '$GH_OWNER'."
  gh auth switch --hostname github.com --user "$GH_OWNER" \
    || { echo "Log in as $GH_OWNER first: gh auth login --web --git-protocol ssh"; exit 1; }
fi

# Make this folder its own repository (never the home folder).
if [ ! -d .git ]; then
  say "Creating a new Git repository in $(pwd)"
  git init -b main
fi
# Point the README's badges and links at your account (whatever account they named before).
sed -i -E "s#YOUR-GITHUB-NAME#$GH_OWNER#g; s#https://[A-Za-z0-9-]+\.github\.io/artful-drawing/#https://${GH_OWNER,,}.github.io/$REPO/#g; s#github\.com/[A-Za-z0-9-]+/artful-drawing/#github.com/$GH_OWNER/$REPO/#g" README.md
git add -A
git -c core.autocrlf=false commit -m "artful drawing: draw anything with blocks that bloom" >/dev/null 2>&1 || echo "(nothing new to commit)"

say "Creating github.com/$GH_OWNER/$REPO"
if gh repo view "$GH_OWNER/$REPO" >/dev/null 2>&1; then
  echo "Repository already exists; reusing it."
else
  gh repo create "$GH_OWNER/$REPO" "--$VISIBILITY" \
    --description "drawing made easy: guided drawings, a symmetry pen, and simple shapes that mirror, spin and repeat. runs in your browser." \
    --homepage "https://$GH_OWNER.github.io/$REPO/"
fi

say "Pushing over SSH ($SSH_HOST)"
git remote remove origin 2>/dev/null || true
git remote add origin "git@$SSH_HOST:$GH_OWNER/$REPO.git"
git push -u origin main

say "Turning on GitHub Pages (main branch, root folder)"
if gh api "repos/$GH_OWNER/$REPO/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$GH_OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
else
  gh api -X POST "repos/$GH_OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
fi
gh repo edit "$GH_OWNER/$REPO" --homepage "https://$GH_OWNER.github.io/$REPO/" \
  --add-topic drawing --add-topic art --add-topic kids --add-topic generative-art --add-topic svg --add-topic creative-coding \
  --add-topic github-pages --add-topic accessibility --add-topic education >/dev/null

say "Waiting for the first Pages build (about a minute)"
for _ in $(seq 1 30); do
  status="$(gh api "repos/$GH_OWNER/$REPO/pages" --jq .status 2>/dev/null || echo pending)"
  printf '  status: %s\n' "$status"
  [ "$status" = "built" ] && break
  sleep 6
done

say "Done"
echo "Repository: https://github.com/$GH_OWNER/$REPO"
echo "Website:    https://$GH_OWNER.github.io/$REPO/"
