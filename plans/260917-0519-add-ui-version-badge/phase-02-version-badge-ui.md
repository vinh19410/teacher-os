---
title: "Phase 2: Version Badge UI"
status: completed
---

# Phase 2: Version Badge UI

## Overview

- **Priority**: P2
- **Status**: completed
- Tạo component `VersionBadge` và gắn vào sidebar cạnh logo "Teacher OS", hiển thị `v{__APP_VERSION__}`.

## Context Links

- Sidebar: `apps/web/src/components/layout/sidebar.tsx` (logo ở dòng ~229–247; PRO badge pattern ở dòng ~325)
- Badge component: `apps/web/src/components/ui/badge.tsx` (`variant="muted"` → `bg-line-soft text-muted-fg`)
- Phase 1 cung cấp global `__APP_VERSION__` + declaration

## Key Insights

- Pattern chip mono nhỏ đã có sẵn trong sidebar (badge "PRO"): `rounded-full bg-accent-soft px-[7px] py-px font-mono font-semibold text-[10px]` — badge version dùng cùng kích thước nhưng `variant="muted"` để không cạnh tranh về thị giác.
- Invariant D10: class của nhánh collapsed phải có prefix `app:` để không leak vào mobile drawer. Badge đặt trong div text logo (đã có `collapsed && "app:hidden"`) nên tự ẩn theo — không cần logic riêng.
- `Sidebar` dùng `useRouteContext({ from: "/_auth" })` nên test trực tiếp cần Router context; tách `VersionBadge` thành component thuần giúp test không cần wrapper.

## Requirements

- [x] Badge hiển thị `v{version}` (ví dụ `v0.0.3`), nhỏ gọn, nằm cạnh tên "Teacher OS"
- [x] `data-testid="app-version"` để test/e2e query
- [x] Tự ẩn khi sidebar collapsed (theo nhóm text logo), không phá layout rail 64px
- [x] Dark mode hoạt động đúng (dùng token `variant="muted"` sẵn có, không hardcode màu)

## Implementation Steps

1. Tạo `apps/web/src/components/layout/version-badge.tsx`:

	```tsx
	import { Badge } from "@/components/ui/badge";

	export function VersionBadge() {
		return (
			<Badge
				variant="muted"
				className="px-[7px] py-px font-mono text-[10px] font-medium tracking-[0.04em]"
			>
				v{__APP_VERSION__}
			</Badge>
		);
	}
	```

2. Sửa `apps/web/src/components/layout/sidebar.tsx` — trong `<Link to="/">` logo, đặt badge cạnh chữ (cùng div chịu `collapsed && "app:hidden"`):

	```tsx
	<div className={cn("flex items-center gap-2 font-display font-semibold text-base tracking-[-0.01em]", collapsed && "app:hidden")}>
		Teacher OS
		<VersionBadge />
	</div>
	```

	Lưu ý: nếu muốn badge có `data-testid` thì thêm prop `data-testid="app-version"` — hiện `Badge` chưa spread props; nếu không muốn sửa `Badge` thì bọc `<span data-testid="app-version">` ngoài, hoặc thêm `...rest` vào `Badge` (chọn 1, ưu tiên thêm spread `data-testid` vào `Badge` props interface để tái sử dụng).

3. Tạo `apps/web/src/components/layout/version-badge.test.tsx`:

	```tsx
	import { render, screen } from "@testing-library/react";
	import { describe, expect, it } from "vitest";
	import { VersionBadge } from "./version-badge";

	describe("VersionBadge", () => {
		it("renders the build version with a v prefix", () => {
			render(<VersionBadge />);
			const badge = screen.getByTestId("app-version");
			expect(badge.textContent).toMatch(/^v\d+\.\d+\.\d+/);
		});
	});
	```

	(Kiểm tra test runner đang dùng `@testing-library/react` hay chỉ `react-dom/test-utils` bằng cách xem `not-found.test.tsx` và làm theo đúng pattern hiện có.)

4. Verification toàn cục:

	```bash
	pnpm -F web test        # unit tests pass
	pnpm -F web check-types # build + typecheck pass
	pnpm check              # biome format/lint pass
	```

5. Smoke thủ công: `pnpm dev:web` → đăng nhập → badge `v0.0.3` cạnh logo; toggle collapse → badge biến mất; không overflow ở rail 64px.

## Todo

- [x] Tạo `version-badge.tsx`
- [x] Gắn badge vào logo sidebar
- [x] Thêm `data-testid="app-version"` (spread props trên `Badge` hoặc wrapper)
- [x] Viết `version-badge.test.tsx`
- [x] `pnpm -F web test`, `pnpm -F web check-types`, `pnpm check` pass
- [x] Smoke: badge đúng version, ẩn khi collapsed

## Success Criteria

- Badge `v{version}` hiển thị cạnh "Teacher OS", giá trị khớp root `package.json` lúc build.
- Sidebar collapsed không hiển thị badge, rail không vỡ layout.
- Tất cả verification commands ở bước 4 pass.

## Risk Assessment

- **Thấp — layout**: chip thêm ~40px cạnh logo; khi collapsed đã ẩn nên rail 64px không bị ảnh hưởng.
- **Thấp — test infra**: nếu dự án chưa có `@testing-library/react`, làm theo đúng pattern của `not-found.test.tsx` hiện có thay vì thêm dependency mới.

## Security Considerations

- Không thêm thông tin nào ngoài số version công khai. Không log version kèm dữ liệu người dùng.

## Next Steps

- Sau khi merge: release tiếp theo sẽ tự hiện version mới vì version được đọc lúc build.
- Tuỳ chọn tương lai (ngoài scope): hiện badge ở trang login để kiểm tra version không cần đăng nhập; thêm git SHA vào tooltip.
