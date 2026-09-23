---
phase: 2
title: "Xoá create path: contract, server, UI, server tests"
status: todo
priority: P1
effort: 5h
dependencies: [1]
---

# Phase 2: Xoá create path: contract, server, UI, server tests

## Context Links

- Decision nguồn: `plan.md` D4, D5 (deploy cùng phase 1)
- Route create bị xoá: `apps/server/src/routes/kernel.ts:531-588` (sau merge #253: nhánh classId chỉ tạo enrollment `invited`, KHÔNG còn sinh package/lessons — phần đó chuyển sang accept; nhánh không lớp chỉ insert student)
- Contract bị xoá: `packages/api/src/contracts.ts:9-18` (`studentCreateSchema` + `StudentCreate`); consumer ứng dụng duy nhất = `kernel.ts:25,534` (verified qua Contract Verifier)
- UI: `apps/web/src/routes/_auth/students/index.tsx:62,64-77,134`; `add-student-modal.tsx` (ModalMode `:12`, mode-switch `:156-176`, create fields `:215-263`); importer thứ 2 `classes/$classId.tsx:17,408` (còn key `:407`)
- Server test helper: `addStudent` = API helper POST vào route bị xoá — `kernel.test.ts:285-305`; `addActiveStudent` (:307-330) bọc nó + gọi accept (endpoint accept CÒN SỐNG từ #253 — không sửa). Call sites: grep `-n "api/students" apps/server/src/*.test.ts` (thời điểm viết: kernel.test.ts nhiều nơi + `kernel-occurrence.test.ts:145,354`, `lesson-date-integration.test.ts:109`)

## Overview

**Priority:** P1 · **Status:** todo · Gỡ hoàn toàn đường tạo học viên thủ công theo D4 — cả 4 tầng contract-first (Zod schema → server route → web command/reducer → UI) VÀ toàn bộ test machinery phụ thuộc route đó. Giữ nguyên `GET /students`, enroll-existing, dữ liệu legacy. Modal còn đúng 1 mục đích (enroll học viên có sẵn vào lớp) nên đổi tên cho đúng ngữ nghĩa.

## Key Insights

- `POST /classes/:id/enroll` (`kernel.ts:592-650`) và `enrollStudentSchema` (`contracts.ts:25-28`) là đường enroll duy nhất còn lại — KHÔNG đụng.
- `addStudent` trong `kernel.test.ts` KHÔNG phải DB-seed: nó POST `/api/students` và assert 201 — sau khi route biến mất, ~33 call sites qua 3 file test sẽ đỏ hàng loạt nếu chỉ "giữ nguyên" như bản plan đầu (red-team #5). Phải rewrite thành direct-drizzle seed tái tạo đúng behavior cũ (student + enrollment + package + lessons khi có classId).
- `data-store-reducer.ts:86-126` case `add-student` xử lý cả nhánh tạo-kèm-lớp — xoá cả case; case `enroll-student` (`:127-160`) giữ.
- Chuỗi "add-student" còn tồn tại ở 2 chỗ ngoài action chính: comment `use-classes.ts:4` ("enroll-via-add-student") và key `key={`add-student-${cls.id}`}` ở `$classId.tsx:407` — phải xử lý để grep gate đạt (red-team #10).
- `AddStudentModal` có đúng 2 importer (verified); sau khi students page bỏ modal, rename chỉ chạm 1 importer.
- PDR dòng 23 ("A student is created with a required email...") là durable decision trở thành false — docs là nguồn conventions cho AI collaborator nên phải thay.

## Requirements

- [ ] `POST /api/students` → 404; `studentCreateSchema`/`StudentCreate` xoá khỏi contracts
- [ ] Web không còn action `add-student` (command map, data-actions, reducer, UI, comment, key)
- [ ] `/students` mất nút "+ Thêm học viên"; empty state ghi nguồn học viên mới (đăng nhập portal)
- [ ] Modal enroll-only: rename `AddStudentModal` → `EnrollStudentModal` (file `enroll-student-modal.tsx`)
- [ ] Server tests xanh: `addStudent` thành DB-seed helper; guard-test probe đổi endpoint
- [ ] PDR + docs không còn mô tả teacher tạo học viên

## Implementation Steps

1. `packages/api/src/contracts.ts`: xoá `studentCreateSchema` + `export type StudentCreate` (L9-18). Chạy `pnpm check-types` ngay để compiler chỉ điểm mọi consumer còn sót.
2. `apps/server/src/routes/kernel.ts`: xoá route `kernel.post("/students", ...)` (L531-588) cùng import `studentCreateSchema`; giữ `kernel.get("/students")` (L524-529) và route enroll (L592-650). Cập nhật comment "Issue #122: enroll an EXISTING student..." — đây là đường DUY NHẤT đưa học viên vào lớp; học viên có nguồn từ portal provisioning (phase 1).
3. `apps/web/src/lib/repos/kernel.ts`: xoá mapping command `add-student` → `POST /api/students` (L39-51); giữ `enroll-student` (L52-59).
4. `apps/web/src/lib/data-actions.ts`: xoá action creator `add-student` (L74) và type liên quan.
5. `apps/web/src/lib/data-store-reducer.ts`: xoá case `add-student` (L86-126).
6. `apps/web/src/components/modals/add-student-modal.tsx` → `git mv` thành `enroll-student-modal.tsx`, component `EnrollStudentModal`:
   - Xoá `ModalMode`, state mode, 2 nút chuyển mode "Học viên có sẵn"/"Tạo học viên mới" (L156-176), toàn bộ form create (Họ tên/SĐT/Email/Phụ huynh + validation) và dispatch create.
   - Giữ: prop `classId` (giờ bắt buộc), listbox picker `eligibleStudents` (L43-49, L177-217), dispatch `enroll-student`, empty-state của picker (không còn học viên chưa enroll).
7. `apps/web/src/routes/_auth/classes/$classId.tsx`: đổi import/mount (L17, L408) sang `EnrollStudentModal`; đổi key modal `add-student-${cls.id}` (L407) thành `enroll-student-...`; label nút mở modal thành "Thêm học viên vào lớp".
8. `apps/web/src/routes/_auth/students/index.tsx`: xoá Button "+ Thêm học viên" (L62), state `modalOpen`, mount modal (L134); viết lại empty state (L64-77, giữ `data-testid="students-empty-state"`): học viên tự xuất hiện khi đăng nhập student portal lần đầu, teacher thêm vào lớp từ trang lớp.
9. `apps/web/src/lib/repos/use-classes.ts:4`: sửa comment "enroll-via-add-student" → "enroll-student".
10. Server tests (red-team #5):
    - `kernel.test.ts`: rewrite `addStudent` (L285-305) thành **direct-drizzle seed** giữ nguyên chữ ký — mirror behavior HIỆN HÀNH của route (sau #253): insert student; nếu có `classId` → chỉ insert enrollment `status: "invited"`, KHÔNG sinh package/lessons (đã chuyển sang accept). Không đụng `addActiveStudent` (:307-330) — nó bọc `addStudent` + gọi accept (còn sống) nên tự hoạt động lại bình thường. Grep `-n "api/students"` để bắt hết call sites còn sót (probe của các guard test — describe "kernel origin + content-type guards" :1505 và các test guards rải trong file) và đổi sang endpoint khác (`POST /api/classes`).
    - `kernel-occurrence.test.ts:145,354` + `lesson-date-integration.test.ts:109`: gọi chung helper mới (không đổi logic test).
    - Thêm test assert `POST /api/students` → 404 và `GET /api/students` → 200.
11. Web tests: `add-student-enroll.contract.test.ts` (bỏ phần add-student, giữ enroll; đổi tên file `enroll-student.contract.test.ts`), `data-store-reducer.test.ts` (bỏ case add-student), `repos/kernel.test.ts` (bỏ mapping), `kernel-runtime.contract.test.ts` (bỏ tham chiếu AddStudentModal/source-string). KHÔNG sửa `repos/kernel-command.test.ts` (không tham chiếu add-student — red-team #9).
12. Docs: `docs/project-overview-pdr.md` dòng 23 → durable decision mới ("students originate from portal provisioning on first portal login; teachers only enroll existing students"); sweep `docs/codebase-summary.md`, `docs/system-architecture.md` bỏ mô tả POST /students. KHÔNG sửa plan cũ trong `plans/`.

## Verification

- `grep -rn "studentCreateSchema\|add-student\|AddStudentModal" apps/*/src packages/*/src docs` → 0 hit (source-only; `packages/api/dist/` là build artifact bỏ qua — red-team #10)
- Test assert `POST /api/students` → 404; `GET /api/students` → 200 (bước 10)
- `pnpm check` + `pnpm check-types` + `pnpm test` xanh (gồm cả 3 file server test đã rewrite)
- E2E đỏ tạm thời (12 spec vẫn gọi `createStudentViaUi`) — phase 3 xử lý; phase 1+2+3 trong cùng PR nên main không bao giờ đỏ

## Risk Assessment

- **Sót reference kiểu `StudentCreate`** → chặn bằng `pnpm check-types` ngay bước 1 (xoá contract trước, compiler chỉ điểm phần còn lại).
- **Rewrite `addStudent` lệch behavior** → mirror đúng route hiện hành (student + invited enrollment khi có classId; package/lessons là việc của accept — không thuộc helper). lesson-date-integration.test.ts vẫn là canh bạc: nó chạy helper + accept nên sai lệch seeding sẽ vỡ ngay.
- **Reducer mất case làm optimistic state lệch** → không còn caller tạo row client-side nên snapshot là nguồn sự thật; enroll-student giữ behavior cũ.
- **Deploy tách phase 1 khỏi phase 2** → POST /students còn sống chèn email case-variant/raw trùng → 500 hoặc ambiguous vĩnh viễn. Mitigation: phases 1-3 cùng PR (đã ghi D5).

## Security Considerations

- Xoá route = đóng hẳn API create: không ai (kể cả teacher có session) chèn được student row với email tùy ý — email chỉ đến từ provisioning đã verified (phase 1). Đây là mục đích bảo mật chính của plan.
- Không thay đổi authz các route còn lại.
