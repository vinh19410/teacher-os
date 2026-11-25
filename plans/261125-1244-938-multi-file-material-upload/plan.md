# Plan: Multi-file material upload across all teacher upload surfaces (#938)

- **Issue:** https://github.com/vinh19410/teacher-os/issues/938
- **Target branch:** `develop` (`--merge --beta`)
- **Status:** In Review

## Outcome & Acceptance Criteria

Allow teachers to select and upload multiple files at once across all 4 material upload surfaces in `apps/web` using a shared client-side upload queue (`fetch`, `concurrency = 3`), keeping existing backend API/DB contracts unchanged and preserving smooth single-file behavior:

1. `UploadDialog` (`/materials`): drag-and-drop + multi-pick (multi-round append, dedupe by `name + size + lastModified`, remove individual files before upload, per-file validation warnings while still uploading valid files, retry failed network/server files, lock modal close while uploading).
2. `ClassSharedMaterialsTab`, `SessionMaterialsModal`, `MaterialPicker`: `<input type="file" multiple>`, immediate upload on pick with compact inline progress list (`Progress` X/N, per-file statuses, retry failed button, dismiss button). `MaterialPicker` blocks upfront when valid files exceed remaining slots of `MATERIAL_LINKS_MAX = 20`. `SessionMaterialsModal` locks modal close while uploading.
3. Unit/component tests cover queue engine and all 4 surfaces; focused E2E spec verifies real multi-file upload on `/materials`.
4. Gates pass: `pnpm exec biome check .`, `pnpm run check-types`, `pnpm --filter web test`, `pnpm --filter server test`, `pnpm design:compare`, isolated review clean, PR merged to `develop`, POT posted on #938.

## Execution Waves (Disjoint File Ownership)

- **Wave 1 (`feat/938-wave1-upload-queue`):**
  - `apps/web/src/lib/material-upload-queue.ts` + `.test.ts`
  - `apps/web/src/components/materials/material-upload-queue.tsx` + `.test.tsx`
- **Wave 2 (Parallel, disjoint file ownership after Wave 1 merges):**
  - **2A (`feat/938-wave2-upload-dialog`):** `apps/web/src/components/materials/material-dialogs.tsx`, `apps/web/src/routes/_auth/materials/index.test.tsx`
  - **2B (`feat/938-wave2-class-shared`):** `apps/web/src/components/class-detail/class-shared-materials-tab.tsx`, `apps/web/src/components/class-detail/class-shared-materials-tab.test.tsx`
  - **2C (`feat/938-wave2-session-modal`):** `apps/web/src/components/class-detail/session-materials-modal.tsx`, `apps/web/src/components/class-detail/session-materials-modal.test.tsx`
  - **2D (`feat/938-wave2-material-picker`):** `apps/web/src/components/materials/material-picker.tsx`, `apps/web/src/components/materials/material-picker.test.tsx`
- **Wave 3 (Integration, E2E, UI QA & POT):**
  - Sequential merge of 2A..2D into `vinh19410/Upload-multiple-file` with tests after each merge.
  - Add multi-file E2E test + run with ports 8100–8105, capture 3-viewport light/dark POT screenshots, run `pnpm design:compare` and all gates.
- **Wave 4 (Isolated Final Review):**
  - Fresh `code-reviewer` subagent reviews diff against brief, `DESIGN.md`, `REVIEW.md`; fix and re-review until clean.
- **Wave 5 (Ship `--merge --beta`):**
  - Update `CHANGELOG.md`, remove temporary advise HTML preview, push PR to `develop`, verify CI green, squash-merge, update #938 labels & post POT comment.
