---
phase: 1
title: "Sửa layout hàng lịch + thứ bậc chữ"
status: completed
effort: 1h
---

# Phase 1: Sửa layout hàng lịch + thứ bậc chữ

## Files

| File | Action |
|---|---|
| `apps/web/src/routes/_auth/dashboard.tsx` | modify |
| `apps/web/src/lib/dashboard-from-kernel.ts` | modify: thêm helper `formatClassSessionMeta` |

## Steps

1. **Helper meta** (`dashboard-from-kernel.ts`): `formatClassSessionMeta(g: DashboardClassSession): string` trả về `[`${g.dur}'`, g.type, g.topic].filter(Boolean).join(" · ")`. Trim `topic` trước khi lọc để chuỗi toàn khoảng trắng cũng bị bỏ.
2. **`ScheduleRow`** (component cục bộ trong `dashboard.tsx`, không export): props `{ time, className, meta }`. Markup:
   ```tsx
   <div className="grid grid-cols-[auto_1fr] items-baseline gap-4 border-line border-t py-4">
     <span className="min-w-[5ch] whitespace-nowrap font-mono text-lg tabular-nums leading-none">{time}</span>
     <span className="min-w-0">
       <span className="block break-words font-medium">{className}</span>
       <span className="text-meta text-sm">{meta}</span>
     </span>
   </div>
   ```
   - `items-baseline` để giờ thẳng hàng với tên lớp thay vì căn giữa với khối 2 dòng.
   - `min-w-0` + `break-words` để tên lớp dài xuống dòng trong cột 1fr, không đẩy tràn grid.
3. Thay 2 khối JSX hàng lịch (Lịch hôm nay `:93-111`, Lịch sắp tới `:131-147`) bằng `<ScheduleRow key=… />`, giữ nguyên `key` hiện tại.
4. **Thứ bậc chữ**: `h2` "Lịch hôm nay" và "Cần kiểm tra" đổi `text-2xl` sang `text-xl`, giữ `font-display font-extrabold tracking-[-0.02em]`.
5. Không đổi `PageHead`, `MorningSpot`, card học viên rủi ro, nhãn ngày.

## Validation

- `pnpm --filter web check-types`.
- Tự xem `/dashboard` ở 1440 trước khi sang Phase 2.
