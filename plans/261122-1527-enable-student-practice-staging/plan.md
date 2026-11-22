---
title: "Bật lại menu Luyện tập (và Lịch sử) ở student trên staging"
description: "Bật cờ build-time VITE_STUDENT_PRACTICE_ENABLED trên môi trường staging (deploy-staging.yml -> alchemy.run.ts -> lms composite build -> apps/student) với guard fail-closed trên PROD (#852)."
status: completed
priority: P1
effort: "1h"
tags: [student, staging, ci, infra, feature-flag]
created: 2026-11-22
---

# Bật lại menu Luyện tập (và Lịch sử) ở student trên staging

## Overview

Ở [#852](https://github.com/vinh19410/teacher-os/issues/852), menu **Luyện tập** (`/practice` với 5 kỹ năng Reading, Listening, Writing, Speaking, Vocabulary) và **Lịch sử** (`/history`) trong `apps/student` đã được gắn cờ build-time `VITE_STUDENT_PRACTICE_ENABLED` (mặc định tắt khi deploy không đặt biến vì nội dung tự luyện chưa hoàn thiện trên Production).

Hiện tại trên môi trường **staging** (`https://lms.staging.teacheros.io.vn/student`), cần bật lại menu này để QA/đội ngũ kiểm thử tự luyện (dữ liệu thư viện từ vựng và study packs đã được seed tự động trên staging trong `deploy-staging.yml`), trong khi **Production (`deploy.yml` / `msmy.io.vn`) giữ mặc định tắt và được bảo vệ fail-closed**.

### Desired Outcome & Boundaries

- **Outcome:** Sau khi merge vào `develop` và `Deploy Staging` chạy xong, bản build `apps/student` trên `https://lms.staging.teacheros.io.vn/student` nhận `VITE_STUDENT_PRACTICE_ENABLED="true"` đi xuyên suốt từ `deploy-staging.yml` → `alchemy.run.ts` → Alchemy `config.define` → `apps/lms` → `apps/student`, hiển thị đầy đủ 7 mục trên `STUDENT_NAV` (bao gồm **Luyện tập** với 5 kỹ năng con và **Lịch sử**).
- **In Scope:**
  1. Helper chuẩn hoá `resolveStudentPracticeEnabled(raw, appDomain)` trong `packages/infra/src/topology.ts`: chấp nhận `"true"` → `"true"`, `undefined`/`""`/`"false"` → `"false"`, **fail-loud** (throw) với giá trị non-empty không hợp lệ, và **fail-closed** (throw) nếu bật `"true"` khi `appDomain === PROD_APP_DOMAIN` (`msmy.io.vn`, cùng mẫu `resolveAssumeEmailVerified`).
  2. Truyền `VITE_STUDENT_PRACTICE_ENABLED` (đọc từ biến hạ tầng không mang prefix `VITE_`: `STUDENT_PRACTICE_ENABLED`, khớp mẫu `AI_ENABLED` → `VITE_AI_ENABLED`) vào `Cloudflare.Website.Vite("lms", { env })` trong `packages/infra/alchemy.run.ts`, loại bỏ lối tắt `process.env` để Alchemy track trong state/memo và inject qua `config.define`.
  3. Mở rộng `apps/lms/scripts/assemble-dist.mjs` (và `assemble-dist.d.mts`) thêm kiểm tra `bundleMatchesStudentPracticeFlag` cho portal `student` ở cả hai điểm: phát hiện stale dist (`staleOrMissingEnv`) và hậu kiểm fail-fast sau build trước khi upload lên Cloudflare.
  4. Đặt `STUDENT_PRACTICE_ENABLED: "true"` riêng trong `env:` của step `Deploy to Cloudflare (stage staging)` trong `.github/workflows/deploy-staging.yml` (least-privilege, cùng mẫu `AI_ENABLED` và `AUTH_ASSUME_EMAIL_VERIFIED`), bổ sung smoke check tách biệt `found_api` / `found_required` trên mọi chunk `/student/` của staging, và bổ sung negative smoke check `forbidden_pattern` trên `/student/` của `.github/workflows/deploy.yml` đảm bảo PROD không chứa `VITE_STUDENT_PRACTICE_ENABLED:"true"`.
  5. Kiểm thử TDD (Red → Green) + characterization tests ở 4 tầng: `packages/infra/src/topology.test.ts`, `apps/lms/scripts/assemble-dist.test.ts`, `apps/student/src/components/layout/student-nav.test.ts` (có `afterEach` `vi.unstubAllEnvs()` + `vi.resetModules()`), và `scripts/topology-drift.test.mjs`.
  6. Cập nhật tài liệu vận hành (`AGENTS.md`, `docs/production-release-runbook.md` — gồm bảng topology, `Provision staging`, `Automated staging deploy`, và ghi rõ trust boundary rằng cờ chỉ ẩn 2 mục điều hướng trên sidebar, không chặn URL trực tiếp/CTA trang chủ/API).
- **Non-Goals (Out of Scope):**
  - Không bật `STUDENT_PRACTICE_ENABLED` / `VITE_STUDENT_PRACTICE_ENABLED` trên Production (`.github/workflows/deploy.yml`).
  - Không thay đổi mặc định tắt (`PRACTICE_ROUTES_LIVE = false` khi biến không đặt) trong `apps/student/src/components/layout/student-nav.tsx`.
  - Không thay đổi route, CTA trang chủ, backend API, D1 schema hay seed script của practice/history (ghi rõ trust boundary UI-only vào docs; khoá route/API trên PROD nếu cần sẽ là issue riêng).
  - Không chạy full E2E suite ở local (theo quy ước `AGENTS.md`).

### Extension Trace

Ranh giới build-time feature flag trong `Cloudflare.Website.Vite("lms", { env })` và các workflow deploy hiện dùng chung cho mọi cờ `VITE_*` của 3 sub-portal (`AI_ENABLED` → `VITE_AI_ENABLED`, `STUDENT_PRACTICE_ENABLED` → `VITE_STUDENT_PRACTICE_ENABLED`, và biến thể tương lai như `TEACHER_SIGNUP_ENABLED` → `VITE_TEACHER_SIGNUP_ENABLED` trên staging nếu cần).

- **Contract ổn định:** Workflow deploy đặt biến hạ tầng không mang prefix `VITE_` trong step `Deploy to Cloudflare` → `packages/infra/alchemy.run.ts` validate/normalize qua helper trong `topology.ts` và map sang `VITE_*` trong `Cloudflare.Website.Vite("lms", { env })` → Alchemy inject `config.define["import.meta.env.VITE_*"]` → `apps/lms/vite.config.ts` (`extractViteEnvFromConfig`) chuyển tiếp sang `assemblePortalDists` → sub-portal Vite build + hậu kiểm fail-fast trong `assemble-dist.mjs`.
- **Thành phần đổi khi thêm cờ tiếp theo:** thêm dòng khai báo env trong step deploy stage tương ứng + helper/key trong `topology.ts` & `alchemy.run.ts` + assertion drift trong `scripts/topology-drift.test.mjs`. Không cần abstraction mới hay registry.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Truyền `STUDENT_PRACTICE_ENABLED` → `VITE_STUDENT_PRACTICE_ENABLED` xuyên suốt từ `deploy-staging.yml` → `alchemy.run.ts` → Alchemy `config.define` → `apps/lms` → `apps/student` trên staging | P1 |
| 2 | Bảo vệ Production fail-closed (`PROD_APP_DOMAIN` guard trong `topology.ts`, fail-fast trong `assemble-dist.mjs`, negative smoke check trong `deploy.yml`, drift tests chặt) | P1 |
| 3 | Xác minh trực tiếp bundle `/student/` build thật + smoke check live staging + cập nhật docs (kèm trust boundary) | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Infra Wiring, Assemble Guard & Staging Workflow (TDD)](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Live Smoke Checks, Verification & Docs](./phase-02-verify-smoke-and-docs.md) | Pending |

