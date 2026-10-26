---
phase: 2
title: "Route /debts: 3 KPI, chip trạng thái, tìm kiếm debounce, lọc lớp, bảng học viên"
status: completed
priority: P1
effort: "5h"
dependencies: ["phase-01"]
---

# Phase 2: Route `/debts`, Sidebar, AppShell và Bảng công nợ học viên

## Goal
Xây dựng màn hình **Sổ công nợ học viên** (`/debts`) theo đúng wireframe `[4]` và hệ thống thiết kế `DESIGN.md` / `REVIEW.md`, tích hợp vào Sidebar nhóm "Kinh doanh", Breadcrumb `AppShell`, `routes-matcher`, và kiểm thử đầy đủ bằng component test + browser verification ở 3 viewport.

## Files to Create / Modify
- Create:
  - `apps/web/src/routes/_auth/debts/index.tsx` — route `/_auth/debts/` với `validateSearch: validateDebtsSearch`, 3 thẻ KPI (`data-testid="debt-kpis"`), thanh lọc (ô tìm kiếm debounce 300ms, `ChipFilter` trạng thái có `counts`, `Select` lớp, nút `"Xóa bộ lọc"`), vùng `aria-live="polite"`, `DataTable` học viên và `AddInvoiceModal`.
  - `apps/web/src/routes/_auth/debts/index.test.tsx` — component test trên `kernel-harness` + `router-mock`.
- Modify:
  - `apps/web/src/components/layout/sidebar.tsx` — thêm mục `{ key: "debts", label: "Công nợ", icon: ReceiptText, href: "/debts" }` ngay dưới `"Doanh thu"` trong nhóm `"Kinh doanh"` của `TEACHER_NAV`; thêm `"/debts": "debts"` vào `ACTIVE_KEY_BY_PREFIX` (tự động đưa `"Công nợ"` vào `⌘K` qua `search-index.ts`).
  - `apps/web/src/components/layout/sidebar.test.tsx` — thêm test cho mục `"Công nợ"` (`/debts`) trong `TEACHER_NAV` và `teacherActiveKey("/debts")`.
  - `apps/web/src/components/layout/app-shell.tsx` — thêm `"/_auth/debts/": ["Công nợ"]` và `"/_auth/debts": ["Công nợ"]` vào `ROUTE_CRUMBS`.
  - `apps/web/src/routes-matcher.ts` — thêm `"/debts": true` vào `VALID_EXACT_ROUTES`.
  - `apps/web/src/routes-matcher.test.ts` — thêm `"/debts"` vào `validStaticRoutes`.
  - `apps/web/src/routeTree.gen.ts` — sinh lại tự động qua Vite/TanStack Router plugin khi build/check-types.

## Bố cục & Hợp đồng UI (theo wireframe `[4]`, `DESIGN.md`, `REVIEW.md`)
- **`PageHead`**: `kicker="Học phí"`, `title="Sổ công nợ học viên"`, `action`: nút `<Button variant="outline" data-testid="create-invoice" onClick={() => setModalOpen(true)}>+ Tạo khoản thu</Button>` mở `AddInvoiceModal` (chừa sẵn khu vực flex gap-2 cho nút `"Gửi nhắc học phí (N)"` của TOS-18).
- **Hàng 3 `StatCard`** (`<div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="debt-kpis">`):
  1. `label="Tổng phải thu kỳ này"`, `num={fmtVND(kpis.receivable.amount)}`, `sub={`${kpis.receivable.students} học viên`}`
  2. `label="Tổng đã thu"`, `num={fmtVND(kpis.collected.amount)}`, `sub={`${kpis.collected.students} học viên`}`
  3. `label="Tổng còn nợ quá hạn"`, `num={fmtVND(kpis.overdue.amount)}`, `sub={`${kpis.overdue.students} học viên`}`, `hot={kpis.overdue.amount > 0}`
- **Thanh lọc**:
  - Ô tìm kiếm: `aria-label="Tìm học viên hoặc số điện thoại"`, `placeholder="Tìm học viên / SĐT"`, debounce 300ms đẩy `q` lên URL (`replace: true`).
  - `ChipFilter`: `ariaLabel="Lọc trạng thái công nợ"`, `options={["Tất cả", "Quá hạn", "Còn nợ / Sắp đến hạn ≤ 7 ngày", "Đã thu đủ"]}`, `counts` ánh xạ từ `ledger.counts` theo đúng nhãn tiếng Việt. Khi bấm chip, flush ngay `query` hiện tại vào URL.
  - `Select` lớp: `aria-label="Lọc theo lớp"`, option đầu `"Tất cả lớp"` (`value=""`) + danh sách `data.classes`. Khi đổi lớp, flush ngay `query` hiện tại vào URL.
  - Nút `"Xóa bộ lọc"` hiển thị khi có ít nhất 1 bộ lọc (`status`, `lop`, hoặc `query.trim()`).
  - Vùng `role="status" aria-live="polite"` thông báo số học viên đang hiển thị.
