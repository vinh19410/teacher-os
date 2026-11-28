---
title: "Phase 1: PaymentQrPanel & Student Tuition UI"
status: done
---

# Phase 1: PaymentQrPanel & Student Tuition UI

## Goal

Khôi phục hiển thị chuẩn design v2 Light/Dark cho các tile `"Còn lại"` / `hot` trong `apps/student` (`tuition-list.tsx` dùng trên `/student/tuition`, và `stat-card.tsx` đồng bộ token dù hiện chưa có caller), và ẩn tiêu đề `"Chuyển khoản theo QR dưới đây"` trong `PaymentQrPanel` khi không có QR (`paid`, `nolink`, hoặc thiếu `bank` kèm fallback `state = "nolink"`), theo đúng quy trình TDD.

## Files to Create or Modify

- Create: `packages/ui/src/components/payments/payment-qr-panel.test.tsx`
- Create: `apps/student/src/components/overview/tuition-list.test.tsx`
- Create: `apps/student/src/components/overview/stat-card.test.tsx`
- Modify: `packages/ui/src/components/payments/payment-qr-panel.tsx`
- Modify: `apps/web/src/components/ui/payment-qr-panel.test.tsx`
- Modify: `apps/web/src/components/modals/invoice-payment-modal.test.tsx`
- Modify: `apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx`
- Modify: `apps/student/src/components/overview/tuition-list.tsx`
- Modify: `apps/student/src/components/overview/stat-card.tsx`

## Tasks & Steps

### Task 1.1 — Viết unit test TDD (Red) cho `PaymentQrPanel`, `TuitionList` và `StatCard`
- **Goal:** Tạo/cập nhật unit test thất bại trước khi sửa code để khóa hành vi ẩn tiêu đề QR, fallback `nolink` khi thiếu `bank`, và thẻ light card `text-destructive`.
- **Target files and symbols:**
  - `packages/ui/src/components/payments/payment-qr-panel.test.tsx`
  - `apps/web/src/components/ui/payment-qr-panel.test.tsx`
  - `apps/student/src/components/overview/tuition-list.test.tsx` (`TuitionList`)
  - `apps/student/src/components/overview/stat-card.test.tsx` (`StatCard`)
- **Steps:**
  1. Tạo `packages/ui/src/components/payments/payment-qr-panel.test.tsx` dùng `renderToStaticMarkup` kiểm 5 case: `open` (`payable: true` + `bank`), `partial` (`paidAmount > 0` + `bank`), `paid` (`reason: "PAID"` → không chứa `"Chuyển khoản theo QR dưới đây"`), `nolink` (`reason: "NO_BANK_LINK"` → không chứa `"Chuyển khoản theo QR dưới đây"`), và `payable: true` thiếu `bank` (không chứa `"Chuyển khoản theo QR dưới đây"`, hiển thị `"Giáo viên chưa thiết lập nhận chuyển khoản"` thay vì khung rỗng).
  2. Cập nhật `apps/web/src/components/ui/payment-qr-panel.test.tsx` thêm assertion `.not.toContain("Chuyển khoản theo QR dưới đây")` ở case `PAID` và `NO_BANK_LINK`, cộng thêm case `payable: true` thiếu `bank` hiển thị `"Giáo viên chưa thiết lập nhận chuyển khoản"` và ẩn tiêu đề QR.
  3. Tạo `apps/student/src/components/overview/tuition-list.test.tsx` với dòng đầu `// @vitest-environment jsdom`, mock `@tanstack/react-router` `Link` như `class-card.test.tsx`, kiểm:
     - `TuitionList` còn nợ (`amountDue > 0`): tile `"Còn lại"` dùng `bg-card`, `border`, không dùng `bg-primary`, số tiền có `text-destructive` và `tabular-nums`, không có `text-primary`.
     - `TuitionList` đã đóng hết (`totalDue === 0`): tile `"Còn lại"` hiện `0đ` với `text-foreground`, không dùng `text-destructive` hay `bg-primary`.
  4. Tạo `apps/student/src/components/overview/stat-card.test.tsx` với dòng đầu `// @vitest-environment jsdom` kiểm:
     - `StatCard` (`hot` + `sub`): container dùng `bg-card` (không `bg-primary`), số dùng `text-destructive` (không `text-primary`), `sub` dùng `text-muted-foreground` (không `text-primary-foreground/80`).
     - `StatCard` (`hot={false}`): số dùng `text-foreground`.
- **Success criteria:** Các test mới chạy và FAIL đúng ở assertion tiêu đề QR / `nolink` fallback / class `bg-card` + `text-destructive`.
- **Verify:** `pnpm --filter @teacher-os/ui test src/components/payments/payment-qr-panel.test.tsx` và `pnpm --filter student test src/components/overview/tuition-list.test.tsx src/components/overview/stat-card.test.tsx` thoát khác 0 với lỗi assertion mong đợi (Red phase).