## Success Criteria

- [ ] `resolveStudentPracticeEnabled(raw, appDomain)` trong `packages/infra/src/topology.ts` chấp nhận `"true"` → `"true"` (non-prod), `undefined`/`""`/`"false"` → `"false"`, throw lỗi với giá trị không hợp lệ (fail-loud) và throw lỗi nếu bật `"true"` trên `PROD_APP_DOMAIN` (fail-closed), có đầy đủ unit test trong `packages/infra/src/topology.test.ts`.
- [ ] `packages/infra/alchemy.run.ts` đọc `process.env.STUDENT_PRACTICE_ENABLED` qua `resolveStudentPracticeEnabled` và truyền `VITE_STUDENT_PRACTICE_ENABLED` vào `Cloudflare.Website.Vite("lms", { env })`.
- [ ] `apps/lms/scripts/assemble-dist.mjs` kiểm tra `VITE_STUDENT_PRACTICE_ENABLED` cho portal `student` ở cả `staleOrMissingEnv` lẫn hậu kiểm sau build, có unit test Red → Green trong `apps/lms/scripts/assemble-dist.test.ts` (gồm cả `extractViteEnvFromConfig` từ `config.define`).
- [ ] `.github/workflows/deploy-staging.yml` đặt `STUDENT_PRACTICE_ENABLED: "true"` riêng trong step `Deploy to Cloudflare (stage staging)` và bước `Smoke check LMS & legacy 301 redirects` quét độc lập `found_api` + `found_required` trên mọi chunk `/student/` để xác nhận cờ `"true"` được nhúng.
- [ ] `.github/workflows/deploy.yml` **không** đặt `STUDENT_PRACTICE_ENABLED` / `VITE_STUDENT_PRACTICE_ENABLED` (kể cả qua `vars.*`), đồng thời có negative smoke check `forbidden_pattern` trên `/student/` từ chối bundle chứa `VITE_STUDENT_PRACTICE_ENABLED:"true"`, được khoá chặt bởi `scripts/topology-drift.test.mjs`.
- [ ] Unit test `apps/student/src/components/layout/student-nav.test.ts` (có `afterEach` `vi.unstubAllEnvs()` + `vi.resetModules()`) chứng minh cả nhánh tắt (5 mục) và nhánh bật `VITE_STUDENT_PRACTICE_ENABLED="true"` (7 mục, gồm Luyện tập 5 skill + Lịch sử).
- [ ] Build thật `apps/lms` (kèm `LMS_REBUILD_PORTALS=1`) với `VITE_STUDENT_PRACTICE_ENABLED=true` cho ra `apps/lms/dist/student/assets/*.js` khớp pattern cờ `"true"`, còn khi đặt `"false"` thì không khớp và hậu kiểm `assemble-dist.mjs` pass cả hai chiều.
- [ ] Toàn bộ gate local xanh: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- [ ] `AGENTS.md` và `docs/production-release-runbook.md` phản ánh đúng cấu hình staging vs production, lệnh `Provision staging`, `Automated staging deploy`, và trust boundary UI-only.

