---
title: "Phase 2: Chặn route /reports và kiểm chứng tổng thể"
status: todo
phase: 2
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Chặn route /reports và kiểm chứng tổng thể

## Overview

Thêm `beforeLoad` redirect cho route `/reports` khi flag tắt, cập nhật `reports.test.tsx` (mock `redirect` + test guard mới), rồi chạy đủ 3 lệnh kiểm chứng toàn diện.

## Requirements

- [ ] `reports.tsx:13-15`: thêm `beforeLoad` ném `redirect({ to: "/dashboard" })` khi flag tắt; giữ nguyên `component: ReportsRoute`
- [ ] `reports.test.tsx:7-13`: thêm `redirect` vào mock `@tanstack/react-router`; thêm import `Route`; thêm test guard `beforeLoad` throw; giữ nguyên mọi test component hiện có
- [ ] Chạy và pass cả 3 lệnh: `pnpm -C apps/web test`, `pnpm -C apps/web check-types`, `pnpm check`
- [ ] KHÔNG đổi `routes-matcher.ts:9` và `routeTree.gen.ts`

## Implementation Steps

1. `apps/web/src/routes/_auth/reports.tsx` — thêm `redirect` vào import `@tanstack/react-router` (dòng 1) và import flag vào nhóm `@/lib/*` (sau `useData` dòng 11):

```ts
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { CreateReportModal } from "@/components/modals/create-report-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
```

	Sửa khai báo Route (dòng 13-15) — thêm `beforeLoad` TRƯỚC `component`:

```ts
export const Route = createFileRoute("/_auth/reports")({
	beforeLoad: () => {
		if (!PARENT_REPORTS_ENABLED) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: ReportsRoute,
});
```

	Component `ReportsRoute` và toàn bộ phần dưới giữ nguyên.

2. `apps/web/src/routes/_auth/reports.test.tsx` — mock hiện tại (dòng 7-13) chỉ có `createFileRoute/useNavigate/Link`. Thêm `redirect` vào mock factory:

```ts
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
	redirect: (opts: { to: string }) => {
		throw Object.assign(new Error("redirect"), { redirect: opts });
	},
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));
```

	Vì mock `createFileRoute: () => (options) => options`, `Route` chính là object options chứa `beforeLoad`. Cập nhật import (dòng 56) và thêm test guard mới:

```ts
import { ReportsRoute, Route } from "./reports";
```

```ts
describe("/reports route guard while the parent reports cluster is hidden", () => {
	it("redirects to /dashboard in beforeLoad when the flag is off", () => {
		expect(() => Route.beforeLoad()).toThrow("redirect");
	});
});
```

	GIỮ NGUYÊN toàn bộ test component hiện có (`ReportsRoute` không đổi nên vẫn pass).

3. Chạy 3 lệnh kiểm chứng từ repo root, tiêu chí pass từng lệnh:

	1. `pnpm -C apps/web test` — exit 0; bao gồm test `beforeLoad` mới của reports.test và 2-textarea của settings.test (Phase 1).
	2. `pnpm -C apps/web check-types` — exit 0; `vite build && tsc --noEmit` không lỗi type (đặc biệt kiểu conditional spread ở sidebar/app-shell).
	3. `pnpm check` — biome check --write không tạo diff formatting nào ngoài code đã viết (tab indentation).

4. Smoke thủ công (không bắt buộc trong CI): chạy dev server, vào `/reports` → bị đưa về `/dashboard`; sidebar không còn section "Phụ huynh". E2E không có spec `/reports` nên không cần đổi.

## Todo

- [ ] Thêm `beforeLoad` redirect trong reports.tsx (dòng 13-15)
- [ ] Mock `redirect` + test guard mới trong reports.test.tsx
- [ ] `pnpm -C apps/web test` pass
- [ ] `pnpm -C apps/web check-types` pass
- [ ] `pnpm check` không diff
- [ ] Smoke thủ công /reports → /dashboard

## Success Criteria

- Truy cập trực tiếp `/reports` bị redirect về `/dashboard` khi flag tắt; bật flag lên thì route render bình thường.
- Test guard mới pass + mọi test component cũ của reports.test vẫn pass.
- Cả 3 lệnh kiểm chứng exit 0.

## Risk Notes

- Quên thêm `redirect` vào mock factory → import thật của TanStack Router ném lỗi khác trong môi trường test, các test reports đỏ oan.
- `routeTree.gen.ts` là file generated — KHÔNG sửa tay; nó sẽ tự cập nhật khi dev server/build chạy lại (thêm beforeLoad không đổi route id nên thực tế không có diff).
- Không đổi `routes-matcher.ts:9`: route file vẫn tồn tại, redirect chạy phía client — nếu SW chặn `/reports` thì request không bao giờ tới client để redirect.
- Nếu test guard fail với lỗi không phải "redirect", kiểm tra mock `createFileRoute` có còn trả `(options) => options` — `Route.beforeLoad` phải tồn tại.
