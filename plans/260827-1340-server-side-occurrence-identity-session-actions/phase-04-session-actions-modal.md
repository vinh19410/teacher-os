---
phase: 4
title: "SessionActionsModal + per-occurrence edit UI"
status: completed
priority: P1
effort: "1.5d"
dependencies: [3]
---

# Phase 4: SessionActionsModal + per-occurrence edit UI

## Overview

Triển khai tầng UI được DEFERRED từ #93 ở dạng GIẢM theo dated-identity: một modal "Điều chỉnh buổi" duy nhất gắn từng row của tab Buổi học (khi class v2), gồm (a) 2 bulk action Hoàn thành/Hủy = MỖI cái đúng MỘT call `sessions/:date/{check-in,cancel}` (thay fan-out loop N×POST), và (b) form per-occurrence edit (moveDate/time/dur/topic/zoom) gọi `sessions/:date/edit` — deliverable option 3 của requester. Pin C2/C3 behind-head XÓA; C1 thu gọn `{updated}/{skipped}/{reason}`; C4 giữ trọn vẹn; C5 giữ.

## Requirements

- Functional:
  - Entry: nút **"Điều chỉnh"** (label ≠ "Điểm danh") hiện trên row khi `sessionRowTargets(s).length > 0` — kể cả buổi TƯƠNG LAI (C5: không dùng `attendance.kind === "actionable"` làm entry gate); legacy-class row KHÔNG có nút (Known Limitation tiếp nối).
  - Modal header: ngày & giờ đầy đủ buổi (`formatSessionDate` + range), trạng thái aggregate hiện tại.
  - Section hành động: nút "Hoàn thành buổi" disabled khi `!sessionIsEligibleDate(s, todayISO)` (VN date gate qua ISO-compare như cũ :325-330); nút "Hủy buổi" luôn enabled.
  - Confirm Hủy (bất khả hồi): danh sách tên học viên sẽ bị hủy (tên via `studentById`, sid chưa-settled trong bucket), 2-step nội bộ (state, không window.confirm — vô hình Playwright); confirm Hoàn thành tương tự khi bucket > 1 sid (một sid → trực tiếp).
  - Form chỉnh sửa: prefill topic/zoom/time/dur/date từ bucket rows; save ≥1-field đổi mới POST edit; moveDate input `<input type="date">`; lỗi 409 date-occupied báo ngay trong modal (dùng HttpError.reason — lần ĐẦU TIÊN client diễn giải nguyên nhân).
  - **Targeting bằng identity không phải vị trí (red-team round-2 N4): selection/modal binding key theo `dateISO` string, KHÔNG numeric index trong mảng `sessions` — một moveDate thành công reorder chronology nên index vị trí trở thành con trỏ treo nhắm nhầm bucket khác. moveDate THÀNH CÔNG ⇒ đóng modal ngay (toast-only) hoặc remount với targets mới từ fresh snapshot; disable Hoàn thành/Hủy khi form đã dirty đổi identity.**
  - Partial result honesty: response `{updated, skipped}` với skipped>0 hiển thị note "x/y học viên (đã settled trước đó)" — **số liệu lấy từ `result.payload` do P2 envelope cung cấp (N2), KHÔNG tự đếm từ snapshot client-side (snapshot-derived count sai đúng lúc race đa tab — đúng case mà `{updated,skipped}` sinh ra để phân biệt).**
  - **409 guidance riêng (red-team round-2 N5): kernel-outcome/branch dành cho `reason: use-occurrence-endpoint` → message dẫn về nút "Điều chỉnh buổi" (KHÔNG rơi vào heal-409 copy chung "Dữ liệu đã được cập nhật trước đó" — sai ngữ nghĩa vì nothing-changed); ghi ràng buộc thứ tự: branch này CHỈ khả thi sau khi envelope P2 land (HttpError.reason mới tồn tại).**