## Red Team Review

### Session — 2026-11-22
**Reviewers:** 2 independent fresh-context `code-reviewer` subagents (`Security Adversary` + `Assumption Destroyer`, Light tier `Fact Checker`)
**Findings:** 7 deduplicated (4 High, 3 Medium — 7 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | `deploy-staging.yml` dùng top-level `VITE_STUDENT_PRACTICE_ENABLED` thừa quyền và tạo lối tắt `process.env` qua mặt Alchemy `config.define` | High | Accept | `plan.md`, Phase 1 |
| 2 | `resolveStudentPracticeEnabled` thiếu guard fail-closed `PROD_APP_DOMAIN`, thiếu fail-loud cho giá trị sai, và `deploy.yml` thiếu negative smoke check + drift test chặt (chặn cả `vars.*`) | High | Accept | `plan.md`, Phase 1, Phase 2 |
| 3 | `apps/lms/scripts/assemble-dist.mjs` chỉ kiểm tra `VITE_SERVER_URL`, bỏ lọt stale `student/dist` lệch cờ `VITE_STUDENT_PRACTICE_ENABLED` và thiếu hậu kiểm fail-fast | High | Accept | `plan.md`, Phase 1 |
| 4 | Smoke check `check_shell_headers` ghép cứng `required_regex` vào chunk đầu khớp `$API_BASE_URL` (nguy cơ false-fail 10 phút) và chỉ khớp nháy kép | High | Accept | `plan.md`, Phase 2 |
| 5 | `student-nav.test.ts` dùng `vi.stubEnv` thiếu `afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); })` gây rò rỉ state | High | Accept | `plan.md`, Phase 1 |
| 6 | Chưa ghi nhận trust boundary UI-only của `VITE_STUDENT_PRACTICE_ENABLED` (chỉ ẩn 2 mục sidebar, không chặn URL trực tiếp/CTA trang chủ/API) trong `AGENTS.md` & runbook | Medium | Accept | `plan.md`, Phase 2 |
| 7 | Phân tách TDD Red→Green vs characterization tests trong Phase 1 và cập nhật mục `Provision staging` + `Automated staging deploy` trong runbook | Medium | Accept | Phase 1, Phase 2 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verify-smoke-and-docs.md`
- Decision deltas checked: 7 (đổi tên biến deploy sang `STUDENT_PRACTICE_ENABLED` trong step deploy; thêm guard `PROD_APP_DOMAIN` + fail-loud vào `resolveStudentPracticeEnabled`; thêm guard `assemble-dist.mjs`; tách `found_api`/`found_required`/`found_forbidden` trong smoke check cả 2 workflow; thêm `vi.unstubAllEnvs()` trong `student-nav.test.ts`; cập nhật trust boundary + `Provision staging` trong docs; tách bảng TDD vs characterization tests)
- Reconciled stale references: 7 (đã xoá mọi tham chiếu cũ tới top-level `VITE_STUDENT_PRACTICE_ENABLED` trong `deploy-staging.yml` và câu "không sửa `deploy.yml`" / "không sửa `assemble-dist.mjs`")
- Unresolved contradictions: 0

## Validation Log

### Verification Results (Session 1 — 2026-11-22)
- **Tier:** Light (Fact Checker — 2 phases)
- **Claims checked:** 16 (tất cả đường dẫn file, symbol, workflow step, env key, script `pnpm` đều đối chiếu thực tế qua 2 reviewer độc lập và phiên controller)
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 0
- **Decisions confirmed:** Không còn điểm mơ hồ về sản phẩm/nghiệp vụ; toàn bộ 7 phát hiện kỹ thuật từ Red Team đã được chuẩn hoá nhất quán vào `plan.md`, `phase-01-start.md` và `phase-02-verify-smoke-and-docs.md`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verify-smoke-and-docs.md`
- Decision deltas checked: 7
- Reconciled stale references: 0
- Unresolved contradictions: 0

<!-- slug: enable-student-practice-staging -->
