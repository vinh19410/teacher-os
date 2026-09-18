---
title: Import hardening #145
status: completed
issue: 145
branch: fix/import-hardening-145
---

# Outcome
Complete the three items in #145 on beta without changing import grouping or adding features. #147 and #148 overlap items 1 and 3; they are not dependency edges.

## Evidence and scope
- Parser already enforces title 500 and text 10,000 at apps/web/src/lib/syllabus-import.ts:153-192. Preserve and verify existing tests.
- POST /syllabi reads JSON without a byte bound at apps/server/src/routes/kernel.ts:1264. Add route-scoped Hono bodyLimit before JSON parsing, 2 MiB serialized request limit, JSON 413 response. Preserve authentication and existing 400/schema behavior. No other endpoints change.
- Imported count overrides manual total at apps/web/src/components/modals/add-syllabus-modal.tsx:111-112 while the control at :223 is editable. Disable it after successful import, show why, restore editing when import removed/failed. Preserve count on remove.

## Phase
[Implementation and verification](phase-01-import-hardening.md)

## Acceptance
- Existing field-length parser boundary tests pass.
- Oversized syllabus create body returns 413 before JSON parsing/database work; normal create behavior and authentication remain intact.
- Successful import locks the displayed count; removing the import restores editing.
- Focused tests, runtime UI verification, independent review, beta PR merge and target CI green.

## Validation
Five source claims checked from displayed sections: parser caps, field override, editable count, route JSON read, 2 MiB existing file cap. All verified. Serialized-body cap is distinct from compressed file size; 413 is the deliberate bound for expanded imports. No public exported symbol rename, schema migration or broad endpoint change.

## Risks
File bytes and expanded JSON bytes differ. Return a clear JSON error for the new limit. Validate the route middleware with missing Content-Length as well as ordinary requests. Keep auth before the byte limiter. Do not add retries or expand settings/pilot scope.

## Review and verification receipts
- Assumption review approved modal/parser scope: 0 Critical / 0 Important. Security subagent stalled and was cancelled; bounded independent review found no Critical/Important defect. Hono route composition is exercised by the 150 passing server tests. Transport Content-Length enforcement remains an upstream assumption of Hono bodyLimit.
- Parser 28/28; server kernel 150/150; web build/type-check and server type-check passed. Biome passed on affected files.
- Browser smoke: actual signup succeeded; CSV fixture preview showed 3 lessons and disabled count; removing file preserved 3 and restored editing. Screenshot captured locally. Complete file-picker/persist UI replay was not completed due automation selector timeouts; server valid-create tests cover persistence.
- Initial browser selector failures were incorrectly attributed to stale signup IDs. CI proved signup works (60 E2E passed). Two import cases failed because the added paragraph made Field multi-child and removed its automatic input ID. Corrected by using Field.help; retained label-based assertions. CI failure evidence: run 35206563728.
- Whole-plan sweep: all three #145 items retained; parser unchanged because already implemented; beta only.
- After Field.help correction, all 5 import Playwright scenarios passed locally: CSV, XLSX, legacy import, popup persistence, removal/error transitions (13.1s).
