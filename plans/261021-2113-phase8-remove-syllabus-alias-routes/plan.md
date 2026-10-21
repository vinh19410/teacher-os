---
title: "Phase 8: gỡ alias route syllabus cũ (issue #401)"
description: "Gỡ toàn bộ alias route `/api/syllabi*`, `/api/classes/:id/(import-syllabus|remove-curriculum)` khỏi apps/server; `findSyllabus` giữ lại (còn dùng ở POST /classes); chuyển test sang route mới/đảo test bảo vệ alias thành assert 404; cập nhật docs + CHANGELOG; chạy full e2e."
status: pending
priority: P2
effort: "2h"
issue: 401
branch: ai-handle-issue-401
tags: [backend, server, syllabus, cleanup, api]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Phase 8: gỡ alias route syllabus cũ

## Overview

Follow-up #394 (PR #400 đã merge vào `develop`): web client đã gọi 100% route mới (`/api/syllabus-templates/...`, `/api/classes/:id/curriculum/...`), không còn client ngoài web gọi route cũ (điều kiện bắt đầu của issue đã đạt — card được duyệt Ready trên board). Phase này gỡ sạch alias: đăng ký mỗi operation đúng một path mới, xoá khối `mountContentRoutes` basePath `/syllabi/:id`, xoá `GET /syllabi`, giữ `findSyllabus` vì `POST /classes` (`apps/server/src/routes/kernel.ts:569`) vẫn dùng để resolve template.

## Hiện trạng (đã đọc code; số dòng chỉ tham khảo ±3 dòng tại thời điểm viết plan — anchor bằng chuỗi code)

- `apps/server/src/routes/syllabus.ts` — 7 vị trí alias, tất cả đã đánh dấu "xoá ở phase 8":
  - `routes.get("/syllabi", ...)` (~`:78`) — route list cũ duy nhất (web đọc qua snapshot `/api/kernel`, không có `GET /syllabus-templates` thay thế; server test là consumer duy nhất).
  - `for (const path of ["/syllabus-templates", "/syllabi"])` (~`:423`) — POST tạo template (kèm auth-guard + bodyLimit 2 MiB).
  - `for` replace-content (~`:434-437`) — path mới + `/syllabi/:id/replace-content`.
  - `for` remove (~`:440-443`) — path mới + `/syllabi/:id/remove`.
  - `for` import (~`:445-448`) — `/classes/:id/curriculum/import` + `/classes/:id/import-syllabus`.
  - `for` remove-curriculum (~`:450-453`) — `/classes/:id/curriculum/remove` + `/classes/:id/remove-curriculum`.
  - `mountContentRoutes` basePath `/syllabi/:id` (~`:486-494`) resolve qua `findSyllabus`.
  - Anchor cắt khối an toàn: comment `// Alias tạm cho web cũ, xoá ở phase 8.` xuất hiện đúng ở các vị trí alias.
- Tổng cộng **7 cặp method-path legacy** cần chết: `GET /api/syllabi`, `POST /api/syllabi`, `POST /api/syllabi/:id/{replace-content,remove,modules}`, `POST /api/classes/:id/import-syllabus`, `POST /api/classes/:id/remove-curriculum`.
- `findSyllabus` (`apps/server/src/lib/syllabus-curriculum.ts:13`): 3 tham chiếu — definition, `kernel.ts:57,569` (POST /classes, **giữ**), `syllabus.ts:26,492` (alias mount, **gỡ import**).
- Web client `apps/web/src/lib/repos/kernel.ts` đã 100% path mới (74, 87, 94, 201, 218, 459); `apps/e2e` không gọi path alias nào (grep chỉ thấy data field `snapshot.syllabi`).
- Test còn tham chiếu alias trong `apps/server/src/kernel.test.ts`:
  - `:630,677,716,736` dùng `GET /api/syllabi` làm read-helper → chuyển sang `t.kernel(session).syllabi` (helper `:223` gọi `/api/kernel`, trả `KernelSnapshot` có cây modules/lessons).
  - `:2831` matrix 12 — tiêu đề stale "POST /api/syllabi", thân test đã dùng helper path mới → đổi tiêu đề.
  - `:3622` "alias không mở lỗ hổng..." — gọi alias `replace-content`/`remove` trên bản copy expecting 404 → chuyển sang path template (`/api/syllabus-templates/:id/...`), guard `findTemplate` giữ nguyên 404.
  - `:3680` "test bảo vệ alias: ... vẫn sống đến phase 8" (2 assertion: import alias 201 + module qua alias 201) → **đảo** thành test assert **7 legacy path** trả 404, dùng id thật (template + copy tạo qua đường mới), nhiều assertion hơn cũ.
  - `:3782` matrix 16 — `/api/syllabi/${copyId}/remove` expecting 404 → `/api/syllabus-templates/${copyId}/remove` (cùng guard, path thật).
