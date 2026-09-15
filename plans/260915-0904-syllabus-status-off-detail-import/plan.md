---
title: "Bỏ trạng thái buổi học khỏi màn hình syllabus + import ghi đè ở màn hình detail"
description: "Gỡ status buổi học khỏi mọi màn hình syllabus (status chỉ còn đổi ở lớp học), đưa import Excel/CSV về format 4 cột, và thêm nút import ghi đè có cảnh báo ở màn hình syllabus detail."
status: pending
priority: P2
effort: 14h
issue: 152
branch: vinh19410/feat/syllabus-status-off-detail-import
tags: [feature, refactor, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-09-15
---

# Bỏ trạng thái buổi học khỏi màn hình syllabus + import ghi đè ở màn hình detail

## Overview

Buổi học (syllabus lesson) hiện mang trạng thái `done | current | upcoming` hiển thị và sửa được ở **cả** màn hình syllabus lẫn màn hình lớp học. Theo yêu cầu: trạng thái là khái niệm thuộc về lớp học — màn hình syllabus không cần và không được sửa nó. Đồng thời, tính năng import Excel/CSV (v2, issue #150) hiện chỉ có trong popup tạo syllabus; cần thêm nút import ở **màn hình syllabus detail**, kèm cảnh báo "dữ liệu sẽ bị ghi đè" bắt buộc xác nhận trước khi thay thế toàn bộ cây module/buổi học.

Ba thay đổi, bốn phase:

1. **Gỡ status khỏi màn hình syllabus** (UI + form thêm/sửa buổi học theo ngữ cảnh) — status giữ nguyên đầy đủ ở màn hình lớp học (`curriculum-management-section.tsx`), ở DB (`syllabus_lesson.status`), snapshot và types.
2. **Import format v3 — 4 cột** (bỏ cột "Trạng thái"): parser, file mẫu, preview; file v2 5 cột bị từ chối kèm thông báo hành động (mirror cách từ chối v1 hiện có).
3. **Import ở màn hình detail**: nút "Nhập từ Excel/CSV" → preview → modal cảnh báo ghi đè (hiển thị số module/buổi sẽ mất) → xác nhận → endpoint mới `POST /api/syllabi/:id/replace-content` thay toàn bộ cây trong một batch duy nhất.

## Scope Challenge

- Existing code: import v2 parser/preview trong `AddSyllabusModal`; renderer + modal thêm/sửa buổi học dùng chung giữa syllabus detail và class detail; transport client chỉ POST; pattern batch-insert (create) và delete-explicit (module-remove).
- Requested scope: (1) bỏ status buổi học ở màn hình syllabus + create/edit, (2) nút import ở màn hình detail, (3) cảnh báo ghi đè trước khi update. Giao đủ, không mở rộng.
- Complexity: ~16 file chạm, 0 service/class mới, 4 phase.
- Selected mode: **HOLD SCOPE** (không có `--yagni`).

## Key Decisions

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Status chỉ gỡ khỏi **UI của route `/syllabus`**; DB column, snapshot row, types, `lesson-status.tsx`, mapper giữ nguyên | Bản copy giáo trình của lớp vẫn cần status (`curriculum-management-section.tsx`); tránh migration SQLite không cần thiết |
| D2 | `lessonUpsertSchema.status` → `.optional()`; route edit **preserve** giá trị existing khi client không gửi, route add default `"upcoming"` khi vắng; `data-store-reducer.ts` mirror đúng 2 semantics này (`?? "upcoming"` cho add, `?? l.status` cho edit) | Form sửa buổi học mở từ syllabus detail không còn gửi status — không được reset status của bản copy lớp (kể cả optimistic state trong reducer) |
| D3 | Import format v3 = **4 cột** (Module, Mô tả module, Mục tiêu, Tài liệu); file v2 (5 cột) bị **từ chối** — phát hiện qua header "Trạng thái"/"status" ở ô thứ 5 **hoặc** bất kỳ dòng data nào còn nội dung ở ô thứ 5 (khóa cả file v2 đã xóa header) | Nhất quán với cách từ chối v1 hiện có; không bỏ ngầm dữ liệu user đã điền |
| D4 | Endpoint mới `POST /api/syllabi/:id/replace-content` (body `{ modules }`, schema riêng mirror cap 500 nodes); batch: delete lessons (subquery) → delete modules → update `totalLessons` → insert cây mới. `syllabusModuleContentSchema` giữ nguyên; parser v3 push lesson kèm hằng số `status: "upcoming"` — type `SyllabusModuleContent` là zod **output** type nên `status` required sau `.default()`, không thể bỏ field | Transport client hardcode POST; mirror pattern create (batch) + module-remove (delete explicit, KHÔNG dựa FK cascade) |
| D5 | `AddLessonModal`/`EditLessonModal` thêm prop `showStatus?: boolean`; chỉ `curriculum-management-section.tsx` truyền `true` | 2 modal dùng chung 2 ngữ cảnh;	prop nhỏ nhất giữ 2 hành vi |
| D6 | Fixture XLSX e2e được tạo lại bằng script `apps/e2e/scripts/regen-syllabus-import-fixture.mjs`; `exceljs` thêm vào **catalog** `pnpm-workspace.yaml` (apps/e2e tham chiếu `catalog:`); script anchor output bằng `import.meta.url` và tự-verify nội dung; commit kèm `pnpm-lock.yaml` (CI chạy `--frozen-lockfile`) | XLSX là binary; mọi devDep của e2e đang dùng `catalog:`; script sai cwd sẽ ghi fixture lạc chỗ và e2e đỏ misleading |
| D7 | Nút import ở màn hình detail **chỉ hiện khi `sy.classId === null`** (template); bản copy của lớp không có nút này | Ghi đè bản copy lớp sẽ xóa sạch tiến độ done/current đang sống của lớp đó (progress class derive từ `syllabus_lesson.status`); status/"nội dung sống" chỉ thuộc về lớp học theo yêu cầu |
| D8 | Trước khi mở modal xác nhận ghi đè: `await refresh()` (bus) để số liệu "sẽ bị xóa" lấy từ snapshot mới nhất; `useDirectKernelAction.run` đổi kiểu trả về thành `KernelCommandResult` (backward-compatible) để caller chỉ clear preview khi `refreshed`/`committed` | Modal hiện counts từ snapshot có thể stale (đa tab, `staleTime: Infinity`); `run()` hiện trả void và không bao giờ reject nên clear vô điều kiện phá preview của user khi 4xx retryable |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Màn hình syllabus (detail + form thêm/sửa buổi học từ đó) không hiển thị/sửa status buổi học; màn hình lớp học giữ nguyên | P1 |
| 2 | Import Excel/CSV dùng format 4 cột ở cả popup create lẫn màn hình detail; file cũ bị chặn rõ ràng | P1 |
| 3 | Nút import ở syllabus detail: preview → cảnh báo ghi đè → xác nhận → thay toàn bộ cây qua endpoint mới, atomic | P1 |
| 4 | Toàn bộ test (vitest web/server + e2e) xanh sau mỗi phase | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Hợp đồng API & endpoint thay nội dung](./phase-01-server-contract-api.md) | Pending |
| 2 | [Phase 2: Gỡ status khỏi màn hình syllabus](./phase-02-web-status-removal.md) | Pending |
| 3 | [Phase 3: Parser import v3 — 4 cột + preview dùng chung](./phase-03-import-parser-v3.md) | Pending |
| 4 | [Phase 4: Import ở màn hình detail + cảnh báo ghi đè](./phase-04-detail-import-overwrite.md) | Pending |

## Dependencies

- Phase 2 phụ thuộc Phase 1 (client mới ngừng gửi status ⇒ server phải chấp nhận body thiếu status).
- Phase 3 độc lập Phase 2 về runtime nhưng cùng chạm `add-syllabus-modal.tsx`/`$syllabusId.tsx` — thực hiện tuần tự.
- Phase 4 phụ thuộc Phase 1 (endpoint), Phase 3 (parser v3 + component preview dùng chung).
- Ngoài repo: không có. Không đổi DB schema, không migration.

## Success Criteria

- [ ] Mở `/syllabus/:id`: không còn dot/badge trạng thái, StatCard "đã dạy"/"đang học", card "Buổi hiện tại"; StatCard còn "tổng buổi" + "module".
- [ ] Thêm/sửa buổi học từ màn hình syllabus: form không có trường Trạng thái; sửa tiêu đề/mục tiêu của buổi trong bản copy lớp không làm mất trạng thái buổi đó.
- [ ] Màn hình lớp học: hiển thị status + sửa status qua form như cũ.
- [ ] Popup tạo syllabus: file mẫu 4 cột; preview không có cột Trạng thái; file v2 5 cột bị chặn kèm thông báo.
- [ ] Màn hình syllabus detail (template): nút import → preview → modal cảnh báo nêu rõ số module/buổi hiện tại sẽ bị xóa; hủy giữ nguyên dữ liệu; xác nhận thay cây mới, số liệu đúng. Bản copy của lớp (`classId !== null`) không hiện nút import.
- [ ] `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check-types`, `pnpm --filter e2e e2e` exit 0.

## Validation Log

### Verification Results (sau red-team, đã vá)
- Claims checked: 27 (đường dẫn file, dòng số, symbol, route, schema, fixtures, type-consumer)
- Verified: 27 | Failed: 0 | Unverified: 0
- Tier: Standard (4 phases)
- Ghi chú trung thực: lượt verify đầu (24 claims) bỏ sót 2 consumer phá compile — (a) `z.infer` output type khiến `SyllabusModuleContent.status` required (parser không thể bỏ field), (b) `data-store-reducer.ts:256,282` gán `action.payload.status` vào field bắt buộc. Cả 2 do red-team phát hiện, đã vá vào D2/D4 + phase files; các claim consumer của mọi symbol đổi type (`SyllabusLesson["status"]` payload, `SyllabusModuleContent`) đã được grep lại toàn repo.
- Bằng chứng: `reports/scout-report.md` + trực tiếp source branch `develop` (commit `4dd668c`).

### Auto-resolved Decisions (user không phỏng vấn — chạy autonomous; có thể override trước khi cook)
1. **"create/edit syllabus"** = form tạo syllabus (`AddSyllabusModal`) + form thêm/sửa buổi học mở từ màn hình syllabus. Không tồn tại modal "edit syllabus" cấp syllabus trong codebase — không tạo mới.
2. **Giữ status ở màn hình lớp học nguyên vẹn** (dot, badge, tiến độ %, Select trong form) — đúng nghĩa "trạng thái chỉ được thay đổi ở lớp học".
3. **Từ chối file v2 5 cột** thay vì chấp nhận-bỏ-qua cột status (nhất quán policy chặn v1 hiện có; tránh mất dữ liệu ngầm) — chặn cả biến thể đã xóa header.
4. **Nút import ở detail chỉ dành cho template** (`sy.classId === null`) — red-team chỉ ra ghi đè bản copy lớp xóa sạch tiến độ sống của lớp (banner "các lớp không bị ảnh hưởng" sẽ sai). Endpoint server vẫn nhận mọi syllabus cùng org; gate là UI. *(Đây là điều chỉnh sau red-team của quyết định ban đầu "cho phép trên mọi syllabus".)*
5. **Không thêm optimistic-concurrency server-side** (expectedModuleCount/409) — ngoài yêu cầu; giảm thiểu rủi ro stale bằng `refresh()` trước khi mở modal xác nhận (D8). Rủi ro dư: trong khoảng refresh → confirm, tab khác vẫn có thể đổi cây.

## Red Team Review

### Session — 2026-09-15
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier)
**Findings:** 12 (9 accepted, 2 accepted-partial, 1 rejected)
**Severity breakdown:** 2 Critical, 3 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Parser v3 bỏ field `status` không compile — `SyllabusModuleContent` là zod output type (`.default()` ⇒ required ở output) | Critical | Accept — parser push hằng `status: "upcoming"` | D4, Phase 3 Task 3.1/3.2 |
| 2 | Phase 2 bỏ sót `data-store-reducer.ts` (`:256` add, `:282` edit gán `payload.status` vào field required) — `pnpm check-types` gãy | Critical | Accept — thêm task reducer mirror semantics server | D2, Phase 2 Task 2.1 |
| 3 | Ghi đè bản copy lớp xóa tiến độ sống; câu modal "các lớp không bị ảnh hưởng" sai khi đối tượng là copy | High | Accept — gate nút import theo `classId === null` | D7, Phase 4 Task 4.2, Decision #4 |
| 4 | File v2 đã xóa header lọt detection (chỉ sniff `rows[0][4]`) → bỏ ngầm cột 5, trái chính sách D3 | Medium/High | Accept — thêm luật: bất kỳ dòng data nào có ô thứ 5 khác rỗng → từ chối | D3, Phase 3 Task 3.1/3.2 |
| 5 | Thiếu test cross-org cho endpoint phá hoại nhất (chỉ test 404 uuid ngẫu nhiên) | Medium | Accept — test 7 mirror pattern kernel.test.ts:1242 | Phase 1 Task 1.4 |
| 6 | Counts trong modal stale (đa tab, `staleTime: Infinity`); không refetch trước confirm | Medium | Accept-partial — `await refresh()` trước khi mở modal; **Reject** token 409 server-side (over-engineering, ghi nhận rủi ro dư ở Decision #5) | D8, Phase 4 Task 4.2 |
| 7 | `.then(() => setImportResult(null))` clear preview cả khi 4xx retryable — `run()` trả void, không bao giờ reject | High | Accept — `run` đổi trả `KernelCommandResult` (backward-compatible); chỉ clear khi `refreshed`/`committed` | D8, Phase 4 Task 4.2 |
| 8 | exceljs: phá convention `catalog:`; script ghi fixture theo cwd (lạc chỗ); không commit lockfile (CI `--frozen-lockfile`) | Medium | Accept — catalog + `import.meta.url` anchor + self-verify + commit lockfile | D6, Phase 3 Task 3.4 |
| 9 | Statement `update totalLessons` không có test nào khóa (web recompute che bug) | Medium | Accept — server test assert `row.totalLessons`; e2e assert StatCard "tổng buổi" | Phase 1 Task 1.4, Phase 4 Task 4.3 |
| 10 | Validation Log gốc claim 24/24 trong khi 2 compile-break tồn tại | Medium | Accept — log viết lại trung thực (mục trên) | plan.md |
| 11 | db.batch không atomic / orphan scheduled lesson / "Buổi 3" không unique / giữ-state vỡ sau extraction | — | Reject — reviewer tự kiểm định và loại bỏ: batch libsql là transaction, không FK nào trỏ `syllabus_lesson`, `Buổi 3` vẫn unique sau Phase 2, modal mount thường trực | — |
| 12 | "Endpoint nên thêm `expectedModuleCount` + 409" (variant của #6) | Medium | Reject — xem #6 | — |

### Whole-Plan Consistency Sweep
Đã rà lại toàn bộ plan.md + 4 phase files sau khi vá: các mục D2/D3/D4/D6 cập nhật đồng bộ với phase files; câu modal Phase 4 giờ luôn đúng (chỉ template); dependency các phase không đổi; verify commands không đổi. Không còn mâu thuẫn chưa giải quyết.

## Handoff

Plan authored dưới `--advice` handover contract: mỗi phase phân rã thành task có Goal / Target files / Steps / Success criteria / Verify (điều kiện pass cơ khí) và **Failure Protocol** nhúng trong từng phase file. Executor mô hình yếu chạy end-to-end được mà không phải tự suy ra bước nào.

### Plan Summary
- **Plan Path**: `plans/260915-0904-syllabus-status-off-detail-import/plan.md`
- **Handover Contract**: `--advice` — phased tasks với success criteria, mechanical verification, và Failure Protocol từng phase
- **GitHub Issue**: [#152](https://github.com/vinh19410/teacher-os/issues/152)
- **Status**: Ready for implementation (`ready to cook`) — validation + red-team gates đã qua
- **Phases**:
  1. Phase 1: Hợp đồng API & endpoint thay nội dung — status optional + preserve-on-edit, `POST /syllabi/:id/replace-content`, 7 server tests
  2. Phase 2: Gỡ status khỏi màn hình syllabus — detail page, `showStatus` prop, reducer mirror
  3. Phase 3: Parser import v3 — 4 cột, chặn v2 (cả bản không header), `SyllabusImportPreview`, fixtures regen
  4. Phase 4: Import ở màn hình detail — nút (template-only), modal cảnh báo ghi đè, refresh-before-confirm, e2e mới

### Next Recommended Step
Để thực thi plan:
```
/ak:cook plans/260915-0904-syllabus-status-off-detail-import/plan.md --advice
```
**Best practice:** chạy `/clear` trước khi cook để bắt đầu với context mới.
