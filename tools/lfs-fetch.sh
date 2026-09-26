#!/bin/bash
# Resolve Git LFS pointer stubs under public/assets/ without the git-lfs binary (cloud containers
# check the repo out without it, so every authored asset silently fell back to procedural shapes —
# docs/critic/game-round7-blind.md). Uses GitHub's LFS batch API, verifies each file's sha256, and
# marks it skip-worktree so git never stages the binary as a plain blob. A no-op where git-lfs
# already resolved the files. Never fails the caller: missing network just leaves the fallbacks.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
url="$(git remote get-url origin 2>/dev/null | sed -E 's#^git@github.com:#https://github.com/#; s/\.git$//').git/info/lfs/objects/batch"
n=0; fail=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  head -c 40 "$f" | grep -q '^version https://git-lfs' || continue
  oid=$(sed -n 's/^oid sha256://p' "$f"); size=$(sed -n 's/^size //p' "$f")
  href=$(curl -sS -m 30 -X POST "$url" -H 'Accept: application/vnd.git-lfs+json' -H 'Content-Type: application/vnd.git-lfs+json' \
    -d "{\"operation\":\"download\",\"transfers\":[\"basic\"],\"objects\":[{\"oid\":\"$oid\",\"size\":$size}]}" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).objects[0].actions.download.href)}catch{}})')
  if [ -n "$href" ] && curl -sS -m 300 -o "$f.lfstmp" "$href" 2>/dev/null && echo "$oid  $f.lfstmp" | sha256sum -c --quiet 2>/dev/null; then
    mv "$f.lfstmp" "$f" && git update-index --skip-worktree "$f" && n=$((n+1))
  else rm -f "$f.lfstmp"; fail=$((fail+1)); fi
done < <(git ls-files 'public/assets/**')
[ $((n+fail)) -gt 0 ] && echo "[lfs-fetch] resolved $n LFS asset(s), $fail failed (failures keep their procedural fallback)"
exit 0
