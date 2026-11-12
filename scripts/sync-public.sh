#!/usr/bin/env bash
# Two-way sync between the private dev repo and the public repo (run nightly by
# .github/workflows/sync-public.yml; can be run by hand in any clone).
#
# Needs two remotes in the current repo: $DEV_REMOTE (default "dev") and $PUBLIC_REMOTE
# (default "public"), both with a `main` branch.
#
# 1. Public → dev: commits merged on public main since the last "Sync from dev" commit are
#    cherry-picked (authors kept) onto a branch from dev main, pushed to dev as
#    $INCOMING_BRANCH, for a PR in dev. A conflict stops the run (exit 3).
# 2. Dev → public: dev main's files are published as one new commit on public main
#    ("Sync from dev, <date>", parent = public main), but only when every public change is
#    already in dev main, so nothing on public is ever lost. Otherwise publishing waits.
#    CHANGELOG.md's Unreleased entries are first dated on dev main (one commit there) and
#    become the public commit's description (scripts/changelog.ts).
#
# Env: DRY_RUN=1 (no pushes), PUBLISH_ALLOWED=0 (skip step 2, e.g. dev checks not green),
# SYNC_DATE (default: today, UTC). Writes key=value to $GITHUB_OUTPUT and Markdown to
# $GITHUB_STEP_SUMMARY when those are set.
set -euo pipefail
# Name the failing command in the log (a failing $(…) would otherwise exit silently).
trap 'echo "::error::sync-public.sh line $LINENO failed: $BASH_COMMAND" >&2' ERR

DEV_REMOTE=${DEV_REMOTE:-dev}
PUBLIC_REMOTE=${PUBLIC_REMOTE:-public}
INCOMING_BRANCH=${INCOMING_BRANCH:-sync/from-public}
DRY_RUN=${DRY_RUN:-0}
PUBLISH_ALLOWED=${PUBLISH_ALLOWED:-1}
SYNC_DATE=${SYNC_DATE:-$(date -u +%F)}
BOT_NAME="github-actions[bot]"
BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
PREFIX="Sync from dev, "
BOT_RE="41898282+github-actions\\[bot\\]"

out() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1=$2" >> "$GITHUB_OUTPUT"; return 0; }
say() { echo "$*"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY"; return 0; }
bot() { GIT_AUTHOR_NAME="$BOT_NAME" GIT_AUTHOR_EMAIL="$BOT_EMAIL" GIT_COMMITTER_NAME="$BOT_NAME" GIT_COMMITTER_EMAIL="$BOT_EMAIL" "$@"; }
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
push() { if [ "$DRY_RUN" = 1 ]; then say "- (dry run) would push: git push $*"; else git push "$@"; fi; }

git fetch -q "$DEV_REMOTE" main
git fetch -q "$PUBLIC_REMOTE" main
dev=$(git rev-parse "refs/remotes/$DEV_REMOTE/main")
pub=$(git rev-parse "refs/remotes/$PUBLIC_REMOTE/main")
dev_tree=$(git rev-parse "$dev^{tree}")
pub_tree=$(git rev-parse "$pub^{tree}")

# The last snapshot on public (first-parent), or the commit both repos share before any sync.
base=$(git log --first-parent -n1 --format=%H --author="$BOT_RE" --grep="^$PREFIX" "$pub")
if [ -z "$base" ] && ! base=$(git merge-base "$dev" "$pub"); then
  # No shared history (the public repo was re-created or squashed by another tool): start from
  # the newest public commit whose files equal some dev commit's files.
  dev_trees=$(git log --format=%T "$dev")
  base=""
  for c in $(git rev-list --first-parent --max-count=500 "$pub"); do
    if grep -qx "$(git rev-parse "$c^{tree}")" <<<"$dev_trees"; then base=$c; break; fi
  done
  if [ -z "$base" ]; then
    echo "::error::dev main and public main share no history, and no public commit has the same files as any dev commit. Public main is $(git log -1 --format='%h \"%s\" (%an, %ad)' --date=short "$pub")." >&2
    exit 4
  fi
  echo "No shared history; starting from public \`${base:0:7}\` (same files as a dev commit)."
fi

say "### Sync with public"
say "- dev main \`${dev:0:7}\`, public main \`${pub:0:7}\`, last sync point \`${base:0:7}\`"

incoming=$(git rev-list --reverse --no-merges "$base..$pub")
out incoming_count "$(echo -n "$incoming" | grep -c . || true)"

# Are all public changes already in dev? (Merging them into dev changes nothing.)
absorbed=0
if merged=$(git merge-tree --write-tree --merge-base="$base" "$dev" "$pub" 2>/dev/null | head -n1); then
  [ "$merged" = "$dev_tree" ] && absorbed=1
fi

# 1. Public → dev
out incoming false
if [ "$absorbed" = 0 ] && [ -n "$incoming" ]; then
  say "- Public has commits that dev main doesn't: copying them onto \`$INCOMING_BRANCH\`"
  git checkout -q -B "$INCOMING_BRANCH" "$dev"
  for c in $incoming; do
    say "  - \`${c:0:7}\` $(git log -1 --format='%s (%an)' "$c")"
    if ! git cherry-pick -x --allow-empty "$c" >/dev/null 2>&1; then
      if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
        say "- **Conflict** copying \`${c:0:7}\`: resolve by hand (cherry-pick it onto a branch from dev main, open a PR in dev)."
        git cherry-pick --abort
        out conflict true
        exit 3
      fi
      git cherry-pick --skip   # already in dev: nothing to copy
    fi
  done
  if [ "$(git rev-parse HEAD^{tree})" != "$dev_tree" ]; then
    push -f "$DEV_REMOTE" "HEAD:refs/heads/$INCOMING_BRANCH"
    out incoming true
  fi
  git checkout -q --detach "$dev"
fi

# 2. Dev → public
if [ "$dev_tree" = "$pub_tree" ]; then
  say "- Public main already matches dev main: nothing to publish."
  out published false
elif [ "$absorbed" = 0 ]; then
  say "- **Not publishing:** public has changes that aren't in dev main yet. Merge the \"Changes from public\" PR in dev; the next run publishes."
  out published false
elif [ "$PUBLISH_ALLOWED" != 1 ]; then
  say "- **Not publishing:** dev main's checks aren't all green."
  out published false
else
  # Changelog: move CHANGELOG.md's Unreleased entries under tonight's date, as a commit on
  # dev main, so dev and public keep the same file. The new dated sections become the
  # public commit's description.
  notes=""
  if git cat-file -e "$dev:CHANGELOG.md" 2>/dev/null; then
    tmp=$(mktemp -d)
    git show "$dev:CHANGELOG.md" > "$tmp/new.md"
    node --experimental-strip-types --disable-warning=ExperimentalWarning "$HERE/changelog.ts" release "$tmp/new.md" "$SYNC_DATE"
    if ! git show "$dev:CHANGELOG.md" | cmp -s - "$tmp/new.md"; then
      blob=$(git hash-object -w "$tmp/new.md")
      GIT_INDEX_FILE="$tmp/index" git read-tree "$dev"
      GIT_INDEX_FILE="$tmp/index" git update-index --cacheinfo "100644,$blob,CHANGELOG.md"
      dev_tree=$(GIT_INDEX_FILE="$tmp/index" git write-tree)
      dated=$(bot git commit-tree "$dev_tree" -p "$dev" -m "Changelog: published ${SYNC_DATE}")
      push "$DEV_REMOTE" "$dated:refs/heads/main"
      say "- Changelog: Unreleased moved under ${SYNC_DATE} on dev main (\`${dated:0:7}\`)$([ "$DRY_RUN" = 1 ] && echo ", not pushed: dry run")."
    fi
    if git cat-file -e "$pub:CHANGELOG.md" 2>/dev/null; then git show "$pub:CHANGELOG.md" > "$tmp/old.md"; else : > "$tmp/old.md"; fi
    notes=$(node --experimental-strip-types --disable-warning=ExperimentalWarning "$HERE/changelog.ts" notes "$tmp/new.md" "$tmp/old.md")
    rm -rf "$tmp"
  fi
  msg="${PREFIX}${SYNC_DATE}"
  [ -n "$notes" ] && msg="$msg

$notes"
  snap=$(bot git commit-tree "$dev_tree" -p "$pub" -m "$msg")
  push "$PUBLIC_REMOTE" "$snap:refs/heads/main"
  if [ "$DRY_RUN" = 1 ]; then say "- Would publish dev main to public main as \`${snap:0:7}\`."; else say "- Published dev main to public main as \`${snap:0:7}\`."; fi
  out published true
fi
