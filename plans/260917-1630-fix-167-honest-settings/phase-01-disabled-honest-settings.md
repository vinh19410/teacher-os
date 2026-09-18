---
phase: 1
title: "Disabled + nhãn 'chưa mở' cho settings + SSR tests"
status: completed
depends: []
files:
  - apps/web/src/routes/_auth/settings.tsx
  - apps/web/src/routes/_auth/settings.test.tsx (new)
---

# Phase 1: Settings trung thực — disabled + nhãn 'chưa mở'

## Refactor để test được (SSR node env, không DOM)

Tách presentational components export riêng khỏi Route:

- `export function SettingsPage({ session })` — tab Tài khoản + Gói dịch vụ (wire tab state).
- `export function TemplatesTab()` — 3 Textarea mẫu Zalo.
- `export function RulesTab()` — 7 Select/Input quy tắc.
- `export function DataTab()` — copy + 3 nút (Xuất CSV, Xuất JSON, Xóa tài khoản).

Route component chỉ wire `useRouteContext` → `SettingsPage`.

## Nội dung thay đổi

1. **Bỏ 11 useState giả** (unitPrice, 3 tpl, 7 rules). Giá trị mặc định thành hằng module-level (`DEFAULT_TPL_*`, `DEFAULT_ABSENCE_*`, `DEFAULT_REMIND_*`, `DEFAULT_UNIT_PRICE`) giữ NGUYÊN VĂN text hiện tại.
2. **Mọi control giả → `disabled`** (6 Select + 1 number Input quy tắc, 3 Textarea mẫu, 1 Input đơn giá). Nhãn "Chưa mở" per-tab qua `NotYetOpenNote` ("Chưa mở — sẽ lưu khi tính năng ra mắt."); tab Dữ liệu dùng riêng "Chưa mở — xuất file đang ra mắt." (ngữ nghĩa export). Quy tắc render inline `<option>`/`value` (không dùng DEFAULT_ABSENCE_*/DEFAULT_REMIND_* constants như nháp ban đầu — chỉ 4 hằng mẫu/đơn giá là đủ).
3. **Tab Dữ liệu**: bỏ câu "Đây là bản demo — dữ liệu hiển thị là dữ liệu mẫu, chưa có xuất file thật." → giữ "Toàn bộ dữ liệu thuộc về cô. Xuất bất cứ lúc nào, kể cả khi hủy gói." + thêm nhãn "Chưa mở — xuất file đang ra mắt."; nút **Xuất CSV** và **Xuất toàn bộ (JSON)** thêm `disabled`. Nút **Xóa tài khoản KHÔNG đụng** (scope #174).
4. **Giữ nguyên**: gói Pro hardcode + Quản lý thanh toán disabled (#138 interim), tab Tài khoản (đã disabled thật + link Hồ sơ), Tabs/labels.

## Tests (`settings.test.tsx`, convention renderToStaticMarkup)

1. `TemplatesTab`: 3 Textarea render attr `disabled`; chuỗi "Chưa mở" xuất hiện; giữ placeholder value mẫu (assert 1 câu đại diện).
2. `RulesTab`: tất cả `<select>`/`<input>` render `disabled`; nhãn "Chưa mở".
3. `DataTab`: KHÔNG chứa "bản demo"; 2 nút Xuất có `disabled`; nút "Xóa tài khoản" render KHÔNG disabled (guard scope #174 — không vô hiệu hóa nhầm).
4. `SettingsPage`: đơn giá render `disabled`; gói Pro + badge "Sắp ra mắt" còn nguyên; link Hồ sơ còn.
5. Tab nav: assert qua SettingsPage render label 4 tab (Tài khoản/Mẫu tin Zalo/Quy tắc/Dữ liệu).

## Verification

```bash
cd apps/web
npx vitest run src/routes/_auth/settings.test.tsx
npx vitest run && npx tsc --noEmit && npx biome check src
```
Manual /settings: 4 tab — mọi field disabled + "Chưa mở"; tab Dữ liệu hết chữ demo; Xuất disabled; Xóa tài khoản như cũ.