- Non-functional (C4 nguyên văn):
  - Snapshot tên local chụp TRƯỚC call từ props/derive-once, không re-resolve giữa chừng.
  - Modal KHÓA đóng khi request đang chạy (precedent grade-modal.tsx:170); disable bằng cờ local instance; disable mọi nút trong modal.
  - ĐÚNG MỘT toast summary cuối mỗi action; CẤM đi qua `reportDirectOutcome` cho các call này.
  - Modal KHÔNG import `useDirectKernelAction`/`dispatch` — mọi call qua callback route-level thread xuống (contract #91 giữ nguyên chữ).

## Architecture

```tsx
// $classId.tsx — route-level callbacks (đối xứng runSessionBatch cũ nhưng 1-call);
// classId lấy từ route params ($classId), KHÔNG từ ClassSession shape
const completeSessionOccurrence = async (s: ClassSession) => {
  const result = await dispatch({ type: "session-check-in", classId, date: s.dateISO });
  // result.payload.updated/skipped từ envelope P2 (N2) → MỘT toast summary;
  // throw với HttpError.reason use-occurrence-endpoint → guidance riêng (N5)
};
```

Modal components file mỏng: info + list + 2 buttons + form state machine (idle→confirm→running→result). Data-action type mới đăng ký tại contracts (P2 schema đã có) — verify `data-actions.ts` chỉ thêm mapping KhÔNG logic mới. State selection giữ `selectedDateISO: string | null` (không `actionsIndex`) — render-time re-resolve bucket theo dateISO từ sessions hiện hành (N4).

Cell Trạng thái JSX: Fragment wrap giữ NGUYÊN cả 2 nhánh "Điểm danh", append nút Điều chỉnh phía sau (R4 pins).

## Related Code Files

- Create: `apps/web/src/components/class-detail/session-actions-modal.tsx` (+ unit helpers test nếu pattern tồn tại)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (callbacks + thread props)
- Modify: `apps/web/src/repos/kernel.ts` **`kernelCommand()` mapper ~:37** — đăng ký path/body cho 3 action type mới; không có bước này snippet dispatch không chạy được (red-team Medium #5)
- Modify: `apps/web/src/lib/data-actions.ts` (mapping action mới, zero logic)
- Modify: `apps/web/src/lib/kernel-outcome.ts` (reason-aware branch use-occurrence-endpoint — N5)
- Modify: `apps/web/src/components/class-detail/class-schedule-table.tsx` (nút + state `selectedDateISO` thế cho positional index — modalIndex hiện tại :77 là pattern attendance KHÔNG copy vì flow moveDate reorder mảng; N4)
- Modify: contract tests (kernel-runtime.contract.test.ts pins callback-threading + non-goal flip-update)

⚠️ Pin-file hygiene: literal chuỗi `session.rows` CẤM xuất hiện trong class-schedule-table.tsx / session-attendance-modal.tsx / $classId.tsx (regex pin #91 phủ 2 file đầu — red-team Medium #8).

## Implementation Steps

1. Tests-first contract: modal không-import-direct-action; pins #91 regex vẫn match sau restructure; pin entry-gate target-based.
2. KernelAction types + kernelCommand() mapper paths (`/classes/:id/sessions/:date/{edit,check-in,cancel}`) + data-actions mapping + inflight-key test mỗi action.
3. Route callbacks 3 hàm với toast-summary classification đọc `result.payload` (updated/skipped) + reason-aware branch cho `use-occurrence-endpoint` trong kernel-outcome (N5, phụ thuộc envelope P2 đã land) — unit-testable seam thuần.
4. SessionActionsModal UI theo spec; confirm-list derive-once; khóa-running; targeting dateISO-keyed (N4: close-on-move/remount); form prefill & 409-reason display.
5. Table integration: Fragment-wrap cell, append button, state `selectedDateISO` (dateISO-keyed targeting — N4).
6. Gates xanh (+ visual manual pass UAT check module tab Buổi học incl. legacy class regression không lộ nút).

## Success Criteria

- [x] Session v2 có target mở modal được kể cả future; badge-status kind không cản entry; completed-all-bucket row KHÔNG còn nút.
- [x] Hoàn thành disabled pre-date; Hủy cần confirm liệt-kê-tên; cả hai tạo ĐÚNG 1 network call + 1 refetch (contract test assert bus-inflight key semantics).
- [x] Toast MỘT lần/action; nội dung trung thực bucket counts ĐỌC TỪ payload P2 (test assert không đếm từ snapshot); failure reason surface gồm guidance riêng use-occurrence-endpoint.
- [x] Move thành công ⇒ modal đóng (hoặc remount targets mới); targeting dateISO-keyed — test assert modal sau-reorder không nhắm bucket khác (regression N4).
- [x] Form update occurrence k reflected tại row k instantly post-refetch (regression với bug gốc #93); moveDate collision hiển thị message riêng.
- [x] Regex pins #91/#93 tất cả still-match; non-goal field-edit pins #93 UPDATE có chủ đích để phản chiếu feature mới (supersession inline comment tham chiếu plan dir này).
- [x] Gates xanh toàn bộ.

## Risk Assessment

**R4 (MEDIUM) regex pins vỡ khi restructure JSX:** signal contract test đỏ sau step 5 — response cấu trúc Fragment + label-middleware như đã pin; assertions cập nhật cùng commit có dẫn-chứng diff.
**R14 (HIGH) Confirm-less bulk trên group class lớn:** user slip nhấn Hoàn thành entire class? — response: confirm bắt buộc KHI bucket>1 sid kể cả hoàn thành (chỉ single-sid 1:1 skip-confirm), disabled-state rõ ràng, Hủy luôn confirm 2-step.
**R15 (MEDIUM) Modal file phình:** response form-state machine nhỏ, styling tái dùng pattern existing modals; targeting/display helpers nằm lib.
