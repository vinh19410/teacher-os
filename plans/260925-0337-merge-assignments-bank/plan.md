---
title: "Gộp trang Bài tập: /assignments + /assignments/bank"
description: "Gộp 2 route trùng tính năng thành một trang /assignments duy nhất chỉ hiển thị danh sách bài tập đã tạo; xoá route /assignments/bank và cập nhật toàn bộ tham chiếu điều hướng, unit test và e2e."
status: completed
priority: P2
effort: 4h
issue: 267
branch: develop
tags: [refactor, frontend]
blockedBy: []
blocks: []
created: 2026-09-25
---

# Gộp trang Bài tập: /assignments + /assignments/bank

## Overview

Hai route `/assignments` và `/assignments/bank` đang trùng tính năng: cả hai đều là
"trang danh sách bài tập". Theo yêu cầu, gộp thành **một trang duy nhất `/assignments`**
chỉ hiển thị **danh sách bài tập đã được tạo** (dữ liệu `assignmentPrompts` — nội dung
hiện tại của trang bank). Route `/assignments/bank` bị xoá, bảng tracking per-học viên
cũ (nạp từ `data.assignments`, có phần mock) bị thay thế hoàn toàn.

## Giải pháp & giả định

- "Bài tập đã được tạo" = các đề đã lưu qua `/assignments/new` (`POST /api/assignments/prompts`),
  hiện đang hiển thị ở `/assignments/bank`. Đây là dữ liệu thật duy nhất; bảng cũ của
  `/assignments` đọc `data.assignments` (luồng server-fed per-học viên, dùng `averageBand` từ `mock-data.ts`).
- Trang gộp giữ nguyên UX của trang bank (filter kỹ năng/phần thi, search, preview aside,
  StatusTag "Nháp/Sẵn sàng/Đã dùng N lớp") vì các tính năng này phục vụ chính việc duyệt
  danh sách bài tập đã tạo.
- Theo dõi tiến độ làm bài: phía giáo viên ở trang Lớp học (tab Bài tập —
  `apps/web/src/components/classes/class-assignments-tab.tsx`); phía học viên ở
  `apps/student/src/components/overview/assignment-list.tsx` — cả 2 surface này không bị chạm tới.
