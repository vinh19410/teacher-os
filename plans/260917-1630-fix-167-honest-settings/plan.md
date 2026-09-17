---
title: "Fix #167: Bỏ tính giả UI Settings — disable rõ ràng kèm nhãn 'chưa mở'"
description: "Settings render form editable giả (useState local, không Save). Kernel chưa có settings surface → theo Expected option B của issue: disabled + nhãn 'chưa mở', sửa copy 'demo' tab Dữ liệu, disable Xuất CSV/JSON. Không đụng Xóa tài khoản (#174), không đụng gói Pro (#138 interim)."
status: completed
priority: P1
effort: 3h
issue: 167
branch: fix/167-settings-persist
tags: [frontend, bugfix, settings]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Fix #167: Bỏ tính giả UI Settings

## Overview

`apps/web/src/routes/_auth/settings.tsx` render đơn giá, 3 mẫu Zalo, 7 quy tắc bằng `useState` local **không Save, không persist** — giáo viên tưởng đã cấu hình workspace. Kernel (packages/api contracts + apps/server routes) **không có** settings/preferences surface; profile rename đi qua better-auth `updateUser` (khác cơ chế). Persist thật = tính năng mới (schema + API + migration) — out of scope bugfix, cần plan riêng.

Theo Expected của issue ("lưu được xuống kernel, **hoặc** disabled kèm nhãn 'chưa mở'"), route chọn: **bỏ tính giả** — mọi control chưa hoạt động chuyển thành disabled + nhãn "chưa mở" tại chỗ; tab Dữ liệu bỏ copy tự nhận "demo", thay bằng trạng thái trung thực; nút Xuất CSV/JSON disabled. Khẳng định giữ nguyên: nút Xóa tài khoản (#174), gói Pro hardcode (#138 interim).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Không còn control nào trông editable mà thật ra giả: disabled + nhãn "chưa mở" cho đơn giá, 3 mẫu Zalo, 7 quy tắc | P1 |
| 2 | Tab Dữ liệu trung thực: bỏ "bản demo", nút Xuất CSV/JSON disabled + nhãn | P1 |
| 3 | Không đụng Xóa tài khoản (#174), gói Pro (#138), layout/tabs hiện có | P2 |

## Non-Goals

- Không thêm settings surface vào kernel (cần plan riêng; sẽ ghi follow-up khi đóng issue).
- Không đổi copy/labels i18n khác (#116/#118).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Disabled + nhãn 'chưa mở' cho settings + SSR tests](./phase-01-disabled-honest-settings.md) | Pending |

## Success Criteria

- [x] SSR static test: tất cả Input/Textarea/Select trong tab Mẫu tin Zalo và Quy tắc render với attr `disabled` kèm nhãn "Chưa mở" (5 test settings + 1 contract test cập nhật)
- [x] SSR static test: tab Dữ liệu không còn chuỗi "bản demo", nút Xuất CSV/JSON disabled, Xóa tài khoản pin KHÔNG disabled
- [x] vitest apps/web xanh (42 files / 513 tests); biome src exit 0; tsc sạch (sau vite build generate routeTree)
- [ ] Manual /settings: 4 tab — không còn field giả editable (chờ verify trên beta deployment)

## Verification Commands

```bash
cd apps/web && npx vitest run src/routes/_auth/settings.test.tsx && npx vitest run
npx tsc --noEmit && npx biome check src
```

## Red-Team Record (4 personas, 2026-09-17)

**Assumptions** — kernel không có settings surface: đã grep contracts.ts (570 dòng, 0 match) + server routes; profile rename qua better-auth (khác cơ chế). Field/label liệt kê đúng 1-1 với code (đọc settings.tsx). Không blocker.

**Failure** — (F1) disabled field giữ `value` mặc định hiển thị — user vẫn đọc được mẫu hiện hành, chỉ không sửa được: đúng ý "chưa mở". (F2) e2e snapshot có thể đổi nếu e2e assert text settings — check trước merge; nếu e2e assert copy cũ thì update trong phase-01. (F3) Tab Tài khoản có field gì giả thêm? — phase-01 audit toàn tab khi implement (renamed profile field là read-only render, không input giả). Không blocker.

**Scope** — tách #174 (Xóa tài khoản) và persist-kernel (follow-up) khỏi PR này: đúng 1 issue 1 PR. Không scope creep.

**Security** — chỉ UI honesty, không đổi auth, không thêm attack surface. Không blocker.

**Verdict: GO** — 0 blocker, 1 note (check e2e text assertions).
