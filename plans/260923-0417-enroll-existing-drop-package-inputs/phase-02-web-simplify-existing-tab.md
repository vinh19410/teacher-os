---
title: "Phase 2: Web — dọn tab 'Học viên có sẵn'"
status: todo
---

# Phase 2: Web — dọn tab "Học viên có sẵn"

## Overview

- **Priority**: P1
- **Status**: pending
- Phụ thuộc Phase 1 (server không còn đọc `total/price/mode`). Phase này dọn sạch phía web: tab "Học viên có sẵn" chỉ còn ô **"Tìm học viên"** (đã có sẵn, dòng 272–278 — lọc theo tên/SĐT tại `filteredStudents` dòng 111–115) + listbox chọn học viên (dòng 279–309) + nút Lưu.

**Key insights**:

- Search/filter đã tồn tại trong modal — yêu cầu "có search/filter để dễ chọn đúng học viên" đã đáp ứng, không viết component mới.
- Chuỗi dispatch: modal → `useKernelFormSubmit().run({type: "enroll-student", ...})` → `kernelCommand()` (`apps/web/src/lib/repos/kernel.ts:52-62`) → POST body — cần dọn đồng loạt 3 tầng + reducer mirror.

## Requirements

- [ ] Tab "Học viên có sẵn" không còn render "Số buổi gói", "Đơn giá (VND)", "Hình thức".
- [ ] Action `enroll-student` không còn mang `payload`; POST body chỉ `{studentId}`.
- [ ] Reducer mirror gói từ lớp trong store (không còn đọc `action.payload`).
- [ ] Không command nào tới `/enroll` còn chứa `total/price/mode`.

## Implementation Steps

1. `apps/web/src/components/modals/add-student-modal.tsx`:
   - Xoá block `enrollPackageFields` (dòng 203–238) và dòng render `{enrollPackageFields}` (dòng 310).
   - Xoá state: `total`, `price`, `modeOnlineOffline` (dòng 53–57), `totalError`, `priceError` (dòng 60–61). Dọn `resetFields` (dòng 91–98) và `switchMode` (dòng 101–109, gồm comment lỗi thời "packageFields renders in both modes").
   - Nhánh submit `existing` (dòng 122–155): bỏ toàn bộ parse + set error của gói (dòng 124–139, kèm comment "Issue #115: package validation belongs to enroll mode"); gọi `run({ type: "enroll-student", classId: classId ?? "", studentId: selectedStudentId })` — không còn field `payload`.
   - Xoá helper `parsePackageField` (dòng 21–25) cùng comment issue #115; dọn import thừa (`CurrencyInput`, `parseVndAmount`, `Select` — grep lần cuối trong file trước khi xoá).
   - **Giữ nguyên**: nút chuyển tab, Field "Tìm học viên", listbox "Danh sách học viên có sẵn".
2. `apps/web/src/lib/data-actions.ts` (dòng 83–93): variant `enroll-student` bỏ field `payload`; cập nhật comment (gói do server derive từ lớp — D1).
3. `apps/web/src/lib/repos/kernel.ts` (dòng 52–62): case `enroll-student` trả `body: { studentId: action.studentId }`.
4. `apps/web/src/lib/data-store-reducer.ts` (dòng 127–161): case `enroll-student` mirror `pkg` từ lớp trong store — tìm `cls` theo `action.classId`, set `pkg: { total: cls.sessionsTotal, done: 0, remaining: cls.sessionsTotal, price: cls.tuitionFee ?? 0, mode: cls.mode, ... }`; nếu không tìm thấy lớp thì vẫn gắn `studentIds` nhưng bỏ qua pkg (truth cuối cùng đến từ kernel snapshot refresh). Cập nhật comment issue #122.
5. Tests web:
   - `apps/web/src/lib/data-store-reducer.test.ts` (dòng 531–590): bỏ `enrollPayload`; 3 test dispatch không `payload`; expectation `pkg` theo fixture lớp được gắn (đọc fixture đầu describe để lấy `sessionsTotal/tuitionFee/mode`).
   - `apps/web/src/lib/repos/kernel.test.ts` (dòng 343–350): assert body `{studentId}` (bớt `total/price/mode`).
   - `apps/web/src/lib/add-student-enroll.contract.test.ts`: đang chỉ parse payload của `add-student` — chạy lại là đủ; khuyến khích thêm 1 assertion khoá hành vi: source modal **không còn** chuỗi "Số buổi gói".

## Todo

- [ ] Modal: xoá `enrollPackageFields` + states + validation + helper, dọn import
- [ ] `data-actions.ts` + `repos/kernel.ts`: bỏ payload/body gói
- [ ] Reducer: mirror pkg từ lớp
- [ ] Cập nhật 3 file test web
- [ ] `pnpm --filter web test` xanh

## Success Criteria

- `pnpm --filter web test` xanh; `pnpm check-types`, `pnpm check` sạch.
- `grep -rn "total\|price\|mode" apps/web/src/lib/repos/kernel.ts` không còn trong case `enroll-student`.

## Risk

- `Select`/`CurrencyInput` còn được dùng ở tab "Tạo học viên mới"? — kiểm tra trước khi xoá import (hiện `Select` chỉ xuất hiện trong `enrollPackageFields`; `CurrencyInput` tương tự).
- Contract test source-parse (`add-student-enroll.contract.test.ts`) nhạy cảm với shape dispatch — chỉ đụng nhánh `add-student`, rủi ro thấp.