- **Bảng `DataTable`** (`data-testid="debt-ledger-table"`):
  - Cột: `["Học viên", "Lớp", "Phải đóng", "Đã thu", "Còn nợ", "Hạn đóng", "Thao tác"]`.
  - Mỗi dòng (`onClick` → `navigate({ to: "/students/$studentId", params: { studentId: row.studentId } })`):
    - Học viên: `Avatar` + `row.name`.
    - Lớp: `row.classNames.join(", ") || "—"`.
    - Phải đóng: `<span className="font-mono tabular-nums">{fmtVND(row.totalDue)}</span>`.
    - Đã thu: `<span className="font-mono tabular-nums">{fmtVND(row.totalPaid)}</span>`.
    - Còn nợ: `<span className={cn("font-mono font-semibold tabular-nums", row.remaining > 0 && "text-destructive")}>{fmtVND(row.remaining)}</span>`.
    - Hạn đóng: `formatDue(row.nextDue ?? "")` kèm `Badge` trạng thái (`overdue` → `"Quá hạn"` `destructive`, `due_soon` → `"Sắp đến hạn"` `warn` `dot`, `due` → `"Còn nợ"` `outline` `dot`, `clear` → `"Đã thu đủ"` `success` `dot`).
    - Thao tác: `<div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.stopPropagation(); }} />` (chỗ trống an toàn bàn phím để TOS-16/18 gắn nút `Thu` / `(eye)`).
- **Empty state**:
  - Khi `data.invoices.length === 0`: Card trắng `"Chưa có khoản thu nào"` + hướng dẫn tạo khoản thu + nút `"+ Tạo khoản thu"`.
  - Khi `data.invoices.length > 0` nhưng `rows.length === 0`: Card trắng `"Không có học viên khớp bộ lọc"` + nút `"Xóa bộ lọc"`.

## Tasks & Steps (Handover Contract `--advice`)

### Task 2.1 — Cập nhật Sidebar, AppShell, Routes Matcher và viết unit test (TDD)
- **Goal:** Đăng ký route `/debts` và mục menu `"Công nợ"` vào hạ tầng điều hướng của `apps/web`.
- **Target files and symbols:**
  - `apps/web/src/components/layout/sidebar.tsx` (`TEACHER_NAV`, `ACTIVE_KEY_BY_PREFIX`)
  - `apps/web/src/components/layout/sidebar.test.tsx`
  - `apps/web/src/components/layout/app-shell.tsx` (`ROUTE_CRUMBS`)
  - `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES`)
  - `apps/web/src/routes-matcher.test.ts` (`validStaticRoutes`)
- **Steps:**
  1. Thêm test vào `sidebar.test.tsx` và `routes-matcher.test.ts` cho `/debts` (`"Công nợ"` ngay dưới `"Doanh thu"` trong nhóm `"Kinh doanh"`).
  2. Cập nhật `sidebar.tsx`, `app-shell.tsx`, và `routes-matcher.ts`.
- **Success criteria:** Test của `sidebar.test.tsx` và `routes-matcher.test.ts` pass.
- **Verify:** `pnpm --filter web test -- sidebar routes-matcher` exits 0.

### Task 2.2 — Viết component test (Red phase) và hiện thực route `/debts` (Green phase)
- **Goal:** Hiện thực màn hình `/debts` đạt toàn bộ yêu cầu hiển thị KPI, lọc URL, debounce 300ms, lọc lớp, empty state và điều hướng dòng.
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/debts/index.test.tsx`
  - `apps/web/src/routes/_auth/debts/index.tsx` (`Route`, `DebtsRoute`)
- **Steps:**
  1. Tạo `apps/web/src/routes/_auth/debts/index.test.tsx` kiểm tra:
     - Render đúng số dòng học viên, 3 chỉ số Phải đóng / Đã thu / Còn nợ (`fmtVND`), 3 thẻ KPI + số học viên, và 4 loại badge trạng thái (`Quá hạn`, `Sắp đến hạn`, `Còn nợ`, `Đã thu đủ`).
     - Bấm chip `"Quá hạn"` → `navigate` với `search: { status: "overdue" }, replace: true`, bảng chỉ còn học viên quá hạn, KPI không đổi.
     - Gõ tìm kiếm → chưa gọi `navigate` ngay; sau 300ms (fake timers) gọi `navigate` đúng 1 lần với `search.q`; tìm không dấu khớp học viên có dấu.
     - Đổi select Lớp → `navigate` với `search.lop`, cả bảng và 3 thẻ KPI đều cập nhật theo lớp.
     - Mở sẵn `/debts?status=clear` → chip `"Đã thu đủ"` có `aria-pressed="true"`, bảng chỉ hiện học viên đã thu đủ; bấm `"Xóa bộ lọc"` → reset về URL sạch.
  2. Hiện thực `apps/web/src/routes/_auth/debts/index.tsx` và chạy build/check-types để sinh lại `apps/web/src/routeTree.gen.ts`.
- **Success criteria:** Toàn bộ test trong `debts/index.test.tsx` và suite `apps/web` đều pass, `routeTree.gen.ts` đồng bộ.
- **Verify:** `pnpm --filter web test -- debts sidebar routes-matcher` exits 0, `pnpm check-types` exits 0, và `pnpm check` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
