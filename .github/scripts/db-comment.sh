#!/usr/bin/env bash
# Post issue-comment.md on issue $NUMBER, or edit the bot's earlier comment
# (the one starting with the sbg-db-check marker) so the issue keeps one up-to-date comment.
set -euo pipefail
id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$NUMBER/comments" --paginate \
  --jq '.[] | select(.user.login == "github-actions[bot]" and (.body | startswith("<!-- sbg-db-check -->"))) | .id' | head -n 1)
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F body=@issue-comment.md > /dev/null
else
  gh issue comment "$NUMBER" --repo "$GITHUB_REPOSITORY" --body-file issue-comment.md
fi
