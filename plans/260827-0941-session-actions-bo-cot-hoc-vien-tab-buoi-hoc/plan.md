---
title: "Session actions + bỏ cột Học viên trên tab Buổi học"
description: "Bỏ cột Học viên khỏi bảng buổi học (main 4→3 cột, legacy 5→4 cột). SessionActionsModal bulk Hoàn thành/Hủy buổi (phase 2–3) DEFERRED theo Scope Decision 2026-08-27 (requester chọn full per-occurrence edit → cần plan server-side occurrence identity trước; thiết kế đã red-team được giữ làm tư liệu)."
status: pending
priority: P2
effort: 2d
issue: 93
branch: develop
tags: [web, ui, class-detail, sessions, actions]
blockedBy: []
blocks: []
created: 2026-08-27
---

# Session actions + bỏ cột Học viên trên tab Buổi học

## Overview

Tab **Buổi học** trong class detail (`ClassScheduleTable`) hiện (a) hiển thị cột **Học viên** chỉ liệt kê tên text — khi lớp đông thì tràn/chèn ép cột khác và không mang thông tin hành động (điểm danh đã có roster modal); (b) chưa có cách nào admin/giáo viên **điều chỉnh buổi học** tại chỗ — chỉ có CTA Điểm danh (#91). Plan này:

1. **Bỏ cột Học viên**: main table 4→3 cột `[Ngày & Giờ | Chủ đề | Trạng thái]`, legacy fallback 5→4 cột `[Ngày | Giờ | Chủ đề | Trạng thái]`.
2. **SessionActionsModal**: modal hành động theo buổi — bulk **Hoàn thành buổi** (fan-out `check-in`) và **Hủy buổi** (fan-out `cancel-lesson`, confirm liệt kê tên + ngày occurrence đích) — targeting **sequential-head per sid** (gate `sidStateAt === "upcoming"` tại occurrence đang hiển thị), không bao giờ iterate `session.rows`.

**Không có edit form field nào** (topic/day/time/dur/zoom) trong scope này — xem "Non-goals (pinned)", "Advisory Checkpoint" và "Open Questions" (cần sign-off requester về cách đọc "điều chỉnh" = status-only).

## Scope Challenge (Step 0)

- **Existing code:** API `POST /api/lessons/:id/edit` đã có (apps/server/src/routes/kernel.ts:704–749, full-replace 5 trường, upcoming-only, conditional-write). `LessonEditForm` + action `lesson-edit` đã có nhưng chỉ reachable từ trang `/schedule` (per-row). #91 đã thêm CTA Điểm danh tại chỗ + roster modal với contract props-threading pin bởi test. Legacy headers (gồm "Học viên") bị pin tại `class-detail-sessions-tab.contract.test.ts:71` — **main table headers chưa bị pin** (phase 1 sẽ thêm negative assertion). Phase-03 của plan `260826-1611` từng thiết kế inline-edit topic + status dropdown — **chưa implement, bị supersede** (xem "Cross-Plan Supersession").
- **Requested scope:** (1) admin/giáo viên điều chỉnh được buổi học trên tab Buổi học; (2) bỏ cột Học viên. Giao đủ 2 mục.
- **Complexity:** ~7–9 file (1 component sửa, 1 modal + 1 helper mới, route wiring, 3 file test, 1 e2e spec) — 3 phase. Không class/service mới.
- **Selected mode: HOLD SCOPE** (kongming GO-WITH-CHANGES ×2 — pins là binding).

## Advisory Checkpoint (kongming, 2026-08-27 — GO-WITH-CHANGES)

### Session 1 — Scope & design fork

1. **Occurrence-batch edit từ tab này = NO-GO.** `sessionTopic()` (class-sessions.ts:256–269) gom *unique* topics từ toàn bộ slot-bag theo thứ tự xuất hiện rồi lấy `editedTopics[slotIndex - 1]`. Fan-out một topic T cho các row upcoming của buổi k ⇒ unique list `[T]` ⇒ **T hiển thị ở buổi số 1**. Edit buổi 5 hiện nhầm lên buổi 1, không có lỗi nào báo. (Phase-03 của `260826-1611` dính đúng bug này trong thiết kế `handleEditTopic`.)
2. **dur edit = invisible.** `ClassSession.dur` derive từ schedule parse, không phải row (class-sessions.ts:54–55, 142–143; `sessionTimeRange` dòng 174–176). Divergence guard chỉ soi day/time, không bắt dur.
3. **zoom edit từ tab này = không có bề mặt hiển thị.** *(Sửa sau red-team: claim gốc "zoom chỉ render trong edit form" SAI — zoom CÓ render ở view modal `/schedule` tại lesson-modal.tsx:138–147. Kết luận giữ nguyên ở mức tab này: tab Buổi học không hiển thị zoom ở đâu.)*
4. **Slot-bag không có occurrence identity** (comment class-sessions.ts:311–322). Mọi mutation "theo buổi" phải targeting **sequential-head per sid**: sid có `sidStateAt(stats, slotIndex) === "upcoming"` tại occurrence đang hiển thị, rồi mới lấy `firstUpcomingLessonId`.
5. **Resolve-trước-khi-dispatch**: chụp TOÀN BỘ target ids thành mảng local từ snapshot render TRƯỚC POST đầu tiên; không re-resolve theo props giữa chừng (bus refetch sau mỗi POST làm store repaint liên tục).
6. **Partial failure theo bucket `KernelCommandResult.kind`** (xem Session 2 C1); tiếp tục phần còn lại; summary một toast duy nhất.
7. **Cột Học viên**: bỏ nguyên trạng cả 2 bảng; giữ `sessionStudents()` + prop `studentById`. KHÔNG đụng tab label `{ id: "roster", label: "Học viên" }`.
8. **Modal không tự gọi mutation hooks** — mọi dispatch đi qua callback route-level (contract #91 giữ nguyên chữ: bảng/modal không gọi `useDirectKernelAction`).

### Session 2 — Post-red-team redesign (pins C1–C5, binding)

- **C1 — Phân loại kết quả theo 4 bucket `KernelCommandResult.kind`, KHÔNG theo nguyên nhân 409.** Transport vứt response body khi throw (`postKernelCommand`, repos/kernel.ts:214–216; `HttpError` chỉ mang status + message generic, kernel-load-state.ts:9–14) nên client không đọc được "lesson is not upcoming" vs "enrollment mismatch". Buckets: `refreshed` → ok; `committed` → ok + cờ "cần lưu ý stale"; `outcome-unknown` → bucket riêng, kết thúc batch **bắt buộc** thêm một `refresh()` và liệt kê tên; `definite-failure` → thất bại, liệt kê tên. Không bao giờ đếm 409 nào là "settled" mặc định. (Nợ kỹ thuật parse body 4xx → Roadmap.)
- **C2 — Diễn đạt semantics behind-head đúng.** Sid trễ tiến độ **không có nút** tại occurrence này trong roster modal (`display: "upcoming"`, `enrollmentLessonId: null`, class-sessions.ts:405–413). Bulk action tương đương **mô hình paint prefix của hệ thống** (tương tự click tại occurrence đầu chưa đánh dấu của học viên đó) — không phải "tương đương nút trên màn hình này".
- **C3 — Confirm bắt buộc liệt kê mỗi học viên kèm NGÀY occurrence đích.** `p = completed + cancelled + 1` per sid (gate bảo đảm `p ≤ slotIndex`); tra sibling session cùng slot có `slotIndex === p` lấy `dateISO`. Behind-head hiển thị nhóm riêng "sẽ áp dụng cho buổi [ngày] (bù buổi trễ)". Bắt buộc với Hủy buổi (bất khả hồi). Điều kiện flip: nếu requester từ chối semantics "bù buổi trễ" → downgrade gate thành strict-head (chỉ sid có `p === slotIndex`).
- **C4 — Vòng lặp batch:** targets là mảng local chụp trước loop; **khóa đóng modal khi đang chạy** (precedent grade-modal.tsx:170); disable bằng cờ batch-local (hook `busy` là per-instance — CurriculumManagementSection có hook riêng, `busy` của route không phủ được); đúng MỘT toast summary cuối, danh sách tên fail truncate "tên1, tên2, tên3 +n"; **cấm** đi qua `reportDirectOutcome` từng call.
- **C5 — Entry gate theo `sessionActionTargets(session).length > 0`** (không theo `attendance.kind === "actionable"` — kind nhúng date gate, làm Hủy buổi unreachable cho buổi tương lai). Date gate chỉ disable nút "Hoàn thành buổi" bên trong modal.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bảng buổi học không còn cột Học viên (main + legacy fallback), contract test cập nhật + negative assertion | P1 |
| 2 | SessionActionsModal: bulk Hoàn thành buổi / Hủy buổi, targeting sequential-head per sid (gate `sidStateAt === "upcoming"`), confirm liệt kê tên + ngày occurrence đích | P1 |
| 3 | Fan-out an toàn: resolve-before-dispatch, phân loại 4 bucket, partial-failure tiếp tục + một toast summary trung thực | P1 |
| 4 | Non-goals được pin bằng source-text contract test (mirror style test của repo) | P2 |
| 5 | E2E phủ flow hủy buổi (kể cả buổi tương lai) + bỏ cột | P2 |

## Non-goals (pinned)

- **Không** có input/select topic, day, time, dur, zoom trong `session-actions-modal.tsx` — cấm **occurrence-batch field edit** từ tab này, pin bằng contract test đọc source. (Per-row edit các trường này **vẫn khả dụng ở `/schedule`** — không bị chặn.)
- **Không** thêm kernel action mới vào `data-actions.ts` (chỉ dùng `check-in`, `cancel-lesson` hiện có — verify bằng diff).
- **Không** sửa `sessionTopic()`/divergence guard/schedule semantics; **không** sửa `useDirectKernelAction`/`postKernelCommand` dùng chung (nợ HttpError body → Roadmap).
- **Không** undo completed/cancelled (kernel không có action ngược — xem Known Limitations).
- **Không** đụng tab "Học viên" (roster tab) trong class detail.
- Full per-occurrence edit đúng nghĩa cần occurrence identity ở server — **roadmap riêng**, không nhét vào plan này.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Bỏ cột Học viên](./phase-01-start.md) | Pending |
| 2 | [Phase 2: SessionActionsModal — bulk hoàn thành/hủy buổi](./phase-02-session-actions-modal-bulk-hoan-thanh-huy-buoi.md) — **DEFERRED** (xem Scope Decision) | Pending |
| 3 | [Phase 3: Tests, e2e và contract pins](./phase-03-tests-e2e-va-contract-pins.md) — **DEFERRED** (xem Scope Decision; giữ e2e assertion 3 cột nếu cook riêng phase 1) | Pending |

## Success Criteria

- [ ] Main table 3 cột `[Ngày & Giờ | Chủ đề | Trạng thái]`; legacy fallback 4 cột `[Ngày | Giờ | Chủ đề | Trạng thái]`; negative assertion không `>Học viên</th>` ở cả hai thead.
- [ ] Roster tab + `SessionAttendanceModal` + CTA Điểm danh (#91) hoạt động nguyên vẹn; các regex pin #91 vẫn match sau khi thêm nút "Điều chỉnh".
- [ ] Session **có target** (kể cả buổi tương lai) mở được SessionActionsModal; Hoàn thành buổi disabled khi chưa đến ngày (VN date gate); Hủy buổi luôn khả dụng khi có target, confirm liệt kê tên + ngày occurrence đích từng học viên (nhóm riêng cho behind-head).
- [ ] Targeting: chỉ sid có `sidStateAt(slotIndex) === "upcoming"`; đúng 1 id/sid; unit test chứng minh sid đã settled tại occurrence này bị exclude; không iterate `session.rows` trong JSX.
- [ ] Fan-out: targets chụp local trước loop; phân loại 4 bucket theo `KernelCommandResult.kind`; một toast summary duy nhất (tên fail truncate); `outcome-unknown` kích hoạt refresh cuối; modal khóa khi đang chạy.
- [ ] Contract test pin: modal không chứa field edit; `data-actions.ts` không action type mới; modal không gọi `useDirectKernelAction`.
- [ ] E2E: hủy buổi tương lai + hoàn thành buổi → badge flip đúng, persist qua reload; bảng 3 cột không vỡ layout.
- [ ] Gates: `pnpm check`, `pnpm test`, `pnpm check-types` xanh (per docs/code-standards.md).

## Known Limitations (declared)

- **Legacy-schedule classes** (free-text schedule / thiếu startDate → `buildClassSessions` null) chỉ được bỏ cột, **không có SessionActionsModal** — thao tác thay thế: `/schedule`. Không phải bug.
- **Trạng thái hỗn hợp hiển thị aggregate**: `sessionStatus` yêu cầu toàn đồng thuận; partial fan-out → badge vẫn "Sắp tới". Sự thật per-sid xem roster modal; summary toast bucket là kênh kết quả chính.
- **Bulk cancel bất khả hồi** (transition matrix cố định, kernel.ts:641–694, không có un-cancel). Remediation: sửa dữ liệu trực tiếp ở tầng DB bởi admin (không có tool UI) — ghi nhận ở đây như con đường duy nhất.
- **Behind-head semantics**: bulk action áp lên occurrence **đầu chưa đánh dấu** của học viên trễ tiến độ (paint prefix), không phải occurrence hiển thị — được surfacing rõ ở confirm (C3). Cần sign-off requester (xem Open Questions).
- **Chi phí batch**: N×(POST + full snapshot GET) tuần tự (bus refetch sau mỗi POST, repos/kernel.ts:363–399). N = sĩ số lớp (~≤15) — chấp nhận; không server batch trong plan này.

## Risk Assessment

**Risk 1 (HIGH): Ngữ nghĩa "Hủy buổi xả vào buổi trễ sớm nhất" bị hiểu sai.** User hiểu nút theo dòng bảng; hệ thống theo prefix count.
- Signal: user report "hủy buổi 5 nhưng buổi của em A bị hủy buổi 3".
- Response: C3 — confirm liệt kê tên + ngày đích từng học viên, nhóm behind-head riêng; Open Question gửi minh họa cụ thể cho requester TRƯỚC khi cook; e2e/manual scenario behind-head (phase 3).

**Risk 2 (HIGH): Fan-out sai occurrence.** POST id không phải sequential-head ⇒ trạng thái phủ nhầm buổi.
- Signal: sau bulk, badge buổi khác thay đổi.
- Response: gate `sidStateAt === "upcoming"` trong helper thuần + unit test riêng (case sid settled tại occurrence bị exclude); cấm `session.rows` trong JSX (pin #91 giữ).

**Risk 3 (HIGH): Báo thành công giả.** Đếm sai bucket / nuốt lỗi.
- Signal: summary "N/N" trong khi badge không đổi.
- Response: C1 — 4 bucket theo `kind`, unknown → refresh + liệt kê tên; một toast; cấm per-call `reportDirectOutcome`.

**Risk 4 (MEDIUM): Contract test đọc source như text** — thêm nút vào ternary chain cell Trạng thái dễ vỡ regex pin #91 (`disabled={busy || isPending(`, `lessonId: checkInId`, not-match `session\.rows`).
- Signal: test #91 fail sau refactor.
- Response: giữ nguyên cả 2 nhánh "Điểm danh", wrap cell trong Fragment, append nút "Điều chỉnh" (label ≠ "Điểm danh"); cập nhật assertion cùng commit.

**Risk 5 (MEDIUM): Áp lực "sao không đổi chủ đề ngay đây"** sau launch.
- Signal: PR xóa/modify negative assertion field-edit.
- Response: non-goal pin bằng test + tham chiếu Roadmap (server occurrence identity) trong review; per-row edit vẫn ở `/schedule`.

**Risk 6 (LOW): Bỏ cột làm vỡ layout/expanded row.**
- Signal: expanded detail row lệch cột.
- Response: `colSpan={3}`; e2e check.

## Roadmap (ngoài scope)

- Server-side **occurrence identity** (batch endpoint keyed `(classId, day, time)` hoặc occurrence-index column) — điều kiện cần cho per-occurrence edit đúng nghĩa.
- **Mở rộng `HttpError` parse body 4xx** để client phân biệt được các nguyên nhân 409 (hiện bị discard ở transport).
- **Server-side batch status endpoint** để bỏ N×(POST+GET).
- **`reopen-lesson` action** (cancelled → upcoming) nếu nhu cầu hoàn tác thật.

## Red Team Review

### Session — 2026-08-27
**Findings:** 15 (dedup từ 3 reviewer: Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Severity breakdown:** 3 Critical, 4 High, 8 Medium
**Disposition:** 15 accepted (0 rejected) — 3 Critical và 2 High dẫn đến redesign Phase 2 theo kongming Session 2 (C1–C5)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `sessionActionTargets` thiếu sequential-head gate — fan-out ghi nhầm occurrence | Critical | Accept | Phase 2 (helper + gate `sidStateAt`), Phase 3 (unit test) |
| 2 | `run()` là `Promise<void>` nuốt kết quả + silent no-op guard — đếm x/N bất khả thi | Critical | Accept | Phase 2 (chuyển sang `dispatch` pattern grade-modal, bucket C1) |
| 3 | Entry gate `kind === "actionable"` nhúng date gate — Hủy buổi unreachable cho buổi tương lai | Critical | Accept | Phase 2 (entry theo `targets.length > 0`), Phase 3 (e2e hủy buổi tương lai) |
| 4 | Status-only interpretation thiếu sign-off; non-goal pin có thể chặn per-row edit hợp lệ | High | Accept | plan.md (Open Questions + Non-goals reword) |
| 5 | Bulk cancel bất khả hồi, không remediation path | High | Accept | plan.md (Known Limitations), Phase 2 (confirm tên + ngày đích) |
| 6 | Zoom claim sai sự thật (có render ở /schedule view modal) | Medium | Accept | plan.md (Advisory #3 sửa) |
| 7 | Không có confirm primitive — cần spec 2-step nội bộ | Medium | Accept | Phase 2 |
| 8 | Nút mới đụng ternary chain + regex pin #91 + e2e count | Medium | Accept | Phase 2 (Fragment wrap, label ≠ "Điểm danh"), Phase 3 |
| 9 | Toast spam N lần chắc chắn (không phải "nếu") | Medium | Accept | Phase 2 (C4 — một toast) |
| 10 | "Refetch cuối" sai — bus refetch sau MỖI POST (N× chi phí) | Medium | Accept | plan.md (Known Limitations), Phase 2 (progress + khóa modal) |
| 11 | 409 có 2 nguyên nhân, không thể phân biệt ở client (body bị discard) | Medium | Accept | Phase 2 (C1 buckets), plan.md (Roadmap HttpError) |
| 12 | Claim "supersession đã thêm 2 chiều" sai tại thời điểm viết | Medium | Accept | Ghi chú supersession thêm ngay tại plan-time (xem Cross-Plan Supersession) |
| 13 | Legacy fallback classes không có actions — không tuyên bố giới hạn | Medium | Accept | plan.md (Known Limitations) |
| 14 | `busy` không phủ được hook riêng của CurriculumManagementSection | Medium | Accept | Phase 2 (cờ batch-local, C4) |
| 15 | Mixed-state badge aggregate che partial fan-out | Medium | Accept | plan.md (Known Limitations), Phase 3 (e2e per-sid) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-…, phase-03-…
- Decision deltas checked: 15 (finding deltas + C1–C5)
- Reconciled stale references: run()-based batch → dispatch-based; entry gate actionable → targets.length; "refetch cuối" → per-POST refetch; zoom claim; supersession claim; x/N toast semantics → bucket semantics
- Unresolved contradictions: 0

## Cross-Plan Supersession

- **Supersede một phần** `plans/260826-1611-merge-class-detail-schedule-and-curriculum-tabs/phase-03-timeline-mutations-inline-edit-and-status.md`: phần inline topic edit + status dropdown được thay bởi SessionActionsModal (status-only). Lý do: thiết kế cũ fan-out topic trên toàn slot-bag — ghi nhầm occurrence (Advisory #1). **Ghi chú supersession đã thêm 2 chiều tại plan-time (2026-08-27)** — file đó có blockquote trỏ về plan dir này.
- Plan `260826-1611` có status `pending` stale trong store dù phase 1–2 đã ship qua PR #90 — không ảnh hưởng plan này (code đã trên develop).

## Scope Decision (post-review — 2026-08-27, requester sign-off)

**OQ1 ĐÃ CHỐT: option 3 — Full per-occurrence edit.** Requester yêu cầu đổi giờ/chủ đề theo đúng từng buổi cho cả lớp. Theo điều khoản option 3:

- **Scope plan này thu hẹp còn Phase 1** (bỏ cột Học viên). Phase 2–3 (SessionActionsModal + bulk status actions) → **DEFERRED**, chuyển vào plan server-side kế tiếp (occurrence identity / batch endpoint) làm tầng UI sau khi data model hỗ trợ.
- Thiết kế phase 2–3 đã red-team + kongming pins C1–C5 được GIỮ NGUYÊN trong file làm tư liệu cho plan kế tiếp — không implement trong plan này.
- **Plan server-side kế tiếp (chưa lập)**: occurrence identity cho lesson rows (occurrence-index column hoặc batch endpoint keyed `(classId, day, time)`), per-occurrence edit áp cả nhóm, `sessionTopic()` render theo occurrence identity thay vì first-appearance, divergence guard đánh giá lại.

## Open Questions

None — OQ1 đã chốt (xem Scope Decision phía trên).