- Stale ngoài server: `apps/web/src/lib/repos/kernel-command.test.ts:61` tiêu đề "maps to /api/syllabi/:id/remove" (assertion đã là path mới — chỉ đổi title); `apps/web/src/lib/syllabus-import.ts:14` comment "Mirror zod contract của POST /api/syllabi" → `/api/syllabus-templates`.
- Docs + changelog: `docs/system-architecture.md:50` còn mệnh đề "the legacy `POST /syllabi/:id/...` kernel paths remain as aliases for one release" → sửa thành đã gỡ; `CHANGELOG.md:19` còn "(route `/api/syllabi/...` cũ giữ làm alias một release)" → bổ sung mục ghi chú alias đã gỡ. `docs/codebase-summary.md` không nhắc alias — không đổi.
- Router fallback: không có `app.notFound` handler trong `apps/server/src`; route không khớp → Hono 404 mặc định. **Điều kiện**: mọi POST dưới `/api` đi qua CSRF guard `kernel.use("*")` (`kernel.ts:100-107`) — request với Origin ngoài `allowedOrigins` nhận 403 TRƯỚC khi tới routing. Test dùng `t.call` (Origin allowed) nên deterministic 404; client thật trên origin lạ sẽ thấy 403 như mọi POST khác (không phải 404).

## Outcome / Constraints / Non-goals / Acceptance

- **Outcome:** API chỉ còn route ngữ cảnh mới; với request đủ điều kiện qua guard (Origin allowed), **7 cặp method-path legacy** ở trên trả 404 (request vi phạm guard nhận 403 như mọi POST khác). Không đổi behavior nào của route mới.
- **Constraints:** TDD — test đảo (assert 404 với id thật) phải đỏ trước khi gỡ route và xanh sau; không đụng contract/shape response; không đổi `findSyllabus`/`kernel.ts`; assertion chỉ chuyển hoặc thêm, không bớt (test cũ bị thay có 2 assertion, test mới có 7).
- **Non-goals:** không thêm `GET /syllabus-templates` (web đọc qua snapshot — YAGNI); không đổi schema DB/seed; không đổi web behavior; không deploy.
- **Acceptance:**
  1. `pnpm --filter server test` xanh sau khi gỡ; trước khi gỡ, đúng test đảo "alias đã gỡ" đỏ (assert đầu tiên fail: `GET /api/syllabi` expected 404 received 200).
  2. Gate route-registration: `grep -rnE '"/(syllabi|classes/[^"]*/(import-syllabus|remove-curriculum))' apps/server/src/routes/` exit 1 (không match — pattern scoped theo path string trong đăng ký route, không đụng error message/comment như `"import-syllabus batch failed"` tại `syllabus.ts:348`).
  3. `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test` xanh.
  4. Full `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` xanh — gate bắt buộc theo AGENTS.md.
  5. `docs/system-architecture.md` không còn mệnh đề "remain as aliases".
  6. `CHANGELOG.md` có ghi chú alias đã gỡ (phase 8, issue #401); `grep -n "giữ làm alias" CHANGELOG.md` exit 1.

## Failure Protocol (áp cho mọi phase)

Nếu bất kỳ bước Verify nào không đạt pass condition: DỪNG phase. Không tự sửa mù, không retry bừa, không lý leo quanh lỗi. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh + output đầy đủ, pass condition chưa đạt. Áp dụng counsel rồi chạy lại Verify. Nếu không spawn được `kongming`: DỪNG và báo user cùng bằng chứng lỗi. Không tự tiếp tục bằng suy đoán.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Server — gỡ alias route + chuyển test (TDD)](./phase-01-server-remove-alias.md) | Pending |
| 2 | [Phase 2: Docs/CHANGELOG + dọn stale + full verification](./phase-02-docs-verification.md) | Pending |

## Success Criteria

