---
phase: 3
title: "Tests, e2e và contract pins"
status: blocked
priority: P2
effort: "3-4h"
dependencies: [2]
---

# Phase 3: Tests, e2e và contract pins

> **⏸️ DEFERRED (2026-08-27, Scope Decision ở plan.md):** phần tests của SessionActionsModal đi cùng phase 2 vào plan server-side kế tiếp. **Đính chính (red-team rerun 2026-08-27):** e2e assertion "bảng 3 cột" KHÔNG tồn tại trong suite hiện tại và KHÔNG được tạo trong Phase 1 của plan này — thay vào đó Phase 1 pins `colSpan={3}` + array header bằng source-text contract test (verified: apps/e2e specs không assert cấu trúc bảng Buổi học). Khi SessionActionsModal được implement ở plan server-side, tạo e2e structural assertion tại đó.

## Overview

Khóa chặt hành vi bằng test: unit cho helper targeting (đặc biệt sequential-head gate + behind-head mapping), contract pins cho non-goals (mirror source-text contract style của repo), e2e Playwright cho flow hủy buổi (kể cả buổi **tương lai** — entry gate mới) và bảng 3 cột. Verify supersession note 2 chiều (đã thêm ở plan-time).

## Requirements

- Functional:
  - Unit tests `sessionActionTargets` (tests-first, viết ở đầu phase 2):
    1. 1:1 một target (sid upcoming tại slotIndex).
    2. Group N sids → N targets, đúng 1 id/sid.
    3. **Sid đã settled (completed/cancelled) tại occurrence này → EXCLUDE** (red-team F1 regression case).
    4. **Behind-head sid** (completed < slotIndex - 1) → target có `targetSlotIndex = completed + cancelled + 1 < slotIndex` (bù buổi trễ).
    5. Tất cả sid settled → mảng rỗng (không nút "Điều chỉnh").
    6. Slot-bag nhiều occurrence — id luôn là row upcoming theo id-sort ổn định.
  - Unit test bucket mapping của `runSessionBatch` (mock `dispatch` trả 4 kind khác nhau) — đếm ok/stale/unknown/failed đúng, unknown kích hoạt refresh.
  - Contract tests: negative assertion cột Học viên (cả hai thead); modal không field edit; `data-actions.ts` không action type mới; modal không import/call `useDirectKernelAction`; regex #91 vẫn match.
  - E2E (`apps/e2e/specs/class-operations.spec.ts`):
    - Bảng 3 cột: main header không chứa "Học viên".
    - **Hủy buổi TƯƠNG LAI** (buổi tuần sau — entry gate mới cho phép) → confirm → badge "Đã hủy" sau refetch → reload giữ trạng thái.
    - Hoàn thành buổi (buổi hôm nay/quá khứ) → badge "Đã học".
    - Behind-head scenario (manual QA checklist nếu fixture e2e quá phức tạp: 1 sid trễ 1 buổi — confirm hiển thị nhóm "bù buổi trễ" với ngày đích đúng).
- Non-functional: gates root `pnpm check`, `pnpm test`, `pnpm check-types`; e2e theo setup hiện có `apps/e2e`.

## Architecture

Không thêm abstraction. vitest unit/contract colocated src + Playwright spec mở rộng spec M1 hiện có.

## Related Code Files

- Modify: `apps/web/src/lib/class-sessions.test.ts` (describe `sessionActionTargets`, 6 cases)
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` (verify negative assertion phase 1)
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` (verify pins phase 2)
- Modify: `apps/e2e/specs/class-operations.spec.ts` (2 scenario mới + assertion 3 cột)
- Modify: `apps/e2e/specs/helpers.ts` (helper mở actions modal nếu cần)
- Delete: không

## Implementation Steps

1. Unit tests `sessionActionTargets` (6 cases ở Requirements) — fixture reuse của `sessionStudents`/`firstUpcomingLessonId` tests hiện có (class-sessions.test.ts:145, 200–201, 433–465).
2. Unit test `runSessionBatch` bucket mapping (mock dispatch 4 kind; assert unknown → refresh called).
3. Rà contract tests: chạy từng file, xác nhận mọi pin từ phase 1–2 hiện diện và pass.
4. E2E scenario "session actions modal": theo pattern spec M1 (dòng 23–90) + `openClassScheduleTab` (helpers.ts:24–29). Lớp fixture: startDate quá khứ để có buổi eligible + buổi tương lai trong timeline. KHÔNG thao tác trên buổi mà spec M1 assert (12 badge "Sắp tới", spec:59) — tách test riêng với lớp riêng nếu xung đột.
5. E2E assertion bảng 3 cột (header row không chứa text "Học viên").
6. Manual QA checklist behind-head (ghi vào PR description).
7. Chạy full gates từ root: `pnpm check && pnpm test && pnpm check-types` + e2e local.
8. Verify supersession note 2 chiều hiện diện: `plans/260826-1611-.../phase-03-*.md` có blockquote trỏ về plan dir này; plan.md này có section Cross-Plan Supersession (đã thêm ở plan-time — chỉ verify).

## Success Criteria

- [ ] 6 unit cases `sessionActionTargets` pass (đặc biệt case 3 exclude settled + case 4 behind-head mapping).
- [ ] Bucket mapping test pass; unknown kích hoạt refresh.
- [ ] Contract pins xanh: không cột Học viên, modal không field edit, không action mới, hook/edge pins giữ.
- [ ] E2E hủy buổi tương lai + hoàn thành buổi pass local; badge flip + persist qua reload; bảng 3 cột.
- [ ] Manual QA checklist behind-head có trong PR description.
- [ ] Gates xanh.
- [ ] Supersession note 2 chiều hiện diện (verify).

## Risk Assessment

**Risk 1 (MEDIUM): E2e flaky vì date gate VN** (Hoàn thành chỉ eligible khi `dateISO <= today`).
- Signal: e2e fail lúc đầu ngày theo giờ máy chạy CI.
- Response: fixture dùng buổi quá khứ (startDate hôm qua); buổi tương lai cho scenario hủy; không mock clock toàn cục.

**Risk 2 (LOW): Spec M1 hiện có phụ thuộc 12 badge "Sắp tới".**
- Signal: spec M1 fail sau phase 1–2.
- Response: scenario mới dùng lớp fixture riêng, không đụng buổi M1 assert; pattern isolation per-test hiện có.

**Risk 3 (LOW): Fixture behind-head khó dựng thuần e2e.**
- Signal: e2e behind-head phức tạp/fragile (cần check-in chọn lọc trước).
- Response: chấp nhận manual QA checklist (đã declare); unit test case 4 vẫn khóa mapping logic.
