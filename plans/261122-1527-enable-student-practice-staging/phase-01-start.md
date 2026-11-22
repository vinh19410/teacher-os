---
phase: 1
title: "Phase 1: Infra Wiring, Assemble Guard & Staging Workflow (TDD)"
status: pending
priority: P1
effort: "35m"
dependencies: []
---

# Phase 1: Infra Wiring, Assemble Guard & Staging Workflow (TDD)

## Goal

Nối cờ hạ tầng `STUDENT_PRACTICE_ENABLED` từ step deploy trong `.github/workflows/deploy-staging.yml` qua `packages/infra/alchemy.run.ts` (`resolveStudentPracticeEnabled`) vào `Cloudflare.Website.Vite("lms", { env })`, bổ sung fail-fast guard cho `apps/student` trong `apps/lms/scripts/assemble-dist.mjs`, và giữ Production fail-closed kèm bộ test TDD (Red → Green) + characterization tests.

<!-- Updated: Red Team Session 2026-11-22 - Findings 1, 2, 3, 5, 7 applied -->

## Files to Create / Modify

- Modify: `packages/infra/src/topology.ts`
- Modify: `packages/infra/src/topology.test.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/lms/scripts/assemble-dist.mjs`
- Modify: `apps/lms/scripts/assemble-dist.d.mts`
- Modify: `apps/lms/scripts/assemble-dist.test.ts`
- Modify: `apps/student/src/components/layout/student-nav.test.ts`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `scripts/topology-drift.test.mjs`

## Test Matrix

### Nhóm 1 — TDD thật (Red → Green: phải FAIL trước khi sửa code, PASS sau khi sửa)

| Test file | Case | Kỳ vọng |
|---|---|---|
| `packages/infra/src/topology.test.ts` | `resolveStudentPracticeEnabled(raw, appDomain)` với `"true"`, `" true "` trên staging/dev; `undefined`, `""`, `"   "`, `"false"` trên mọi domain; `"true"` trên `PROD_APP_DOMAIN`; giá trị không hợp lệ `"1"`, `"TRUE"`, `"ture"` | Trả `"true"` trên staging/dev; trả `"false"` khi rỗng/`"false"`; **throw** khi `"true"` trên `PROD_APP_DOMAIN`; **throw** với giá trị non-empty không hợp lệ |
| `apps/lms/scripts/assemble-dist.test.ts` | (a) `bundleMatchesStudentPracticeFlag` khớp cả nháy đơn/kép và property key có/không ngoặc kép; (b) `assemblePortalDists` với `rebuildPortals: false` ép rebuild `student` khi `apps/student/dist` cũ trùng `VITE_SERVER_URL` nhưng lệch `VITE_STUDENT_PRACTICE_ENABLED` (`false -> true` và `true -> false`); (c) fail-loud sau build nếu `student` bundle không khớp `VITE_STUDENT_PRACTICE_ENABLED` kỳ vọng (cả chiều thiếu `"true"` lẫn chiều rò `"true"` khi kỳ vọng `"false"`) | Phát hiện stale và fail-fast trước khi copy sang `apps/lms/dist/student` |
| `scripts/topology-drift.test.mjs` | Kiểm tra hợp đồng `deploy-staging.yml`, `deploy.yml`, `packages/infra/alchemy.run.ts` | `deploy-staging.yml` đặt `STUDENT_PRACTICE_ENABLED: "true"` bên trong step `Deploy to Cloudflare (stage staging)` (không đặt `VITE_STUDENT_PRACTICE_ENABLED` ở top-level/step); `deploy.yml` không tham chiếu `STUDENT_PRACTICE_ENABLED` hay `VITE_STUDENT_PRACTICE_ENABLED` (kể cả `vars.*`); `alchemy.run.ts` dùng `resolveStudentPracticeEnabled` nối `VITE_STUDENT_PRACTICE_ENABLED` vào `Cloudflare.Website.Vite("lms")` `env` |

### Nhóm 2 — Characterization / Regression Tests (khoá hành vi sẵn có + đường `config.define`)

| Test file | Case | Kỳ vọng |
|---|---|---|
| `apps/lms/scripts/assemble-dist.test.ts` | `extractViteEnvFromConfig` giải mã `config.define["import.meta.env.VITE_STUDENT_PRACTICE_ENABLED"]` (`"true"` và `"false"`) ghi đè `process.env` / `config.env` cũ | `config.define` luôn thắng độ ưu tiên cao nhất |
| `apps/student/src/components/layout/student-nav.test.ts` | Import động `./student-nav` với `vi.stubEnv("VITE_STUDENT_PRACTICE_ENABLED", "true" | "false" | "")` kèm `afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); })` | `"true"` → `PRACTICE_ROUTES_LIVE === true`, `STUDENT_NAV` có 7 mục (gồm `Luyện tập` 5 skill + `Lịch sử`); `"false"` / `""` → `PRACTICE_ROUTES_LIVE === false`, 5 mục; không rò rỉ stub sang test sau |