- [ ] 7 legacy method-path trả 404 (test đảo với id thật xanh sau khi gỡ)
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test` xanh
- [ ] Full e2e với port override 8100/8101/8103 xanh
- [ ] `docs/system-architecture.md` + `CHANGELOG.md` cập nhật, không còn mệnh đề alias còn sống

## Red Team Review

### Session — 2026-10-22
**Findings:** 8 (8 accepted, 0 rejected) — sau dedupe: S1/A1 (test đảo), S2 (grep gate), S3=A4 (CSRF), S4=A5 (line anchor), S5 (before/after), A2 (CHANGELOG), A3 (5-vs-6 sync)
**Severity breakdown:** 0 Critical, 4 High, 4 Medium
**Reviewers:** 2 subagent (`task`, hostile reviewer): Security Adversary + Assumption Destroyer, cả hai mang verification role Fact Checker (Light tier, 2 phases). Lần spawn đầu với agent `code-reviewer` fail do môi trường không resolve được model ("No model selected") — re-spawn với agent `task`, thành công.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Red test thiếu `GET /api/syllabi`; 4/6 assertion vô giá trị (id không tồn tại → 404 cả trước lẫn sau khi gỡ) — đảo thành test 7 path với id thật | High | Accept | Phase 1, Task 1.2 |
| 2 | Acceptance criterion 2 grep rông sẽ match error string `syllabus.ts:348` + comment `:241` → siết pattern scoped route-registration | High | Accept | plan.md Acceptance 2 |
| 3 | CSRF guard `kernel.ts:100-107` có thể 403 trước 404 với Origin lạ → nêu điều kiện trong Outcome/Hiện trạng | Medium | Accept | plan.md Hiện trạng + Outcome |
| 4 | Line anchor drift (matrix 16 thật ở `:3782`, POST loop ở `:423`) → anchor bằng chuỗi code, dòng ±3 | Medium | Accept | plan.md Hiện trạng, Phase 1 |
| 5 | So sánh before/after tại `:716/:736` phải đổi CẢ HAI phía sang `t.kernel(session).syllabi`; verify bằng chạy test, không đếm assertion trong diff | Medium | Accept | Phase 1, Task 1.1 |
| 6 | `CHANGELOG.md:19` còn mệnh đề alias sống → thêm vào Phase 2 + acceptance 6 | High | Accept | Phase 2, plan.md |
| 7 | Không nhất quán "5 vs 6 legacy path" → đồng bộ "7 cặp method-path" + ghi rõ assertion count cũ (2) mới (7) | Medium | Accept | plan.md, Phase 1 |

#### Fact Checker Results (2 reviewer × 10 claims)
- Claims checked: 20 — Verified: 18 | Failed (drift): 2 (matrix 16 dòng, POST loop dòng) | Unverified: 0
- Drift đã xử lý ở mục Hiện trạng (anchor theo chuỗi code).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-server-remove-alias.md, phase-02-docs-verification.md
- Decision deltas checked: 7 (7-path matrix, id-thật test đảo, grep scoped pattern, CSRF điều kiện, CHANGELOG, anchor-chuỗi, before/after đồng bộ)
- Reconciled stale references: Outcome/Hiện trạng/Success criteria/Phase 1/Phase 2 đã đồng bộ "7 cặp method-path", "CHANGELOG.md", "grep scoped", "anchor chuỗi code"
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-10-22 (chạy tự động, chế độ ai-handle — không có phỏng vấn tương tác)
- **Mode:** auto-detect → fast (scope rõ, đã scout; `--advice` handover contract + `--tdd`).
- **Verification Results:** tier Light — Fact Checker chạy trong red-team session (20 claims, 18 verified, 2 drift đã sửa). Không còn tag `[UNVERIFIED]`.
- **Decisions confirmed (tự adjudicate theo tùy chọn an toàn, không có decision point nào chặn):**
  1. `GET /api/syllabi` gỡ hẳn KHÔNG thêm `GET /syllabus-templates` thay thế — web đọc qua snapshot `/api/kernel`; issue liệt kê rõ `/api/syllabi` trong danh sách gỡ; consumer duy nhất còn lại là server test (chuyển sang `t.kernel()`).
  2. Test đảo dùng id thật (template + copy tạo qua đường mới) để mọi assertion có giá trị 2 chiều (red trước, green sau).
  3. `findSyllabus` giữ lại — còn 1 usage thật tại `kernel.ts:569` (POST /classes).
- **Interview:** bỏ qua — mode tự động (`--ship`), không có câu hỏi nào thay đổi đáng kể implementation.
- **Whole-Plan Consistency Sweep:** 0 unresolved contradictions (xem Red Team Review).

<!-- slug: phase8-remove-syllabus-alias-routes -->
