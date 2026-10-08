---
title: "Phase 2: UI Doanh thu — recharts + section biểu đồ + đổi tên"
status: done
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: UI Doanh thu (recharts + section biểu đồ + đổi tên)

## Overview

Thêm section biểu đồ doanh thu vào đầu trang `/tuition` (sau hàng KPI), toggle kỳ
Tháng/Quý/Năm sống trong URL search param `ky`, và đổi tên menu/topbar/heading thành "Doanh thu".
Chart dùng recharts 3 với 2 layer trên cùng trục: bar "Phát hành" full-width (màu neutral token)
làm vệt nền, bar "Đã thu" hẹp hơn đè lên giữa (bullet-style) màu accent.

## Key Insights

- `apps/web/src/components/layout/sidebar.tsx:72-74` — item `{ to: "/tuition", label: "Học phí" }`;
  label **hardcode tiếng Việt, không i18n**; icon ví giữ nguyên.
- `apps/web/src/components/layout/app-shell.tsx:16` — `"/_auth/tuition": "Học phí"` (topbar title).
- `apps/web/src/routes/_auth/tuition.tsx:58` — `<PageHead title="Học phí" lead={...}>`; `lead` hiện
  `Đã thu ${fmtVND(collected)}` (từ `@/lib/mock-data:263`) — giữ nguyên ngữ nghĩa, chỉ đổi `title`.
- Pattern search param non-throw: `apps/web/src/routes/_auth/schedule.tsx:32-33` — `validateSearch`
  không throw/redirect, giá trị lạ rơi về mặc định.
- recharts 3 hỗ trợ chính thức React 16–19 (repo dùng React 19 catalog:) — cài
  `pnpm --filter web add recharts` (pull latest 3.x, không cần override peer). Nếu installer báo
  thiếu peer `react-is` thì thêm `pnpm --filter web add react-is`.
- DESIGN.md: chỉ accent cho data/state, không thêm màu mới; `font-mono` cho số liệu; motion 150ms
  chỉ color/border/transform, **không entrance choreography** → tắt animation của recharts.

## Requirements

- [x] `apps/web/package.json` có `recharts` (3.x).
- [x] Search param `ky` hợp lệ: `month` (default) | `quarter` | `year`; giá trị lạ → `month`, không throw.
- [x] Section biểu đồ: Card `variant="white"`, tiêu đề "Doanh thu", toggle 3 nút
      (Tháng | Quý | Năm) đặt cạnh tiêu đề; click update search param (giữ nguyên param khác).
- [x] Cột: vệt nền "Phát hành" + bar "Đã thu" accent; legend mono; tooltip hiển thị đầy đủ
      "Tháng 10/2026 · Đã thu Xđ · Phát hành Yđ" (dùng `fmtVND`).
- [x] Nhãn trục: tháng `T10`, quý `Q4`, năm `2026`; `font-mono text-xs` màu meta.
- [x] Animation tắt (`isAnimationActive={false}`); hover chỉ đổi màu bar (transition 150ms).
- [x] A11y (DESIGN.md:29-31): `role="img"` + `aria-label` CHỈ trên khối chart (SVG), KHÔNG bọc
      toggle; aria-label tóm tắt (VD: "Doanh thu 12 tháng gần nhất, đã thu tổng Xđ" + nếu
      `dropped > 0`: ", bỏ qua N hóa đơn không đọc được ngày"). Toggle đặt ngoài khối chart:
      `role="group"` + `aria-label` "Kỳ doanh thu", mỗi nút `<button>` với `aria-pressed`,
      focus ring theo token.
- [x] Toggle active style: **đen đặc** `border-fg bg-fg text-bg` theo DESIGN.md:26-27 (selection
      không dùng accent — accent dành cho CTA/data).
- [x] Rename: sidebar label, topbar title, PageHead title → "Doanh thu". KHÔNG đụng tab "Học phí"
      hồ sơ học viên (`students/$studentId.tsx:191`), label class fee (modals, roster), fixture test.

## Implementation Steps

