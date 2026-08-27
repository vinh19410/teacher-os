---
phase: 1
title: "Collapse state + persistence"
status: completed       # pending | in-progress | completed
priority: P1
effort: "~1h"
dependencies: []
---

# Phase 1: Collapse state + persistence

## Overview

Thêm nền tảng trạng thái cho chế độ thu gọn sidebar: pure functions đọc/ghi preference từ localStorage (try/catch safe) và hook `useSidebarCollapsed` gắn vào AppShell. Chưa đụng UI — phase này chỉ tạo dữ liệu + test.

## Requirements

- Functional: đọc/ghi `collapsed` boolean qua localStorage key `teacher-os.sidebar.collapsed`; mặc định `false` (expanded) khi thiếu key hoặc localStorage lỗi.
- Non-functional: không thêm dependency mới; unit test chạy bằng vitest hiện có **không thêm jsdom/@testing-library**.

## Architecture

Tách I/O thuần để test được không cần DOM (khuyến nghị kongming checkpoint #1 — vitest setup hiện tại không có jsdom):

```ts
// apps/web/src/lib/sidebar-prefs.ts
export const SIDEBAR_COLLAPSED_KEY = "teacher-os.sidebar.collapsed";

export function readCollapsedPref(): boolean {
	try {
		return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
	} catch {
		return false; // private mode / storage bị chặn → memory-only default expanded
	}
}

export function writeCollapsedPref(collapsed: boolean): void {
	try {
		window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
	} catch {
		// degrade im lặng: không persist nhưng app vẫn hoạt động
	}
}
```

Hook đặt trong `app-shell.tsx` (nơi duy nhất dùng), style useState hiện tại:

```tsx
const [collapsed, setCollapsed] = useState(readCollapsedPref);
useEffect(() => {
	writeCollapsedPref(collapsed);
}, [collapsed]);
```

Lưu ý: effect persist chạy cả lúc mount lần đầu — ghi lại đúng giá trị vừa đọc, vô hại. Không lazy-guard cho đỡ phức tạp.

## Related Code Files

- Create: `apps/web/src/lib/sidebar-prefs.ts`
- Create: `apps/web/src/lib/sidebar-prefs.test.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx` (thêm state + props xuống Sidebar/Topbar)

## Implementation Steps

1. Viết `sidebar-prefs.ts` như snippet trên.
2. Viết `sidebar-prefs.test.ts` mock `window.localStorage` (hoặc stub qua `vi.spyOn`): case có key `"true"`, key `"false"`, thiếu key, `getItem` throw → `false`.
3. Trong `AppShell`: thêm `collapsed` state với initializer `readCollapsedPref` + effect persist. Pass `collapsed` vào `<Sidebar>` và `collapsed`/`onToggleCollapse={() => setCollapsed(v => !v)}` vào `<ShellBody>` → `<Topbar>`. Các class/grid đổi ở Phase 2 — bước này KHÔNG sửa className grid.
4. Chạy `pnpm --filter web test` (vitest run) + biome + typecheck local.

## Success Criteria

- [x] `readCollapsedPref`/`writeCollapsedPref` có unit test pass (4 case trên)
- [x] AppShell giữ state `collapsed`, chưa đổi gì UI/hành vi hiển thị (regression-neutral)
- [x] Gates xanh: `biome check .` (read-only — root `pnpm check` là auto-fix `--write`, không dùng làm gate), `pnpm check-types`, build; không có dependency mới trong `apps/web/package.json`

## Risk Assessment

Rủi ro thấp nhất trong cả plan. Nếu vitest env không expose `window.localStorage`, dùng mock global thay vì thêm jsdom — tuyệt đối không thêm dev-dep jsdom cho 2 pure functions (quyết định định trước, khỏi tranh luận giữa chừng).
