# Releasing DragView

This document is for maintainers. Public identity is fixed as:

- Brand and GitHub repository: `DragView`
- npm and DSH package: `dsh-dragview`
- Compatibility entry/settings ID: `drag-file`

The compatibility event `dsh-drag-file:add-pill`, capability `dshDragFileHost`, `/file-drop/*` routes, and `dsh-drag-file-*` browser identifiers must not be renamed in a routine release.

## Release gate

1. Start from a clean branch whose upstream is the intended release commit.
2. Confirm the GitHub repository is `https://github.com/anzhaohao/DragView` and has the `dsh-plugin` topic.
3. Install exactly from the lockfile with a supported Node version: `npm ci`.
4. Run `npm run build`, then confirm generated files have no diff.
5. Run `npm run check`, `npm test`, `npm pack --dry-run --json`, and `git diff --check`.
6. Create a real tarball with `npm pack --json`, record its SHA-256, and install that exact tarball in a temporary profile before publishing.
7. Back up the installed profile package, profile `package.json`, lockfile, and Cordis patch before replacing a deployed version.
8. Restart Hana Agent for host changes and complete a real DSH smoke test after restart.

Never place an npm token or one-time password in a command argument, log, issue, or chat. If npm requests an OTP, enter it only in the interactive npm prompt. Do not claim npm provenance unless the published version was produced by a configured trusted publisher with verifiable provenance.

## Publish order

1. Freeze the validated tarball and checksum.
2. Publish `dsh-dragview@<version>` from the verified release commit.
3. Verify npm metadata, repository URL, integrity, package contents, and a clean install.
4. Create immutable tag `v<version>` on the same commit.
5. Create the GitHub Release and attach the tarball and SHA-256 file.
6. If any published artifact is wrong, release a new patch version; do not move a public tag or overwrite an npm version.

## DSH plugin market

The market registry is `awesome-dsh-plugin/awesome-dsh-plugin`. Submit one entry at `data/plugins/anzhaohao__DragView.yml` with category `ui`; the registry derives npm metadata from this repository's `package.json`, so do not add an `npm:` field.

Before opening the PR, verify the registry's current contribution guide. At the time of the 0.1.0 preparation it required a repository at least one day old, at least ten genuine commits, a `dsh-plugin` topic, a valid `dsh.bundle` declaration, generated registry README files, and green CI. Never use empty, whitespace-only, or artificially fragmented commits to meet the history threshold.
