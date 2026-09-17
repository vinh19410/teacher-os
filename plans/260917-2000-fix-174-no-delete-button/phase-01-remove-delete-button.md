---
phase: 1
title: "Bỏ nút + copy admin + update SSR tests"
status: in-progress
depends: []
files:
  - apps/web/src/routes/_auth/settings.tsx
  - apps/web/src/routes/_auth/settings.test.tsx
---

# Phase 1: Bỏ nút Xóa tài khoản no-op

## DataTab (settings.tsx)

Bỏ block nút "Xóa tài khoản"; thêm sau note xuất file:

```tsx
<p className="text-muted-fg text-xs">
	Muốn xóa tài khoản? Giai đoạn pilot vui lòng liên hệ admin của bạn.
</p>
```

2 nút Xuất CSV/JSON giữ nguyên `disabled` (#167). Không đổi gì khác.

## Tests (settings.test.tsx)

Test cũ "drops the demo copy, disables exports, and leaves delete-account alone" đổi thành:
- KHÔNG còn chuỗi "Xóa tài khoản" trong DataTab (nút đã gỡ).
- Có copy "liên hệ admin".
- 2 nút Xuất vẫn `disabled` (regex `\sdisabled=`).

## Verification

```bash
cd apps/web
npx vitest run src/routes/_auth/settings.test.tsx && npx vitest run && npx tsc --noEmit
cd ../.. && pnpm exec biome check . (exit 0, không qua pipe)
```
