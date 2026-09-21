---
phase: 3
title: "Web UI: tạo lớp + sửa học phí"
status: done
priority: P1
effort: 3h
dependencies: [2]
---

# Phase 3: Web UI: tạo lớp + sửa học phí

## Goal

Người dùng nhập học phí optional khi tạo lớp (AddClassModal), thấy học phí ở trang chi tiết lớp, và sửa/xóa được qua modal mới — tất cả qua command bus hiện có, không F5.

## Context Links

- `apps/web/src/components/modals/add-class-modal.tsx` — form tạo lớp (fields 158-246, submit 85-142)
- `apps/web/src/components/modals/add-invoice-modal.tsx:10-12,153-160` — pattern input tiền: `<Input type="number">` + regex `/^\d{1,12}$/`
- `apps/web/src/lib/repos/kernel.ts:65-69,355` — `kernelCommand` map action→endpoint + `postKernelCommand`
- `apps/web/src/lib/data-actions.ts:218` — `update-class-notes`: pattern action update
- `apps/web/src/lib/use-kernel-form-submit.ts` — hook submit form (`run`, `saving`, reset khi `refreshed`)
- `apps/web/src/routes/_auth/classes/$classId.tsx` — trang chi tiết lớp (header meta + tab roster)
- `apps/web/src/lib/mock-data.ts:145-161,240` — `ClassGroup`, `fmtVND`
- `apps/web/src/lib/repos/classes.ts:24-66` — `mapClasses`

## Files to Create / Modify

- Modify: `apps/web/src/lib/mock-data.ts` — `ClassGroup.tuitionFee: number | null`
- Modify: `apps/web/src/lib/repos/classes.ts` — `mapClasses` map field mới
- Modify: `apps/web/src/lib/data-actions.ts` — action `update-class-tuition-fee`
- Modify: `apps/web/src/lib/repos/kernel.ts` — `kernelCommand` case `add-class` + case mới
- Create: `apps/web/src/components/modals/edit-class-fee-modal.tsx` — modal sửa/xóa học phí
- Modify: `apps/web/src/components/modals/add-class-modal.tsx` — field học phí optional
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — hiển thị học phí + nút mở modal sửa
- Modify: `apps/web/src/lib/repos/classes.test.ts`, `apps/web/src/lib/repos/kernel.test.ts` — unit tests

## Implementation Steps

1. Types & mapping (làm trước để typecheck dẫn đường):
	- `ClassGroup` thêm `tuitionFee: number | null;`
	- `mapClasses`: `tuitionFee: row.tuitionFee ?? null`.
	- `data-actions.ts`: thêm union member `update-class-tuition-fee` với payload `{ classId: string; tuitionFee: number | null }` — mirror shape của `update-class-notes`.

2. `kernelCommand` (repos/kernel.ts):
	- Case `add-class` (65-69): forward `tuitionFee` từ payload vào body (`payload.tuitionFee ?? null` — hợp lệ với contract `.nullish()`).
	- Case mới `update-class-tuition-fee` → `POST /api/classes/${classId}/tuition-fee`, body `{ tuitionFee }` (schema server `.strict()`: gửi ĐÚNG 1 field, không kèm gì khác).

3. `add-class-modal.tsx`:
	- Thêm state `fee` (string, khởi tạo `""`), field "Học phí / học viên (VND)" type number, placeholder "Không bắt buộc", min 1 — đặt sau "Tổng số buổi", trước "Ngày bắt đầu".
	- Validate trong `submit()`: nếu `fee !== ""` và không khớp `/^\d{1,12}$/` hoặc `Number(fee) < 1` → setError tiếng Việt ("Học phí phải là số nguyên dương"), mirror pattern add-invoice-modal.
	- Payload: `tuitionFee: fee === "" ? null : Number(fee)`.
	- Reset `fee` về `""` trong khối reset sau `refreshed`.

4. `edit-class-fee-modal.tsx` (mới — clone khung add-invoice-modal về dialog/state/save):
	- Props: `classId`, `current: number | null`, `open`, `onOpenChange`.
	- Input prefill `current ?? ""`; label "Học phí / học viên (VND)"; helper text "Để trống để xóa học phí".
	- Validate như bước 3 (trống = hợp lệ → `null`).
	- Submit `run({ type: "update-class-tuition-fee", payload: { classId, tuitionFee } })`; close+reset khi `result?.kind === "refreshed"`.

5. `classes/$classId.tsx`:
	- Ở khu meta header lớp (cạnh ngày bắt đầu/số buổi — giữ styling hiện có, KHÔNG thêm KPI/card mới): dòng "Học phí: {fee ? \`${fmtVND(fee)} / học viên\` : "—"}" kèm nút text/icon "Sửa" mở `EditClassFeeModal`.
	- State modal đặt ở component trang; truyền `classFee` từ `ClassGroup` của lớp đang mở.

6. Unit tests:
	- `repos/classes.test.ts`: fixture row có/không `tuitionFee` → map ra giá trị/`null`.
	- `repos/kernel.test.ts`: case `add-class` body chứa `tuitionFee`; case `update-class-tuition-fee` → đúng path + body 1 field (mirror style assert hiện có).

## Todo

- [x] `ClassGroup` + `mapClasses` + `data-actions` types
- [x] `kernelCommand`: forward add-class + case update-class-tuition-fee
- [x] AddClassModal: field optional + validate + payload + reset
- [x] `edit-class-fee-modal.tsx` mới (prefill, trống = xóa)
- [x] `$classId.tsx`: hiển thị "Học phí: Xđ / học viên | —" + nút Sửa
- [x] Unit tests 2 file xanh

## Verification

- `pnpm --filter web check-types && pnpm --filter web test` — exit 0
- `pnpm dev` thủ công: tạo lớp có fee → chi tiết lớp hiện đúng; sửa fee → flip ngay; xóa fee → "—"

## Risk Assessment

- Gửi thừa field vào body update → server `.strict()` trả 400; test kernelCommand chặn đúng format.
- Quên reset state `fee` sau submit thành công → mở lại modal còn giá trị cũ; kiểm cả 2 modal.

## Security Considerations

- Không đổi authz phía web; mọi quyền vẫn do server enforce (Phase 2).
- Input number chặn client-side chỉ là UX; server vẫn validate `min(1)`.

## Next Steps

- Phase 4: e2e phủ 3 luồng và chạy toàn bộ gate.
