# SRS Conformance Vectors

Files in this directory are copied byte-identically from **Flinto** (`dev` @ `b9ec13c`):

- `generate-level-vectors.mjs`: Dependency-free JS reference implementation of `docs/srs-spec.md` (v2, 5 memory levels).
- `level-vectors.json`: Generated conformance vectors tested across iOS, Android, and `teacher-os`.

## Commands

Verify that `level-vectors.json` matches the reference generator:

```bash
node packages/api/src/srs/vectors/generate-level-vectors.mjs --check
# or via package script:
pnpm --filter @teacher-os/api run verify:vectors
```

Regenerate `level-vectors.json` (only if spec constants or reference rules intentionally change):

```bash
node packages/api/src/srs/vectors/generate-level-vectors.mjs
```

> **Warning:** Never edit `level-vectors.json` by hand. Any change to SRS constants (`LEVEL_INTERVAL_DAYS`, `WARNING_INTERVAL_DAYS`, typing rules, or learn step rules) must be made in `generate-level-vectors.mjs` and regenerated.