- Luồng chấm bài `/assignments/$assignmentId` (GradeModal): bảng cũ chỉ là 1 trong 2 điểm vào —
  điểm vào còn lại tại `apps/web/src/routes/_auth/students/$studentId.tsx:256` được giữ nguyên,
  luồng chấm bài không mất. Route này nằm ngoài scope merge.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/assignments` hiển thị duy nhất danh sách bài tập đã tạo (prompts + trạng thái sử dụng) | P1 |
| 2 | Xoá route `/assignments/bank` và mọi tham chiếu điều hướng tới nó | P1 |
| 3 | Unit test + e2e cập nhật theo, toàn bộ suite xanh | P1 |

## Non-goals

- Không đổi backend/DB/contracts (`assignment_prompt`, `class_assignment`, kernel snapshot giữ nguyên).
- Không xoá field `assignments` trong snapshot (`data-provider.assignmentById`, trang học viên `$studentId` vẫn dùng).
- Không thêm redirect từ `/assignments/bank` → `/assignments` (app nội bộ, link nội bộ đã cập nhật hết).
- Không đổi luồng tạo đề (`/assignments/new`) và luồng giao đề ở trang Lớp học.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Gộp trang Bài tập](./phase-01-merge-assignments-page.md) | Done |
| 2 | [Cập nhật unit test](./phase-02-update-unit-tests.md) | Done |
| 3 | [Cập nhật e2e + verify toàn diện](./phase-03-update-e2e-and-verify.md) | Done |

## Success Criteria

- [x] `/assignments` là path duy nhất hiển thị danh sách bài tập đã tạo; route bank bị xoá khỏi routeTree và khỏi exact-entry của matcher — request tới `/assignments/bank` vẫn nhận SPA shell HTTP 200 (matcher dynamic prefix `/assignments/`) nhưng router render not-found
- [x] `grep -rn "assignments/bank" apps packages --include="*.ts" --include="*.tsx" | grep -v routeTree.gen` trả về 0 kết quả
- [x] `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm --filter e2e e2e` đều pass
- [ ] Không thay đổi nào ở `apps/server`, `packages/api`, `packages/db`

## Risks

- `routeTree.gen.ts` (apps/web) được sinh tự động bởi TanStack Router plugin khi chạy vite — phải regenerate bằng lệnh build/dev, không sửa tay; file đang gitignore (`.gitignore:12`) nên KHÔNG commit.
- Giữa phase 1 và phase 2, unit test cũ của `index.test.tsx` sẽ fail tạm thời (chúng assert bảng cũ) — đây là trạng thái trung gian chấp nhận được, phase 2 sửa ngay. Ngoài unit test, 3 spec e2e liên quan bank cũng đỏ tạm thời sau phase 1 — commit phase 1-2 giữ local trên branch, chỉ push khi tạo PR ở phase 3.
- E2E phụ thuộc label nút: `+ Tạo bài tập` (giữ nguyên), heading `Ngân hàng bài tập` (đổi thành `Bài tập`) — phải update đúng spec `assignment-bank.spec.ts`.

## Validation Log

### Verification Results
- Claims checked: 24 (file paths, line refs, label e2e, scripts — đọc trực tiếp toàn bộ file liên quan)
- Verified: 24 | Failed: 0 | Unverified: 0
- Tier: Standard (3 phases)
- Failures: none

### Quyết định đã chốt (từ yêu cầu người dùng)
- Trang gộp CHỈ hiển thị danh sách bài tập đã tạo → bảng tracking per-học viên cũ bị bỏ,
  không giữ dưới dạng tab (theo đúng chữ "chỉ hiển thị danh sách bài tập đã được tạo").

## Red Team Review

### Session — 2026-09-25 (pre-implementation, 3 reviewers: Security Adversary / Failure Mode Analyst / Assumption Destroyer+Contract Verifier)
**Findings:** 10 consolidated (8 accepted, 2 rejected-after-verification)
**Severity breakdown:** 2 Critical, 4 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 case "click CTA → mockNavigate" bất khả thi: vitest env `node` + `renderToStaticMarkup` không fire event; không tồn tại pattern fireEvent trong apps/web | Critical | Accept | Phase 2 (thay bằng assertion tĩnh label CTA) |
| 2 | `kernel-runtime.contract.test.ts:471-475` (test #106) đọc source `index.tsx`, assert `${data.assignments.length} bài tập` + `${pendingCount} cần xử lý` → đỏ vĩnh viễn sau Phase 1; plan bỏ sót file | Critical | Accept (đã verify trực tiếp) | Phase 2 (thêm file + cập nhật khối #106) |
| 3 | Inventory 4 case `bank.test.tsx` sai: không có case "filter kỹ năng"; case 1/4 assert copy cũ bị Phase 1 đổi | High | Accept | Phase 2 (mapping table đúng thực tế) |
| 4 | Success criterion "404" sai: `VALID_DYNAMIC_PREFIXES` chứa `/assignments/` → SPA shell 200 + router not-found | Medium | Accept | plan.md Success Criteria, Phase 1 |
| 5 | "Commit routeTree.gen.ts" bất khả thi — file gitignored (`.gitignore:12`) | Medium | Accept (đã verify trực tiếp) | Phase 1 |
| 6 | Lệnh smoke `--grep "assignment"` khớp theo title → chạy 0 test | Medium | Accept | Phase 3 |
| 7 | Trích dẫn sai surface học viên (`class-assignments-tab.tsx` là tab giáo viên; surface học viên là `apps/student/src/components/overview/assignment-list.tsx`) | Medium | Accept | plan.md |
| 8 | Validation Log "24/24 verified, 0 failed" bị vượt — ≥3 claim fail khi đối chiếu | Medium | Accept (session này đính chính) | plan.md (section này) |
| 9 | Bỏ bảng cũ làm mất 1 trong 2 điểm vào `/assignments/$assignmentId` (luồng chấm bài) | High | Reject-as-blocker / Accept-as-note: điểm vào còn lại `students/$studentId.tsx:256` được giữ — luồng chấm bài không mất (đã verify trực tiếp); ghi nhận trong Giải pháp & giả định | plan.md |
| 10 | Empty-state #166 (testid `assignments-empty-state` + CTA "Quản lý lớp/học viên") bị thay | Medium | Accept-as-decision: thay thế có chủ đích bởi empty state mới của trang gộp (đúng tinh thần merge) | Phase 2 (mapping) |

Rejected findings (sau verify trực tiếp): không có finding bị loại vì thiếu bằng chứng; finding 9 được hạ từ blocker thành ghi nhận vì bằng chứng cho thấy còn 1 điểm vào hợp lệ.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi áp findings)
- Decision deltas checked: 6 — (1) criterion 404 → SPA 200 + not-found; (2) routeTree.gen.ts gitignored, không commit; (3) case test port = mapping table thay vì "port nguyên"; (4) thêm kernel-runtime.contract.test.ts vào Phase 2; (5) trích dẫn surface học viên sửa đúng file; (6) smoke e2e dùng chỉ định file thay vì --grep
- Reconciled stale references: plan.md Success Criteria + Risks; phase-01 Key Insights/Related Code Files/Steps/Success Criteria; phase-02 Key Insights/Requirements/Related Code Files/Steps/Success Criteria/Risk Assessment; phase-03 Risk Assessment
- Unresolved contradictions: 0
