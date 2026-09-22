---
phase: 1
title: "App apps/landing static + tests"
status: todo
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: App `apps/landing` static + tests

## Goal

Tạo package `apps/landing` — static landing page zero-framework, nội dung port nguyên vẹn từ thiết kế `landing.html` (Open Design), kèm build script (copy `public/` → `dist/`), dev server tĩnh cổng 8002, và node:test guard các bất biến của file HTML. Phase này thuần tạo app mới trong workspace — chưa đụng infra/deploy.

## Files to Create / Modify

- Create: `apps/landing/package.json`
- Create: `apps/landing/build.mjs`
- Create: `apps/landing/serve.mjs`
- Create: `apps/landing/public/index.html`
- Create: `apps/landing/tests/index.test.mjs`
- Modify: `package.json` (root) — thêm script `dev:landing`.

## Context

- Thiết kế nguồn (1138 dòng, self-contained): `/Users/vinhtran/Library/Application Support/Open Design/namespaces/release-stable/data/projects/f2f4d498-7ea3-403c-89e9-6ac3099ac79b/landing.html`. Prompt gốc của thiết kế nằm trong repo tại `open-design/landing-prompt.md`.
- Thiết kế đã có sẵn: `<title>Teacher OS — Run your teaching business from one workspace</title>` (`landing.html:6`), đúng 1 `<h1>` (`:679`), viewport meta (`:5`), inline CSS + inline JS (sticky nav, mobile sheet, smooth scroll, IntersectionObserver reveal, client-side beta form `#beta-form`). Thiết kế KHÔNG có canonical/og/twitter/favicon — phase này bổ sung đúng phần đó trong `<head>`.
- Port convention 800x: server 8000 (`alchemy.run.ts:85`), web 8001 (`alchemy.run.ts:120-121`) → landing nhận 8002.
- `pnpm-workspace.yaml` đã phủ `apps/*` — không cần sửa. Turbo task `build` đã khai báo outputs `dist/**` (`turbo.json`), task `dev` persistent — khớp build.mjs/serve.mjs không cần đổi turbo.json.

## Tasks & Steps

1. **`apps/landing/package.json`** — zero-dependency, không check-types:

   ```json
   {
   	"name": "landing",
   	"private": true,
   	"type": "module",
   	"scripts": {
   		"dev": "node serve.mjs",
   		"build": "node build.mjs",
   		"test": "node --test tests/"
   	}
   }
   ```

   Không khai báo `check-types` — turbo tự skip task không có script, và app thuần HTML/JS không có type check nào để chạy.

2. **`apps/landing/public/index.html`** — copy nguyên vẹn 1138 dòng từ file thiết kế, sau đó CHỈ bổ sung trong `<head>` (không đụng body/CSS/JS):

   - `<link rel="canonical" href="https://teacheros.io.vn">` — canonical trỏ apex prod (xử lý duplicate content www, xem Design Decisions #2 plan.md).
   - Open Graph + Twitter card meta (og:title/og:description/og:type/og:url + twitter:card) lấy từ title/tagline của thiết kế.
   - Favicon SVG data-URI (glyph đơn giản "T" hoặc logo SVG inline của thiết kế nếu có).

3. **`apps/landing/build.mjs`** — build = copy, Node 24:

   ```js
   import { cp, rm } from "node:fs/promises";

   await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });
   await cp(new URL("./public", import.meta.url), new URL("./dist", import.meta.url), {
   	recursive: true,
   });
   ```

   Lưu ý: `import.meta.url` là đường dẫn FILE `apps/landing/build.mjs`, nên URL relative tính từ chính file đó — `./dist`/`./public` (cùng cấp), KHÔNG phải `../dist`/`../public` (sẽ rơi ra `apps/dist` ngoài package).

4. **`apps/landing/serve.mjs`** — static dev server ~30 dòng, `PORT || 8002`, root là `public/`:

   ```js
   import { createServer } from "node:http";
   import { readFile } from "node:fs/promises";
   import { extname, join, normalize } from "node:path";

   const root = new URL("./public", import.meta.url).pathname;
   const port = Number(process.env.PORT) || 8002;
   const types = {
   	".html": "text/html; charset=utf-8",
   	".css": "text/css; charset=utf-8",
   	".js": "text/javascript; charset=utf-8",
   	".svg": "image/svg+xml",
   	".ico": "image/x-icon",
   };

   createServer(async (req, res) => {
   	const pathname = normalize(
   		decodeURIComponent(new URL(req.url, "http://localhost").pathname),
   	);
   	const file = join(root, pathname === "/" ? "index.html" : pathname);
   	try {
   		const body = await readFile(file);
   		res.writeHead(200, {
   			"content-type": types[extname(file)] ?? "application/octet-stream",
   		});
   		res.end(body);
   	} catch {
   		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
   		res.end("Not found");
   	}
   }).listen(port, () => console.log(`landing on http://localhost:${port}`));
   ```

   `normalize()` chặn path traversal (`/../`). Server in URL ra stdout nhưng vẫn set `dev.url` tường minh khi wiring (phase 2) — không dựa vào auto-detect của Alchemy.

5. **`apps/landing/tests/index.test.mjs`** — node:test guard bất biến của trang:

   ```js
   import assert from "node:assert/strict";
   import { readFileSync } from "node:fs";
   import { test } from "node:test";

   const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

   test("index.html exists and is non-empty", () => {
   	assert.ok(html.trim().length > 0);
   });

   test("exactly one <h1>", () => {
   	assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
   });

   test("beta form present", () => {
   	assert.ok(html.includes('id="beta-form"'));
   });

   test("self-contained: no external <script src>", () => {
   	assert.ok(!/<script[^>]+src=/.test(html));
   });

   test("responsive viewport meta present", () => {
   	assert.ok(/name="viewport"/.test(html));
   });
   ```

6. **Root `package.json`** — thêm `"dev:landing": "turbo run dev -F landing --"` ngay sau `dev:server` (`package.json:9`), khớp pattern `dev:web`/`dev:server` sẵn có.

## Verification

- `pnpm install` — workspace nhận package mới, lockfile cập nhật.
- `pnpm --filter landing build` — tạo `apps/landing/dist/index.html` giống hệt `public/index.html`.
- `pnpm --filter landing test` — 5 test xanh.
- `pnpm exec biome check apps/landing` — pass (file `.mjs` theo tab + double quotes).
- `pnpm check` toàn repo vẫn xanh.
- Manual: `pnpm dev:landing` → mở `http://localhost:8002`, so visual với thiết kế Open Design; thử sticky nav, mobile sheet (thu hẹp cửa sổ), smooth scroll, reveal on scroll, submit beta form (client-side).
