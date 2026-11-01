# Releasing redscript-mc

The compiler npm package, GitHub release and documentation site are one release
operation. VS Code, the web IDE and TestHarness have independent release scopes.

## Publication boundary

`publish-npm.yml` no longer follows ordinary main CI completion.

- A `vX.Y.Z` tag must exactly match the checked-out package version.
- The tag commit must be contained in `origin/main`.
- Manual execution defaults to no publication. If the exact version already
  exists, planning skips it; that does not prove a new OIDC publication worked.
- Verification builds, runs the non-performance correctness selection, packs once,
  installs that exact tarball, and checks npm dry-run metadata and file policy.
- A separate OIDC-only job receives the verified artifact. It checks commit and
  tarball hashes before writing, then reads registry integrity and `latest` back.
- Registry 404 means absent. Authentication, network and other HTTP errors fail
  closed. Never reinterpret every failed lookup as an unpublished version.

## Prepare a version

1. Update package and lockfile versions, changelog, migration guide and release notes.
2. Build with `REDSCRIPT_PACKAGE_VSCODE=0 npm run build`.
3. Run `npm run test:unit:correctness` and `npm run smoke:package`.
4. Check generated references against the docs checkout and build that site.
5. Sign and merge the reviewed source commit, then create and push a signed
   `vX.Y.Z` tag. Do not move an already-pushed release tag to fix publisher tooling.

A tagged push normally starts publication. A commit containing `[skip ci]` can
also suppress the tagged push workflow. Inspect runs for that exact commit before
using the explicit manual path, so two release runs are not started accidentally.

## Manual execution

Default planning/dry-run, without a registry write:

```sh
gh workflow run publish-npm.yml --repo bkmashiro/redscript --ref main
```

After explicit approval to publish the named version:

```sh
gh workflow run publish-npm.yml --repo bkmashiro/redscript --ref main \
  -f tag=vX.Y.Z -f publish=true
```

The current workflow definition can fix publishing infrastructure while the
compiler checkout remains bound to the unchanged version tag. Setup-node exports
a dummy `NODE_AUTH_TOKEN`; clear it at the final publication **step**, not merely
at job level, so the OIDC-only guard does not mistake that placeholder for a token.
The npm Trusted Publisher must identify `bkmashiro/redscript`, `publish-npm.yml`
and the same environment setting as the job. Do not add a long-lived token fallback.

## Verify and finish

Inspect the owning publish run. A green verification job alone is not publication.
After an explicit npm success receipt, allow bounded read-replica propagation and
verify the exact version, `latest`, provenance and tarball integrity. Do not retry
a write blindly after a successful receipt.

Install `redscript-mc@X.Y.Z` from the public registry in a new consumer, check
CJS/ESM usage and the installed CLI, then create the GitHub release from the
existing signed tag. Upload the tested tarball, release manifest and checksums.
Deploy the matching docs to the existing Cloudflare Pages project and verify the
public English/Chinese pages. Record final handles in the roadmap, not global
agent memory. Clean temporary consumers, download directories and helper caches.