## Tasks & Steps

1. **Viết test trước (Red cho Nhóm 1, thêm Nhóm 2):**
   - Bổ sung test cho `resolveStudentPracticeEnabled` trong `packages/infra/src/topology.test.ts`.
   - Bổ sung test trong `apps/lms/scripts/assemble-dist.test.ts` cho `extractViteEnvFromConfig` (`config.define`), `bundleMatchesStudentPracticeFlag`, stale-dist rebuild (`rebuildPortals: false`), và fail-loud hậu kiểm cho cả 2 chiều `"true"` / `"false"`.
   - Bổ sung test dynamic import có `afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); })` trong `apps/student/src/components/layout/student-nav.test.ts`.
   - Bổ sung test drift trong `scripts/topology-drift.test.mjs` cho `deploy-staging.yml`, `deploy.yml`, và `packages/infra/alchemy.run.ts`.
   - Chạy bộ test hẹp để xác nhận các test Nhóm 1 FAIL trước khi sửa code triển khai.

2. **Triển khai code (Green):**
   - Trong `packages/infra/src/topology.ts`, export `resolveStudentPracticeEnabled(raw: string | undefined, appDomain: string | undefined): "true" | "false"`:
     - Trim `raw ?? ""`: nếu `""` hoặc `"false"` → trả `"false"`.
     - Nếu `"true"`: kiểm tra `appDomain?.trim() === PROD_APP_DOMAIN` → throw Error (fail-closed trên PROD); ngược lại trả `"true"`.
     - Mọi giá trị non-empty khác → throw Error (fail-loud).
   - Trong `packages/infra/alchemy.run.ts`:
     - Import `resolveStudentPracticeEnabled` từ `./src/topology.ts`.
     - Tính `const studentPracticeEnabled = resolveStudentPracticeEnabled(process.env.STUDENT_PRACTICE_ENABLED, process.env.APP_DOMAIN);`.
     - Truyền `VITE_STUDENT_PRACTICE_ENABLED: studentPracticeEnabled` vào `Cloudflare.Website.Vite("lms", { env })` ngay dưới `VITE_AI_ENABLED: aiEnabled`.
   - Trong `apps/lms/scripts/assemble-dist.mjs` (và khai báo type trong `apps/lms/scripts/assemble-dist.d.mts`):
     - Export `bundleMatchesStudentPracticeFlag(portalDir, expectedEnabled)` kiểm tra các file `.js` trong `<portalDir>/assets/` với regex `/VITE_STUDENT_PRACTICE_ENABLED["']?\s*:\s*["']true["']/`.
     - Với `pkg === "student"`, tính `expectedStudentPractice = childEnv.VITE_STUDENT_PRACTICE_ENABLED === "true"`, gộp `!bundleMatchesStudentPracticeFlag(portalDist, expectedStudentPractice)` vào `staleOrMissingEnv` và bổ sung hậu kiểm fail-loud sau build trước khi copy vào `lmsOutDir/student`.
   - Trong `.github/workflows/deploy-staging.yml`:
     - Thêm `STUDENT_PRACTICE_ENABLED: "true"` vào `env:` của riêng step `Deploy to Cloudflare (stage staging)` ngay cạnh `AUTH_ASSUME_EMAIL_VERIFIED: "true"` (không đặt `VITE_STUDENT_PRACTICE_ENABLED` ở top-level `env:`).

3. **Xác minh Phase 1:**
   - Chạy toàn bộ test hẹp để xác nhận 100% PASS.

## Todo

- [x] Viết test Nhóm 1 (Red) và Nhóm 2 trong `topology.test.ts`, `assemble-dist.test.ts`, `student-nav.test.ts`, `topology-drift.test.mjs`
- [x] Triển khai `resolveStudentPracticeEnabled` trong `packages/infra/src/topology.ts` và nối vào `packages/infra/alchemy.run.ts`
- [x] Bổ sung `bundleMatchesStudentPracticeFlag` và guard stale/post-build trong `apps/lms/scripts/assemble-dist.mjs` (+ `.d.mts`)
- [x] Bật `STUDENT_PRACTICE_ENABLED: "true"` trong step `Deploy to Cloudflare (stage staging)` của `.github/workflows/deploy-staging.yml` và chạy xác minh Phase 1 (Green)

## Verification

```bash
pnpm --filter @teacher-os/infra test && pnpm --filter lms test && pnpm --filter student test && pnpm test:topology-drift && pnpm test:ci-workflow
```