1. `pnpm --filter web add recharts` — xác nhận version 3.x trong `apps/web/package.json`.
2. Tạo `apps/web/src/components/tuition/revenue-chart.tsx`:
   - Props: `buckets: RevenueBucket[]`, `period: RevenuePeriod`, `onPeriodChange(p: RevenuePeriod)`.
   - `ResponsiveContainer` height ~260px; `BarChart` + 2 `Bar` cùng `XAxis`/`YAxis` ẩn tick trục Y
     (số để tooltip), `Bar dataKey="issued"` `barSize` full, fill `var(--surface)` + stroke
     `var(--line-soft)`; `Bar dataKey="collected"` `barSize` ~60% fill `var(--accent)`.
   - `role="img"` + aria-label đặt trên wrapper của riêng SVG chart; `dropped > 0` → console.warn
     một lần + ghi vào aria-label.
   - `Tooltip` custom content: ngày đầy đủ theo period + 2 dòng `fmtVND`, nền `bg-bg` border
     `var(--line)`, số `font-mono`.
   - Toggle render 3 button theo pattern selection của DESIGN.md:26-27: active **đen đặc**
     `border-fg bg-fg text-bg`; inactive `text-meta`. Nhóm bọc `role="group"` + `aria-label`,
     mỗi nút `aria-pressed`.
   - Map label: month → `T${m}`, quarter → `Q${q}`, year → `${y}`; tooltip label: `Tháng m/yyyy`,
     `Quý q/yyyy`, `Năm yyyy`.
3. Sửa `apps/web/src/routes/_auth/tuition.tsx`:
   - Thêm `validateSearch` non-throw parse `ky` (mẫu `schedule.tsx:32-33`), type
     `{ ky?: "month" | "quarter" | "year" }`.
   - `useMemo(() => revenueByPeriod(data.invoices, period, new Date()), [data.invoices, period])`
     — bucket múi giờ đã xử lý trong helper (Asia/Ho_Chi_Minh); kỳ hiện tại tự cập nhật khi polling
     snapshot trigger re-render.
   - Chèn `<Card variant="white">` chứa section biểu đồ ngay sau hàng StatCard, trước
     "Gói học đang hoạt động".
   - Đổi `<PageHead title="Học phí" ...>` → `title="Doanh thu"` (giữ `lead`).
4. Sửa `apps/web/src/components/layout/sidebar.tsx:74` label → `"Doanh thu"`.
5. Sửa `apps/web/src/components/layout/app-shell.tsx:16` → `"/_auth/tuition": "Doanh thu"`.

## Todo

- [x] Cài recharts
- [x] `revenue-chart.tsx` (chart + toggle + tooltip + a11y)
- [x] `tuition.tsx`: validateSearch + useMemo + section + PageHead
- [x] sidebar.tsx: label "Doanh thu"
- [x] app-shell.tsx: topbar "Doanh thu"
- [x] Tự kiểm `pnpm --filter web dev`: toggle 3 kỳ, URL param, hủy chọn kỳ lạ (`?ky=x`) rơi về tháng

## Success Criteria

- `/tuition` hiện section biểu đồ với data thật từ snapshot; `?ky=quarter`/`?ky=year` đổi tập cột;
  `?ky=abc` không crash, về mặc định tháng.
- Sidebar, topbar, heading đều "Doanh thu".
- `pnpm check-types` + `pnpm --filter web test` xanh.
- Tự kiểm eyeball 3 viewport trước khi sang Phase 3 (screenshot chính thức ở Phase 3).

## Risk Assessment

- **React 19 + recharts 2.x cũ render chart rỗng** — đã chốt cài latest 3.x (peer range gồm React 19).
- **375px chật 12 cột** — co `barSize` theo container, nhãn `T1…T12` font mono xs; nếu vẫn tràn thì
  cho nhãn hiện cách bước (`interval="preserveStartEnd"`). Quyết cuối khi eyeball 375px ở Phase 3.
- **Snapshot chậm/không có invoices** — buckets rỗng → render empty-state text "Chưa có hóa đơn"
  thay vì chart trắng; nếu `dropped > 0` (invoice bị loại do thiếu ngày) thêm ghi chú số lượng để
  phân biệt "thật sự trống" với "bị drop" (không im lặng với chỉ số tài chính).

## Security Considerations

- Không thêm API, không đổi auth; chart chỉ đọc snapshot đã qua `kernelCtx` org-scope.
