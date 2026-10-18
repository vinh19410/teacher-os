---
title: "Built-in Vocabulary Courses (Thư viện từ vựng dùng chung)"
description: "Nạp 20 khóa / 968 bài / 10.160 từ từ master data CSV thành thư viện dùng chung cho mọi org; teacher chọn bài trong tab Từ vựng để clone về lớp của mình thành deck SRS thường."
status: pending
priority: P2
effort: 32h
issue: 361
branch: vinh19410/feat/builtin-vocab-courses
tags: [feature, backend, frontend, database]
created: 2026-10-18
---

# Built-in Vocabulary Courses (Thư viện từ vựng dùng chung)

> GitHub issue: [#361](https://github.com/vinh19410/teacher-os/issues/361) (label `ai-handle`, `ready to review`).

## Overview

Biến master data từ vựng trong `raw-data/` (3 CSV: 20 courses, 968 lessons, 10.160 words, liên kết tham chiếu hoàn hảo theo scout report) thành một **thư viện dùng chung toàn hệ thống**: mọi giáo viên của mọi org đều đọc được, nhưng dữ liệu không dính vào `vocab_deck` đã ship (#359). Khi teacher thêm bài vào lớp, server **clone** nội dung thành `vocab_deck` + `vocab_word` thường thuộc org/lớp của caller — học sinh tiếp tục dùng flow SRS hiện có không đổi. Audio của từ là URL CDN public; server **proxy** qua route audio hiện tại nên client không tải trực tiếp từ bên thứ ba.

Evidence đầy đủ: [scout report](./reports/scout-report.md). Không tồn tại cơ chế content global xuyên org nào trong repo (syllabus template vẫn org-scoped) — đây là cơ chế mới.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | 3 bảng library global (không orgId) + migration 0037; `vocab_deck.sourceLibraryDeckId` + `vocab_word.audioUrl` mở rộng nullable, không đụng NOT NULL cột đã ship | P1 |
| 2 | Seed pipeline idempotent từ CSV trong repo: chạy được local (libsql) lẫn prod (D1 REST API), verify counts 20/968/10160 | P1 |
| 3 | Library API kernel-gated: browse courses/decks/words + POST clone (org-guard trên classId, per-route 401, dedupe deckIds, cap 50 decks + **tổng 500 statements**/request, 1 `db.batch`, trả `duplicates[]`) | P1 |
| 4 | Audio clone hoạt động end-to-end: proxy remote URL qua route audio student, minigame `listeningChoice` eligible theo `audioKey OR audioUrl` (contract `hasAudio` additive) | P1 |
| 5 | UI teacher: dialog "Thêm từ thư viện" 2 bước (course → lesson, search + multi-select), badge "Thư viện", cảnh báo clone trùng; đúng DESIGN.md + 3 viewport | P1 |
| 6 | Tests: server vitest (clone guard/cap/proxy), web vitest (dialog), e2e spec clone flow; gate local pass đủ bộ | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Schema & Migration](./phase-01-schema-migration.md) | Pending |
| 2 | [Seed Pipeline](./phase-02-seed-pipeline.md) | Pending |
| 3 | [Library API + Clone + Audio](./phase-03-library-api.md) | Pending |
| 4 | [Teacher UI](./phase-04-teacher-ui.md) | Pending |
| 5 | [Tests & E2E](./phase-05-tests-e2e.md) | Pending |

## Dependencies

- Phase 1 đứng đầu: mọi phase sau cần schema + contracts. Phase 2 và Phase 3 chỉ phụ thuộc Phase 1, chạy song song được.
- Phase 4 cần endpoints của Phase 3. Phase 5 cần cả Phase 2 (boot e2e seed thư viện) lẫn Phase 3/4 (flow clone).
- Thứ tự tối ưu: 1 → (2 ∥ 3) → 4 → 5.
- **Deploy order**: migration 0037 apply TRƯỚC worker (precedent comment trong 0033/0035/0036); seed D1 chạy SAU migrate — endpoint browse trả list rỗng khi thư viện trống nên thứ tự seed-vs-deploy mềm. Contracts thêm field additive (`hasAudio`, `audioUrl`, `sourceLibraryDeckId`) → server + student cùng release train (precedent #304).

## Success Criteria

- [ ] Seed idempotent: chạy 2 lần liên tiếp cho cùng counts (20/968/10160), ids deterministic (`libcourse-*`, `libdeck-*`, `libword-*`); `--verify` in bảng đối chiếu expected vs actual.
- [ ] Teacher org A clone 2 deck vào lớp → deck xuất hiện trong tab Từ vựng với badge "Thư viện"; teacher org B KHÔNG thấy deck của A; clone vào classId của org khác bị chặn 404.
- [ ] Clone là deck thường: student enroll học bình thường, `ensureDeckCards` lazy provision hoạt động, `vocab_card`/`vocab_review_log` sinh đúng flow cũ; xoá deck clone không ảnh hưởng thư viện.
- [ ] Từ có `audioUrl` (100% master data) → `listeningChoice` eligible; route `/api/student/vocab/audio/:wordId` trả audio (proxy remote khi không có `audioKey`, ưu tiên `audioKey` nếu teacher upload đè); CDN lỗi → 404 `AUDIO_NOT_FOUND`, UI degradation sẵn có.
- [ ] Cap: clone >50 decks hoặc decks+từ >500 statements trong 1 request bị 422 kèm mã lỗi; deckIds trùng lặp bị 400; clone thành công là atomic (1 `db.batch`); request không đăng nhập → 401 mọi endpoint library.
- [ ] Gate local pass: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter @teacher-os/api test`, `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- [ ] UI verify 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo REVIEW.md; PR kèm screenshot.

## Red Team Review

### Session — 2026-10-18
**Reviewers:** Security Adversary (Fact Checker) · Failure Mode Analyst (Flow Tracer) · Assumption Destroyer (Scope Auditor)
**Findings:** 15 (14 accepted, 1 accepted-modified) · **Severity:** 1 Critical, 6 High, 8 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | CDN mochidemy đang 301 redirect cross-host (curl verify) — proxy phải `redirect:"follow"` + content-type response cuối + timeout; KHÔNG redirect handling = 10.160 audio 404 hoặc SSRF claim khống | Critical | Accept | Phase 3 |
| 2 | Gate `!store` 503 đứng trước nhánh proxy → thiếu R2 binding giết audio library dù proxy không cần R2 | High | Accept | Phase 3 |
| 3 | `hasAudio` additive 1 chiều — student `.strict()` runtime parse vỡ toàn bộ vocab khi deploy lệch train | High | Accept | Phase 1, 5 |
| 4 | "Drizzle d1-http chứng minh D1 multi-statement" — evidence sai (loop per-statement, bin.cjs:79488-79550); seed prod không atomic cần verify-gate | High | Accept | Phase 2 |
| 5 | Cap rời 50+500 = 550 statements/batch vượt precedent 500; deckIds trùng → 404 sai mã | High | Accept | Phase 3, 4 |
| 6 | Learn ưu tiên listeningChoice + CDN chết = học sinh bị phạt SRS qua "again" | High | Accept | Phase 3 |
| 7 | packages/db không có vitest/test script — gate seed test không chạy được, turbo bỏ qua | High | Accept | Phase 2, 5 |
| 8 | Commit CSV + runbook prod seed không có gate giấy phép (Open Question 1) | High | Accept (modified) | Phase 2, 5 |
| 9 | Seed upsert-only không prune; verify tổng-count bỏ qua swap cùng số; `lessonDetailId` không unique (8.728/10.160) | Medium | Accept | Phase 2 |
| 10 | Proxy buffer cap 50MB (QUIZ_MEDIA_MAX_BYTES) quá lớn + `no-store` cứng → mỗi replay 1 fetch CDN | Medium | Accept | Phase 3 |
| 11 | Boot e2e seed fail-loud giết cả suite; counts hard-code trong spec | Medium | Accept | Phase 2, 5 |
| 12 | "19 fixture sites audioKey" sai — thực tế 4 + 3 makeCard builder packages/api bị bỏ sót | Medium | Accept | Phase 3 |
| 13 | Browse GET thiếu yêu cầu per-route 401 (bootstrapMiddleware thả unauthenticated đi qua) | Medium | Accept | Phase 3 |
| 14 | `find *.sqlite` match 5 file (metadata/R2/cache) — chọn nhầm hỏng dev state | Medium | Accept | Phase 2 |
| 15 | Chống trùng clone chỉ client snapshot stale — 2 teacher cùng org clone trùng, học sinh học 2× | Medium | Accept | Phase 3, 4 |

**Adjudication notes:** Finding 8 chấp nhận có chỉnh sửa — giữ CSV trong repo + e2e seed thật (repo private; fixture synthetic làm mất giá trị "e2e chạy đúng code path prod"), nhưng thêm gate: seed `--d1` PROD bị chặn tới khi Open Question 1 resolved; đề xuất tách CSV khỏi git bị từ chối với lý do đó. Toàn bộ findings còn lại đều có evidence file:line và đã apply inline kèm marker `<!-- Updated: Red Team Session 1 - ... -->`.

### Whole-Plan Consistency Sweep
- Files reread: plan.md + 5 phase files sau khi apply.
- Decision deltas checked: 9 (cap tổng statements, per-route 401, redirect/allowlist/cache audio, gate 503, release-train 2 chiều, per-statement seed + prune/verify id-set, vitest packages/db, EXPECTED_COUNTS single-source, duplicates server-side).
- Reconciled stale references: cap "50/500" ở plan.md Goals + Success Criteria, Phase 4 footer/testids, Phase 5 gates + deploy order.
- Unresolved contradictions: 0.

## Validation Log

### Verification Results — 2026-10-18
- **Tier:** Full (5 phases; verification thực hiện bởi 3 red-team reviewer mang verification roles Fact Checker / Flow Tracer / Scope Auditor)
- **Claims checked:** ~45 (file paths, symbols, line refs, hành vi flow, deps, CSV stats)
- **Verified:** 42 | **Failed:** 3 | **Unverified:** 0
- **Failures (đã resolve qua Red Team edits):**
  1. [Fact Checker] "19 fixture sites `audioKey`" — thực tế 4 sites/2 file student + 3 makeCard builder packages/api → Fixed Phase 3 (Finding 12).
  2. [Fact Checker] "drizzle d1-http chứng minh D1 REST multi-statement" — evidence suy diễn sai (loop per-statement) → Fixed Phase 2 (Finding 4).
  3. [Flow Tracer] "audio hỏng chỉ mất minigame nghe, không gãy session" — Learn ưu tiên listeningChoice nên học sinh bị phạt SRS khi CDN lỗi → Fixed Phase 3 nút "Bỏ qua" (Finding 6).
- **Kiến trúc được xác nhận bằng trace thật:** org-guard pattern clone (`vocab-teacher.ts:128-138`), mount kernel (:2109), audio client wordId-only (`repos/vocab.ts:95-113`), papaparse trong deps (`apps/web/package.json:31`), e2e boot wipe+migrate (`boot.ts:75-85`), `.strict()` + runtime parse student (`contracts.ts:2321`, `repos/vocab.ts:56`), D1 batch = 1 transaction (libsql + D1).
- **Interview không diễn ra (chế độ autonomous)** — 2 quyết định nghiệp vụ còn mở được đưa vào Open Questions bên dưới thay vì chặn plan.

## Open Questions

1. **Giấy phép/nguồn nội dung**: master data và audio/hình trỏ CDN mochidemy của bên thứ ba. Cần xác nhận chủ sở hữu được phép dùng làm nội dung built-in thương mại trước khi mở cho mọi org. Không chặn phát triển, chặn việc public rộng.
2. **Phụ thuộc CDN audio**: 100% audio thư viện sống trên CDN ngoài. Phương án dự phòng dài hạn (mirror sang R2 lúc seed) đã ghi ở Phase 2 Risk — cần quyết định mirror ngay hay chấp nhận phụ thuộc.

<!-- slug: builtin-vocab-courses -->