### Task 1.2 — Gate `{strings.title}` + `state` trong `PaymentQrPanel` và cập nhật 2 fixture `apps/web`
- **Goal:** Chỉ render `"Chuyển khoản theo QR dưới đây"` khi `data.payable && Boolean(data.bank)`, fallback `state = "nolink"` khi thiếu `bank`, và giữ 2 test characterization của `apps/web` phản ánh đúng hợp đồng server thật.
- **Target files and symbols:**
  - `packages/ui/src/components/payments/payment-qr-panel.tsx` (function `PaymentQrPanel`, lines 83-128)
  - `apps/web/src/components/modals/invoice-payment-modal.test.tsx` (`PaymentFixture`, `PAYABLE`, lines 20-39)
  - `apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx` (`PaymentFixture`, `PAYABLE_PAYMENT`, lines 110-129)
- **Steps:**
  1. Trong `PaymentQrPanel`, khai báo `const showQrInstructions = data.payable && Boolean(data.bank);` và tính `state`:
     ```ts
     const state =
       data.reason === "PAID"
         ? "paid"
         : !showQrInstructions
           ? "nolink"
           : data.paidAmount > 0
             ? "partial"
             : "open";
     ```
     (Giữ nguyên khi `data.payable === false && data.reason === "PAID"` là `"paid"`, khi `!data.payable` không phải `"PAID"` là `"nolink"`, và khi `data.payable === true` thiếu `bank` cũng fallback an toàn sang `"nolink"` thay vì render `div` rỗng.)
  2. Bọc `<p className="font-medium text-sm">{strings.title}</p>` trong `{showQrInstructions && (...)}` và dùng `showQrInstructions && data.bank` cho khối QR/bảng chi tiết.
  3. Thêm trường optional `bank?: { brandName: string; accountNumber: string; holderName: string }` vào `PaymentFixture` và thêm `bank: { brandName: "MBBank", accountNumber: "0123456789", holderName: "NGUYEN VAN A" }` vào `PAYABLE` (`invoice-payment-modal.test.tsx`) và `PAYABLE_PAYMENT` (`apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx`).
- **Success criteria:** `PaymentQrPanel` không in tiêu đề QR khi `paid`/`nolink`/thiếu `bank`; fallback `"Giáo viên chưa thiết lập nhận chuyển khoản"` khi thiếu `bank`; toàn bộ test `packages/ui` và `apps/web` pass.
- **Verify:** `pnpm --filter @teacher-os/ui test src/components/payments/payment-qr-panel.test.tsx && pnpm --filter web test src/components/ui/payment-qr-panel.test.tsx src/components/modals/invoice-payment-modal.test.tsx src/routes/_auth/tuition/\$invoiceId.test.tsx` exits 0.

### Task 1.3 — Chuẩn hoá `MiniStat` trong `TuitionList` và `StatCard` sang light card design v2
- **Goal:** Sửa lỗi mất chữ trên ô `hot` tại `tuition-list.tsx` và `stat-card.tsx`, dọn class trùng/mâu thuẫn, không tô đỏ `0đ`.
- **Target files and symbols:**
  - `apps/student/src/components/overview/tuition-list.tsx` (`MiniStat`, `TuitionList`)
  - `apps/student/src/components/overview/stat-card.tsx` (`StatCard` — lưu ý component hiện chưa có caller nhưng sửa đồng bộ)
- **Steps:**
  1. Trong `MiniStat` (`tuition-list.tsx`), đổi container thành `"rounded-xl border bg-card p-4 text-card-foreground shadow-sm"`, nhãn giữ `"font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]"`, số dùng `` `mt-2 break-words font-medium font-mono text-lg leading-none tabular-nums ${hot ? "text-destructive" : "text-foreground"}` ``.
  2. Trong `TuitionList` (`tuition-list.tsx`), đổi `<section>` thành `"self-start rounded-xl border bg-card p-6 shadow-sm"`, đổi dòng `MiniStat` `"Còn lại"` thành `<MiniStat label="Còn lại" value={fmtVnd(totalDue)} hot={totalDue > 0} />`, cập nhật comment lỗi thời.
  3. Trong `StatCard` (`stat-card.tsx`), đổi container thành `cn("rounded-xl border bg-card p-4 text-card-foreground shadow-sm", className)`, số dùng `cn("mt-2 font-extrabold text-2xl leading-none tracking-[-0.02em] tabular-nums", hot ? "text-destructive" : "text-foreground")`, `sub` dùng `"mt-1.5 text-[12px] text-muted-foreground"`, cập nhật JSDoc.
- **Success criteria:** Mọi test trong `tuition-list.test.tsx` và `stat-card.test.tsx` pass; không còn `bg-primary` hay `text-primary-foreground/80` trong 2 file này.
- **Verify:** `pnpm --filter student test src/components/overview/tuition-list.test.tsx src/components/overview/stat-card.test.tsx` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
