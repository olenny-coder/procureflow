# Vendored engine provenance

ProcureFlow vendors the workflow engine **server** source under `third_party/temporal/`.
The tree is the upstream tree plus the small ProcureFlow patch set documented in
[`VENDOR_MODIFICATIONS.md`](./VENDOR_MODIFICATIONS.md). The app never imports
files from this directory; it only uses the official workflow SDK packages and
the gRPC endpoint.

## Upstream base

| Field | Value |
| --- | --- |
| Repository | https://github.com/temporalio/temporal |
| Branch | `main` |
| Release tag at download | `v1.32.1` (latest release on 2026-10-08) |
| Base commit | `96a50b1db5baea9650310cbd8b16409e95597188` |
| Base commit date | 2026-11-02T06:48:06Z |
| Downloaded | 2026-11-02 |
| `go.mod` server version | `1.33.0-dev` (`common/headers/version_checker.go`: `1.33.0`) |
| Go toolchain | `go 1.27.3` (as declared in `third_party/temporal/go.mod`) |
| Local base tag | `vendor-base-96a50b1` |
| Verification | local `go.mod` SHA-256 matched upstream `96a50b1` exactly |

The upstream snapshot was imported in the first repository commit and tagged
`vendor-base-96a50b1`. All local edits live in commits after that tag, which is
what CI uses for the freshness check:

```bash
git diff --name-only vendor-base-96a50b1 -- third_party/temporal
```

> **Why a commit instead of a submodule?** The GitHub repository is public and
> stable, but the assignment requires the reworked tree to be present locally and
> locally patchable/buildable without a network fetch. Vendoring a pinned snapshot
> makes a fresh clone self-contained; we keep the exact upstream provenance above
> and the base tag so the patch set is auditable. Build artifacts (`.build/`,
> binaries) are gitignored.

## Updating the base (maintainers)

1. Replace `third_party/temporal/` with the new upstream checkout, preserving the
   files listed in `VENDOR_MODIFICATIONS.md`.
2. Update this file and `VENDOR_MODIFICATIONS.md`.
3. Commit the upstream import plus the re-applied patches, then move the
   `vendor-base-*` tag to the pure-upstream commit (or create a new one and
   update CI).
4. Run `pnpm engine:check`, `pnpm engine:build`, and the stock-engine CI job.

## Build environment

Building the reworked server requires **Go 1.27+** (the module's `go` directive is
`1.27.3`; `GOTOOLCHAIN=auto` downloads it if needed). The Docker image / stock
engine CLI is not required to develop against the reworked server. See
[`README.md`](./README.md#engine-rework-local-runtime).
