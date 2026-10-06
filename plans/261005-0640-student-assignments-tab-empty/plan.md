---
title: "Sửa tab Bài tập trống ở chi tiết học viên"
description: "Tab Bài tập trong chi tiết học viên chỉ đọc bảng legacy `assignment` (grading-only, không bao giờ được flow giao bài ghi) nên luôn trống; plan derive thêm bài từ `classAssignments[].targets` (#208) và merge cả hai nguồn giống cách student portal đã làm."
status: completed
priority: P1
effort: "4h"
issue: 317
branch: fix/student-assignments-tab-empty
tags: [bugfix, frontend]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Sửa tab Bài tập trống ở chi tiết học viên

## Overview

Học viên đã được giao bài (flow "Giao bài tập" #208 ghi `class_assignment` + `class_assignment_target`) nhưng tab **Bài tập** ở trang chi tiết học viên vẫn hiện "Chưa có dữ liệu." Nguyên nhân: tab chỉ đọc `data.assignments` — ánh xạ từ bảng legacy `assignment` dùng cho grading, không có endpoint create nào trong production. Fix là derive row từ `data.classAssignments` (đã có sẵn trong kernel snapshot, kèm `targets.studentId`) và merge với legacy grading rows, tái sử dụng helper `studentSubmissionStatus`/`StatusTag`/`fmtDue` như tab Bài tập của lớp. Fix thuần client, không đụng backend.

## Root Cause (đã verify theo code)

| Hệ | Bảng | Nguồn ghi |
|---|---|---|
| Grading per-student (legacy) | `assignment` | Không có create endpoint; chỉ `POST /:id/grade` (UPDATE) + test helper |
| Giao bài cho lớp (#208) | `class_assignment` + `class_assignment_target` | Flow "Giao bài tập" duy nhất trong UI |

- `apps/web/src/routes/_auth/students/$studentId.tsx:78` — `data.assignments.filter((a) => a.sid === studentId)` đọc nhầm nguồn; tab (dòng 247–283) không hề đọc `data.classAssignments`.
- `apps/web/src/lib/repos/assignments.ts:14–26` — `mapAssignments` map từ `snapshot.assignments` (bảng legacy).
- Flow giao bài: `apps/server/src/routes/kernel.ts:708–796` insert header + targets; target liên kết thẳng `studentId` (không qua enrollment).
- Student portal đã merge đúng cả hai nguồn: `apps/server/src/routes/student.ts:791` (`[...classAssignmentItems, ...gradingItems]`) — nên học viên thấy bài, giáo viên thì không.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tab Bài tập của học viên hiện mọi bài đã giao qua flow #208 kèm trạng thái nộp | P1 |
| 2 | Giữ tương thích row legacy grading (band, link trang chấm) khi có | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Selector bài tập theo học viên + unit tests](./phase-01-student-assignment-rows.md) | Pending |
| 2 | [Nối tab Bài tập vào selector + verify UI](./phase-02-wire-tab-ui.md) | Pending |

## Key Decisions

- **Merge cả hai nguồn** (class rows + legacy grading rows) thay vì bỏ legacy —parity với student portal, giữ ý nghĩa cột Band.
- **Title của class row là plain text** (không link): trang `/assignments/$assignmentId` chỉ hiểu legacy grading rows; danh sách bài ở tab lớp cũng đang không có link. Link chỉ giữ cho grading row.
- **Tên lớp là subtitle trong cell "Bài tập"**, không thêm cột — giữ bảng gọn ở viewport 375px.
- **Cột Trạng thái dùng `StatusTag` + `studentSubmissionStatus`** (Đã nộp / Đã nộp · trễ hạn / Chưa nộp · quá hạn / Chưa nộp) — cùng ngôn ngữ UI với tab lớp; grading row giữ text cũ.
- **Sort theo `due` tăng dần** (hạn gần nhất lên đầu; row `due` rỗng/không phải ISO — chỉ xảy ra ở grading legacy — xếp xuống cuối) — giáo viên chase nộp bài theo hạn.
- **Nguồn grading là legacy frozen** (không có create path trong production, chỉ `POST /:id/grade` UPDATE): nhánh `kind: "grading"` chỉ tồn tại để hiển thị dữ liệu lịch sử còn sót trong DB; cân nhắc gỡ nhánh khi legacy được migrate.

## Non-goals

- Không thêm endpoint/API mới (snapshot đã đủ dữ liệu).
- Không xây trang chi tiết cho class assignment row (làm riêng khi có nhu cầu).
- Không sửa flow giao bài hay permission; không đụng e2e spec mới.

## Success Criteria

- [ ] Học viên có target trong `class_assignment_target` hiện đủ row bài tập kèm trạng thái ở tab Bài tập.
- [ ] Học viên chưa được giao bài vẫn thấy empty state "Chưa có dữ liệu."
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test` pass locally.
- [ ] UI verify 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`, kèm screenshot trong PR.

## Red Team Review

### Session — 2026-10-05 (vibe run, 2 reviewer: Security Adversary + Assumption Destroyer, tier Light)
**Findings:** 8 deduped (8 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 2 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Kịch bản verify "real-time sau submit" sai cơ chế: snapshot `['kernel']` có `staleTime: Infinity`, `refetchOnWindowFocus/Reconnect: false` (`query-client.ts:11–25`), chỉ refresh qua command bus write phía giáo viên (`data-provider.tsx:100–106`) — student submit ở app khác không bao giờ tự hiện | High | Accept | Phase 2 (step 5, Verification, Risk Assessment) |
| 2 | Sort `due` "ISO so sánh trực tiếp được" sai với grading legacy: `assignment.due` `notNull default ""` (`packages/db/src/schema/assignment.ts:31`), data thực `due: "20/08"` (`kernel.test.ts:2236`); `""` sort trước mọi ISO → row không hạn đè đầu danh sách; kèm `type: ""` không bị `??` bắt (`assignment.ts:30`) | High | Accept | Phase 1 (Architecture, Todo), plan.md Key Decisions, Phase 2 (Requirements) |
| 3 | Test case "prompt đã xoá → typeLabel null" là dead branch (FK `promptId` cascade `class-assignment.ts:24–26`, không có DELETE endpoint); case reachable thật (enrollment xoá nhưng target còn, `kernel.ts:677`; `due: ""`/`type: ""`) không có test | Medium | Accept | Phase 1 (Todo) |
| 4 | Fixture verify `vinh1021308@gmail.com` không tồn tại trong seed/repo — gate thủ công không tái lập được từ trạng thái sạch | Medium | Accept | Phase 2 (step 5) |
| 5 | `skillOf` fallback im lặng sang `SKILLS[0]` "Writing" cho skill id lạ (`assignment-presets.ts:308–315`; contract `skill: AssignmentSkill \| string` tại `contracts.ts:1317`) → `typeLabel` nhận nhãn sai thay vì null; `SkillPreset` không có field `.label` | Medium | Accept | Phase 1 (Requirements, Architecture, Todo) |
| 6 | Nguồn grading là legacy frozen (0 `insert(assignment)` ngoài test) — nhánh UI thứ hai không được ghi nhận là display-only cho dữ liệu lịch sử | Medium | Accept | plan.md Key Decisions |
| 7 | "Grading row giữ nguyên hành vi cũ" mâu thuẫn với sort chung list + `fmtDue` áp lên chính grading row | Medium | Accept | Phase 2 (Requirements, Success Criteria) |
| 8 | Validation Log "Verified: 12/12" chỉ phủ symbol-existence, không phủ claim hành vi — 2 claim hành vi load-bearing sai (findings 1, 2) | Medium | Accept | plan.md Validation Log (scope note) |

### Whole-Plan Consistency Sweep (sau khi áp findings)
- Files reread: plan.md, phase-01-student-assignment-rows.md, phase-02-wire-tab-ui.md.
- Decision deltas checked: 5 — (1) sort: due rỗng/không-ISO xuống cuối; (2) `typeLabel`: selector normalize `""` → null, dùng inline map strict thay `skillOf`; (3) verify thủ công: fixture tái lập được + reload tường minh sau student submit; (4) grading row: "giữ hành vi cũ trừ sort + format Hạn"; (5) ghi nhận legacy frozen.
- Reconciled stale references: 4 — Key Decisions sort rule; phase-01 Architecture import `skillOf` + comment `due`; phase-02 Requirements grading bullet + Success Criteria; phase-02 Verification/Risk "real-time".
- Unresolved contradictions: 0.

## Validation Log

### Verification Results
- Claims checked: 12 | Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases) — verify trực tiếp trên code bởi orchestrator + scout report.
- **Scope note (red-team session 2026-10-05):** phép verify ban đầu chỉ phủ symbol/line-existence; các claim hành vi load-bearing (refresh semantics `['kernel']`, format `due` grading legacy) đã được red-team rà lại và sửa tại section Red Team Review — findings 1, 2.
- Đã đối chiếu: `$studentId.tsx:78,247–283`; `repos/assignments.ts:14–26`; `repos/class-assignments.ts`; `repos/kernel.ts:304`; `components/assignments/assignment-status.ts`; `classes/$classId.tsx` (tab là local state, không có search param); `assignments/$assignmentId.tsx` (chỉ resolve legacy assignment); schema comments `packages/db/src/schema/assignment.ts:14–18`, `class-assignment.ts:14–19,51`; `KernelHydratedData` (mock-data.ts:219–240) đủ các field cần (`assignments`, `classAssignments`, `classes`, `assignmentPrompts`).

### Whole-Plan Consistency Sweep
- Không còn tham chiếu tới tên stub cũ `phase-01-start.md`; link phases trong plan.md trỏ đúng file đã rename.
- Thuật ngữ thống nhất: `typeLabel` (đã đổi từ `skillLabel` ở mọi nơi); quyết định merge 2 nguồn / plain-text title / subtitle tên lớp / StatusTag / sort due tăng dần khớp nhau giữa plan.md, phase-01 và phase-02.
- Symbol được plan tham chiếu đã verify tồn tại: `Scores` (mock-data.ts:116), `skillOf` (assignment-presets.ts:315), `StatusTag` (`components/assignments/status-tag.tsx`).
- `ak plan validate` exit 0; CLI parse được 2 phase / 9 tasks. Không còn mâu thuẫn chưa xử lý.
