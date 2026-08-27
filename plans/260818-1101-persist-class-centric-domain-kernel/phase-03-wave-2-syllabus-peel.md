---
phase: 3
title: "Wave 2 Syllabus peel"
status: completed
priority: P1
effort: "0.5-1d"
dependencies: [1]
# Blocked by Wave 0 only. Not blocked by Wave 1. Rebase sau wave 1 merge (cùng đụng repos/kernel.ts — PR #20 đã merge).
---

# Phase 3: Wave 2 Syllabus peel

## Overview

Tháo bề mặt ĐỌC của module syllabus theo pattern wave 1 (PR #20): mapping kernel→display chuyển từ `repos/kernel.ts` sang repo riêng `repos/syllabus.ts`, syllabus routes đọc qua hook `use-syllabus`. **Không bảng mới. Không đổi contract kernel. Không đổi write path.** Ghi chú red-team 2026-08-19: seed đọc đã chết từ wave 0 (`seedData` = 0 import runtime; provider hydrate `GET /api/kernel`) — việc còn lại là peel read + tách mapping, KHÔNG phải "ngừng đọc seed" hay rewire write.
<!-- Updated: Red Team Session 2026-08-19 - stale premise removed; scope = read peel mirroring wave 1 -->

## Context Links

- Routes: `apps/web/src/routes/_auth/syllabus/index.tsx`, `$syllabusId.tsx`
- Modals (write GIỮ NGUYÊN — pinned `kernel-runtime.contract.test.ts:51-66`): `add-syllabus-modal.tsx`, `add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`
- Pattern precedent (law cho wave này): `repos/students.ts` + `repos/use-students.ts` + `students-peel.contract.test.ts` + `repos/students.test.ts` (wave 1, PR #20)
- Invariant 5: `syllabus_lesson` ≠ `lesson` lịch
- `class.syllabusId` FK đã có từ kernel; assign peel ở wave 3

## Requirements

- Functional: CRUD = create + read + in-place update của syllabus / module / syllabus_lesson qua endpoint wave 0 đã mount. Không có delete hay syllabus-rename (không endpoint, không UI) — out of scope, ghi rõ thay vì hứa "CRUD" đầy đủ.
- Non-functional: `totalLessons` derive trong mapping `mapSyllabi` từ số lesson giáo trình (khớp reducer `recomputeTotalLessons`). KHÔNG đổi server/contract: stored column là dead data, pin bởi `kernel.test.ts:161` ("ignoring the stored value"); lệch chữ "server-side" trong issue #12 là text viết trước wave 0 — deviation này phải ghi lại lên issue. Không gộp id với lịch. Không sửa student/tuition/classes routes.

## Architecture

Mirror wave 1 chính xác: `repos/syllabus.ts` = pure mapping `mapSyllabi(snapshot): Syllabus[]` (tách từ `kernel.ts`; adapter reuse — không duplicate). `repos/use-syllabus.ts` = read hook trên store cache (`useData()`) — command-bus writes land ngay, KHÔNG fetch path thứ 2. Syllabus routes ngừng đọc `data.syllabi` trực tiếp; được giữ `data.classes` (collection chưa peel) cho badge "Đã gán" — giống wave 1 detail giữ `data.lessons`. Store slice `syllabi` vẫn populate đến wave 3+ (classes routes, `add-class-modal.tsx`, `assign-syllabus-modal.tsx` còn đọc). `AssignSyllabusModal` mount ở CẢ syllabus detail lẫn `classes/$classId.tsx` — giữ nguyên cả hai.
<!-- Updated: Red Team Session 2026-08-19 - dual-path desync closed (hook over store cache); AssignSyllabusModal both mounts named -->

## Related Code Files

- Create: `apps/web/src/lib/repos/syllabus.ts`, `apps/web/src/lib/repos/use-syllabus.ts`, `apps/web/src/lib/repos/syllabus.test.ts`, `apps/web/src/lib/syllabus-peel.contract.test.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts` (reuse `mapSyllabi`), `apps/web/src/routes/_auth/syllabus/index.tsx`, `$syllabusId.tsx` (đọc), `apps/server/src/kernel.test.ts` (thêm cross-org nested write tests)
- Do not modify write: 5 modal giáo trình + `assign-syllabus-modal.tsx` (command bus W0)
- Do not modify: `classes/*`, `add-class-modal.tsx`, `students/*`, `tuition.tsx`, `schedule.tsx`, `packages/api/**`, `apps/server/src/routes/**`
<!-- Updated: Red Team Session 2026-08-19 - write guard + classes consumers protected; server routes frozen -->

## Implementation Steps

1. Tách `mapSyllabi` từ `repos/kernel.ts` sang `repos/syllabus.ts`; adapter đổi thành `syllabi: mapSyllabi(snapshot)`.
2. `use-syllabus.ts` hook: `syllabi` + `syllabusById(id)` từ store cache.
3. Syllabus routes đọc qua hook; bỏ read `data.syllabi` trực tiếp (giữ `data.classes`).
4. `totalLessons` derive trong mapping (hành vi hiện tại `repos/kernel.ts` — giữ nguyên, không đụng server).
5. Cross-org isolation tests server: org B write module/lesson dưới syllabus/module của org A → 404, tree org A unchanged.
6. Org mới: list rỗng (đã đúng từ wave 0 qua `emptyData` — verify bằng test, không thêm code).

## Todo

- [x] Repo syllabus (`mapSyllabi`) + adapter reuse, mapping unit tests
- [x] `use-syllabus` hook + routes đọc hook (0 read `data.syllabi` trên syllabus routes)
- [x] Contract test syllabus peel (mirror `students-peel.contract.test.ts`)
- [x] Cross-org nested write tests (server `kernel.test.ts`)
- [x] totalLessons derive trong mapping — không đổi server
- [x] Không đụng bảng `lesson` lịch (chưa tồn tại), không đổi write path 5 modal

## Success Criteria

- [x] Syllabus peel contract test xanh: routes đọc qua hook, adapter reuse mapping, repo reads-only
- [x] Reload giữ cây giáo trình
- [x] Cross-org nested module/lesson writes → 404 (server test)
- [x] Characterization reducer syllabus vẫn dùng fixture
- [x] Quality gate xanh (`pnpm test && pnpm check-types && pnpm run check`)
<!-- Updated: Red Team Session 2026-08-19 - criteria falsifiable (contract test thay cho "0 đọc seed" không kiểm chứng được) -->

## Risk Assessment

`add-lesson` trên syllabus dễ nhầm với lịch. Signal: ai đó tạo bảng `lesson` sớm. Response: dừng, không merge; lịch là wave 4.
Risk red-team 2026-08-19: (1) rewire write path modal → dính contract pin `kernel-runtime.contract.test.ts` → response: không đụng write; (2) tạo fetch path thứ 2 → desync với store → response: hook đọc store cache, cấm dual-write POST+dispatch.

## Security Considerations

Mọi write syllabus kiểm tra `syllabus.orgId` (đã có wave 0: `findSyllabus`/`findModule` join org, client id không được tin). Nested module/lesson không vượt syllabus khác org — khoá bằng regression test cross-org trong `apps/server/src/kernel.test.ts` (chưa có — thêm ở wave này). Ghi nhận follow-up (out of scope, surface wave 0): các write endpoint chưa có bound độ dài input (không `.max()` trong contract, không bodyLimit) — không sửa trong wave 2 vì lock "không đổi contract kernel".
<!-- Updated: Red Team Session 2026-08-19 - isolation tests mandated; unbounded-input recorded as follow-up -->

## Red Team Dispositions (2026-08-19, scoped phase-03)

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| 1 | Premise stale — peel đã xong ở wave 0; "ngừng đọc seed" là no-op | Critical | Accept: rewrite scope = read peel pattern wave 1 |
| 2 | "totalLessons server-side" tự mâu thuẫn contract lock + pinned test | Critical | Accept: derive trong `mapSyllabi`, không đụng server; ghi deviation lên issue #12 |
| 3 | `repos/syllabus.ts` không định nghĩa trách nhiệm → dual path desync | High | Accept: hook trên store cache, cấm fetch thứ 2 |
| 4 | Rewire modal write → fail contract pin | High | Accept: guard "do not modify write" |
| 5 | "CRUD" không deliver được (không delete/rename endpoint) | Medium | Accept: restatement create+read+update |
| 6 | Thiếu test cross-org nested write | Medium | Accept: thêm server tests |
| 7 | Serial conflict `repos/kernel.ts` wave1∥wave2 | Medium | Resolved: wave 1 merged PR #20, wave 2 rebase trên top |
| 8 | Không có GET /syllabi/:id; GET /syllabi = full snapshot | Medium | Resolved by pattern: reads qua store hook, không thêm endpoint |
| 9 | Input không bound trên 6 write endpoints | Medium | Reject (out of scope wave 2 — surface wave 0; ghi follow-up) |
| 10 | PageHead lead hardcoded "3 giáo trình · 37 buổi" | Medium | Reject: wave 1 precedent giữ hardcoded lead; wave-8 copy lock |
| 11 | AssignSyllabusModal 2 mount points + class consumers không được bảo vệ | Medium | Accept: mở rộng do-not-modify list |
