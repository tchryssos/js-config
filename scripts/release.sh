#!/usr/bin/env bash
# Tags a release when main has changes repos would get, run by
# .github/workflows/release.yml on every push to main.
#
# - package.json's version is ahead of the last tag (bumped by hand for a
#   minor/major release): tag it as is.
# - Otherwise, if anything the package ships (package.json and its `files`)
#   changed since the last tag, e.g. a merged Dependabot PR: bump the patch
#   version, commit, and tag.
# - Otherwise (tests, CI, docs only): do nothing.
#
# Uses only git and node's standard library; never installs or runs
# dependencies. Set DRY_RUN=1 to print what it would do without committing or
# pushing.
set -euo pipefail

run() {
  if [ -n "${DRY_RUN:-}" ]; then echo "would run: $*"; else "$@"; fi
}

last=$(git describe --tags --abbrev=0 --match 'v*')
version=$(node -p "require('./package.json').version")

if [ "v$version" != "$last" ]; then
  if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
    echo "package.json says $version, which is already tagged but isn't the latest tag ($last)." >&2
    exit 1
  fi
  echo "Version bumped by hand to $version."
else
  read -ra shipped <<<"package.json $(node -p "require('./package.json').files.join(' ')")"
  if git diff --quiet "$last" HEAD -- "${shipped[@]}"; then
    echo "Nothing shipped has changed since $last."
    exit 0
  fi
  version=$(node -e "
    const fs = require('node:fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    pkg.version = [major, minor, patch + 1].join('.');
    if (!process.env.DRY_RUN) {
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    }
    console.log(pkg.version);
  ")
  echo "Shipped files changed since $last; releasing patch $version."
  run git commit -qam "Release v$version"
  run git push -q origin HEAD:main
fi

run git tag "v$version"
run git push -q origin "v$version"
echo "Released v$version."
