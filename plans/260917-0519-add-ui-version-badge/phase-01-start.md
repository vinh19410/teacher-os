---
title: "Phase 1: Build-time Version Injection"
status: completed
---

# Phase 1: Build-time Version Injection

## Overview

- **Priority**: P2
- **Status**: completed
- Inject version từ root `package.json` vào client bundle qua Vite `define` global `__APP_VERSION__`.

## Context Links

- Root manifest: `/Users/vinhtran/Documents/project/personal/teacher-os/package.json` (`version: 0.0.3`)
- Build config: `apps/web/vite.config.ts` (đã import `node:fs/promises` và `node:path`)
- Release history: commit `55b78fe chore(release): bump version to 0.0.3` — root là nguồn bump version

## Key Insights

- `apps/web/package.json` có `version: 0.0.0` — KHÔNG dùng; root `package.json` mới là version release.
- Import `package.json` trực tiếp vào module client sẽ inline toàn bộ file (kể cả danh sách dependencies) vào bundle. `define` chỉ thay đúng một string constant.
- Vite dev hỗ trợ `define` giống hệt build, nên badge hiển thị đúng cả `pnpm dev:web` lẫn build production.

## Requirements

- [x] Global `__APP_VERSION__` khả dụng ở mọi module client, kiểu `string`
- [x] Giá trị được đọc từ root `package.json` lúc config load (build time), không hardcode
- [x] Không thay đổi hành vi existing của vite config (spa404Plugin, plugins… giữ nguyên)

## Implementation Steps

1. Sửa `apps/web/vite.config.ts`: đọc root package.json ở đầu file, thêm `define` vào `defineConfig`:

	```ts
	const rootPkg = JSON.parse(
		await fs.readFile(path.resolve(import.meta.dirname, "../../package.json"), "utf-8"),
	) as { version: string };

	export default defineConfig({
		define: {
			__APP_VERSION__: JSON.stringify(rootPkg.version),
		},
		// ...existing server/resolve/plugins giữ nguyên
	});
	```

	Lưu ý: `import.meta.dirname` (Node ≥ 20.11); nếu config chạy trên Node cũ hơn thì dùng `new URL("../../package.json", import.meta.url)`. Vite 8 yêu cầu Node ≥ 20.19 nên `import.meta.dirname` an toàn.

2. Tạo `apps/web/src/vite-env.d.ts`:

	```ts
	/// <reference types="vite/client" />

	declare const __APP_VERSION__: string;
	```

	(tsconfig đã có `"types": ["vite/client"]`, thêm reference cho chắc chắn khi file được include qua `rootDirs`.)

3. Chạy `pnpm -F web check-types` để xác nhận build + typecheck pass.

## Todo

- [x] Thêm `define.__APP_VERSION__` vào `apps/web/vite.config.ts`
- [x] Tạo `apps/web/src/vite-env.d.ts` với declaration
- [x] `pnpm -F web check-types` pass

## Success Criteria

- `pnpm -F web check-types` exit 0 (gồm `vite build` thật).
- Trong `apps/web/dist/assets/*.js` sau build có chuỗi `"0.0.3"` (version hiện tại của root package.json).
- Không có thay đổi nào khác ngoài 2 file trên.

## Risk Assessment

- **Thấp**: JSON.parse fail nếu package.json malformed → build fail ngay, phát hiện tức thì.
- **Thấp**: quên declaration → typecheck fail ngay ở bước dùng `__APP_VERSION__` trong Phase 2.

## Security Considerations

- Chỉ expose đúng 1 string version ra client — không leak dependencies/env. Version number là thông tin công khai, chấp nhận được trên UI.
