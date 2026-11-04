# Phase 01 — Nút "Gốc học viên" + URL theo môi trường

<!-- Updated: Validation & Red-Team Session 1 - handover contract (--advice), URI scheme + function replacer + fail-closed anchor match, responsive header CSS (1440/768/375/320), E2E & topology-drift guards, docs/changelog sync + Failure Protocol -->

## Goal

Thêm nút `<a id="studentPortalLink" href="https://student.teacheros.io.vn" class="btn btn-outline btn-sm" rel="noopener">Gốc học viên</a>` trên header trang chủ `apps/profile` hiển thị gọn đẹp ở cả desktop, tablet và mobile (`1440×900`, `768×1024`, `375×812`, `320×812`), đồng thời thay thế `href` an toàn theo biến môi trường `STUDENT_PORTAL_URL` ở cả `serve.mjs` (dev/E2E) và `build.mjs` (staging/prod từ `packages/infra/alchemy.run.ts`).

## Context

Xem [plan.md](plan.md). Nhân bản cơ chế `LEAD_API_URL` với các chốt an toàn cho navigation sink `<a href>`. Plan này đạt chuẩn handover `--advice` kèm khối `## Failure Protocol` bắt buộc bên dưới.

## Files to Create or Modify

- Sửa:
  - `apps/profile/public/index.html` (nút `#studentPortalLink` trong `.nav-actions` + CSS responsive cho `.site-header`/`.nav-bar`/`.nav-actions`)
  - `apps/profile/serve.mjs` (`replaceStudentPortalHref`, tham số thứ hai `studentPortalUrl` của `createProfileServer`)
  - `apps/profile/build.mjs` (nâng `distBaseHref`, thay `STUDENT_PORTAL_URL` độc lập trên `dist/index.html`)
  - `packages/infra/alchemy.run.ts` (truyền `STUDENT_PORTAL_URL` vào `StaticSite("profile")` `env`)
  - `apps/e2e/playwright.config.ts` (truyền `STUDENT_PORTAL_URL: http://localhost:${studentPort}` cho webServer `profile`)
  - `apps/profile/tests/index.test.mjs` (unit + integration tests cho HTML, CSS `<style>`, `replaceStudentPortalHref`, `createProfileServer`, `buildProfile`)
  - `scripts/topology-drift.test.mjs` (khoá `STUDENT_PORTAL_URL` trong `StaticSite("profile")` và cổng `8003` mặc định trong `apps/profile/serve.mjs`)
  - `docs/production-release-runbook.md`, `docs/codebase-summary.md`, `docs/system-architecture.md`, `CHANGELOG.md` (đồng bộ tài liệu & changelog cho chế độ ship `beta`)
- Không sửa: `apps/student/*`, `apps/profile/public/kiem-tra-dau-vao/*`, `.github/workflows/deploy*.yml`, thư mục output build `apps/profile/dist/`.

## Tasks & Steps

### Task 1.1 — TDD Red: Viết trước bộ kiểm thử cho `#studentPortalLink`, `replaceStudentPortalHref`, `createProfileServer`, `buildProfile`, CSS `<style>` và `topology-drift`
- **Goal:** Tạo đầy đủ các bài kiểm thử tự động phản ánh toàn bộ hợp đồng chức năng, bảo mật và cấu hình để xác nhận trạng thái Red trước khi sửa code sản phẩm.
- **Target files and symbols:**
  - `apps/profile/tests/index.test.mjs` (import thêm `replaceStudentPortalHref`, `createProfileServer` từ `../serve.mjs` và `buildProfile` từ `../build.mjs`).
  - `scripts/topology-drift.test.mjs` (mở rộng test `#536` / thêm assertion cho `STUDENT_PORTAL_URL` và cổng `8003`).
- **Steps:**
  1. Trong `apps/profile/tests/index.test.mjs`, thêm các test:
     - HTML gốc `public/index.html` có đúng **1** phần tử `id="studentPortalLink"` nằm trong `.nav-actions`, là thẻ `<a>` có `href="https://student.teacheros.io.vn"`, `rel="noopener"`, `class` chứa `btn btn-outline btn-sm`, và nhãn `"Gốc học viên"`, trong khi `public/kiem-tra-dau-vao/index.html` không có `studentPortalLink`.
     - `replaceStudentPortalHref(html, url)`:
       - Thay đúng `href` khi truyền URL `http://` hoặc `https://` hợp lệ (kể cả khi đảo thứ tự thuộc tính `id` đứng trước `href` hoặc có thuộc tính phụ), giữ nguyên `id`, `class`, `rel="noopener"`.
       - Chuỗi rỗng `""` hoặc chỉ khoảng trắng `"   "` trả nguyên `html`.
       - Giá trị hợp lệ chứa ký tự đặc biệt như `"` (`https://student.example.com/a"b`) được escape thành `&quot;`, và giá trị chứa mẫu `$` của `String.prototype.replace` (`$$`, `$&`, `` $` ``, `$'`) được giữ nguyên nghĩa đen không làm vỡ thuộc tính `href`.
       - Từ chối fail-closed (`assert.throws`) mọi URI sai scheme hoặc nguy hiểm (`javascript:alert(1)`, `data:text/html,hi`, `//evil.example`, `student.teacheros.io.vn` thiếu scheme, `https://user:pass@student.example.com`), cũng như khi HTML không có hoặc có nhiều hơn 1 `#studentPortalLink`.
     - `createProfileServer(leadApiUrl, studentPortalUrl)` qua HTTP thật (`127.0.0.1:0`):
       - `GET /` và `HEAD /` trả `200`, `content-length` khớp chính xác `Buffer.byteLength(body, "utf8")`, thay cả `lead-api` lẫn `#studentPortalLink` sang `studentPortalUrl` được truyền; khi truyền `studentPortalUrl = ""` thì giữ mặc định `https://student.teacheros.io.vn`.
       - `GET /kiem-tra-dau-vao/` trả `200`, thay `lead-api` nhưng không chứa `studentPortalLink`.
     - `buildProfile({ distUrl, leadApiUrl, studentPortalUrl })` trên thư mục tạm:
       - Khi **chỉ** truyền `studentPortalUrl: "https://student.staging.teacheros.io.vn"` (`leadApiUrl: ""`), `dist/index.html` vẫn được cập nhật `href="https://student.staging.teacheros.io.vn"`, còn `dist/kiem-tra-dau-vao/index.html` giữ nguyên không có `studentPortalLink`.
     - Khối `<style>` inline trong `public/index.html` cân bằng ngoặc nhọn `{` / `}` (bù việc `biome.json:37` loại trừ file này).
  2. Trong `scripts/topology-drift.test.mjs`, bổ sung kiểm tra trong block `StaticSite("profile")` của `packages/infra/alchemy.run.ts` có `STUDENT_PORTAL_URL` dùng `topology.studentOrigin` + `studentWorker.url`, và cổng student mặc định trong `apps/profile/serve.mjs` khớp cổng `8003` của `apps/student/vite.config.ts`.
- **Success criteria:** Cả hai lệnh test đều chạy và fail đúng vào phần tử/hàm mới chưa được cài đặt (trạng thái TDD Red rõ ràng).
- **Verify:** `(! pnpm --filter profile test) && (! node --test scripts/topology-drift.test.mjs)` thoát với mã `0` (xác nhận cả hai bộ test hiện đang Red trước khi cài đặt).

### Task 1.2 — TDD Green (`apps/profile`): Cài đặt `#studentPortalLink` + CSS responsive (`index.html`), `replaceStudentPortalHref` + `createProfileServer` (`serve.mjs`), và `STUDENT_PORTAL_URL` (`build.mjs`)
- **Goal:** Triển khai nút `"Gốc học viên"`, bố cục header không vỡ ở mọi cỡ màn hình và cơ chế thay `href` an toàn lúc dev/build để toàn bộ test của `apps/profile` chuyển sang Green.
- **Target files and symbols:**
  - `apps/profile/public/index.html` (CSS `.site-header`, `.nav-bar`, `.nav-links`, `.nav-actions`, `@media (max-width: 1320px)`, `@media (max-width: 860px)`, `@media (max-width: 768px)`, `@media (max-width: 640px)`; markup `.nav-actions` tại dòng ~1856).
  - `apps/profile/serve.mjs` (`normalizeStudentPortalUrl`, `replaceStudentPortalHref`, `createProfileServer`).
  - `apps/profile/build.mjs` (`buildProfile`).
- **Steps:**
  1. Trong `apps/profile/public/index.html`:
     - Trong `<div class="nav-actions">`, thêm phần tử đầu tiên:
       `<a href="https://student.teacheros.io.vn" id="studentPortalLink" class="btn btn-outline btn-sm" rel="noopener">Gốc học viên</a>`
       giữ nguyên 2 nút CTA kế tiếp (`📝 Làm Test Miễn Phí` và `🎓 Đăng Ký Khóa Học`).
     - Cập nhật CSS header để không tràn/gãy dòng ở cả 4 cỡ màn hình (`1440×900`, `768×1024`, `375×812`, `320×812`):
       - Cho `.site-header .container { max-width: 1360px; padding-inline: clamp(16px, 2.5vw, 32px); }`, `.brand-link { flex-shrink: 0; }`, `.nav-links a { padding-inline: var(--space-2); white-space: nowrap; }`, `.nav-actions { gap: var(--space-2); }`, `.nav-actions .btn-sm { padding: 8px 12px; font-size: 13.5px; }`.
       - Thêm `@media (max-width: 1320px) { .nav-links { display: none; } }` và `@media (max-width: 860px) { .brand-subtitle { display: none; } }` để toàn dải tablet/laptop nhỏ (`769px..1320px`) giữ `.brand-link` + 3 nút `.nav-actions` trên 1 hàng gọn không tràn mép phải container.
       - Trong `@media (max-width: 768px)`, thêm `.nav-bar { flex-wrap: wrap; row-gap: var(--space-2); padding-block: var(--space-2); }`; thêm `@media (max-width: 640px)` đặt `.nav-actions { flex: 1 1 100%; flex-wrap: wrap; gap: var(--space-2); }` và `.nav-actions .btn { flex: 1 1 calc(50% - var(--space-2)); min-width: 0; padding: 8px 10px; font-size: 13px; }` (giữ nguyên `min-height: 44px`).
  2. Trong `apps/profile/serve.mjs`:
     - Cài đặt `export function replaceStudentPortalHref(html, studentPortalUrl)`:
       - `const trimmed = String(studentPortalUrl ?? "").trim(); if (!trimmed) return html;`
       - Kiểm tra cú pháp bằng `let parsed; try { parsed = new URL(trimmed); } catch { throw new Error(\`Invalid STUDENT_PORTAL_URL: \${trimmed}\`); }` và bắt buộc `(parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password` (nếu sai `throw new Error(...)`).
       - Tìm mọi thẻ mở `<a\b[^>]*\bid="studentPortalLink"[^>]*>` trong `html`; nếu `matches.length !== 1` hoặc thẻ khớp không chứa `\bhref="[^"]*"`, `throw new Error(...)` để fail-closed.
       - Thay thế thẻ khớp bằng callback function: chỉ thay `\bhref="[^"]*"` bên trong thẻ đó qua callback `() => \`href="${escapeAttr(trimmed)}"\`` để miễn nhiễm với `$`-pattern và giữ nguyên mọi thuộc tính khác (`id`, `class`, `rel`).
     - Mở rộng chữ ký `export function createProfileServer(leadApiUrl = process.env.LEAD_API_URL || "http://localhost:8000", studentPortalUrl = process.env.STUDENT_PORTAL_URL ?? "http://localhost:8003")` (giữ tương thích ngược tham số vị trí đầu tiên).
     - Trong handler phục vụ HTML tĩnh, xác định `const isRootIndex = file.toLowerCase() === rootIndexFile.toLowerCase(); const isTestIndex = file.toLowerCase() === testIndexFile.toLowerCase();`; nếu `isRootIndex || isTestIndex`, chạy `replaceLeadApiMeta(raw, leadApiUrl)` rồi nếu `isRootIndex` chạy tiếp `replaceStudentPortalHref(..., studentPortalUrl)` trước khi tạo `Buffer.from(rendered, "utf8")`.
  3. Trong `apps/profile/build.mjs`:
     - Import thêm `replaceStudentPortalHref` từ `./serve.mjs`.
     - Nhận thêm `studentPortalUrl = process.env.STUDENT_PORTAL_URL?.trim()` trong `buildProfile`.
     - Đưa `const distBaseHref = \`${distUrl.href.replace(/\/?$/, "/")}\`;` ra ngoài `if (leadApiUrl)`.
     - Thêm khối độc lập `if (studentPortalUrl)` đọc `new URL("./index.html", distBaseHref)`, áp dụng `replaceStudentPortalHref(html, studentPortalUrl)` và ghi lại file (không chạm `./kiem-tra-dau-vao/index.html`).
- **Success criteria:** Toàn bộ unit & integration test của `apps/profile` chạy xanh; lệnh `STUDENT_PORTAL_URL=https://x.example pnpm --filter profile build` ghi đúng `href="https://x.example"` vào `apps/profile/dist/index.html` mà không cần đặt `LEAD_API_URL`.
- **Verify:** `pnpm --filter profile test && STUDENT_PORTAL_URL=https://x.example pnpm --filter profile build && grep -Fq 'href="https://x.example"' apps/profile/dist/index.html && ! grep -Fq 'studentPortalLink' apps/profile/dist/kiem-tra-dau-vao/index.html && pnpm --filter profile build` thoát với mã `0`.

### Task 1.3 — Wiring `packages/infra/alchemy.run.ts` + `apps/e2e/playwright.config.ts` và chạy cổng kiểm tra kiểu/lint/drift
- **Goal:** Nối biến `STUDENT_PORTAL_URL` từ topology/Alchemy và cấu hình Playwright E2E sang `apps/profile`, đảm bảo `topology-drift`, `check-types` và `biome check` đều xanh.
- **Target files and symbols:**
  - `packages/infra/alchemy.run.ts` (`StaticSite("profile")` `env` quanh dòng `373–377`).
  - `apps/e2e/playwright.config.ts` (`webServer` entry cho `profile` quanh dòng `116–119`).
- **Steps:**
  1. Trong `packages/infra/alchemy.run.ts`, xác nhận `studentWorker` (`:318`) đứng trước `profileWorker` (`:369`), và thêm vào `env` của `Cloudflare.Website.StaticSite("profile", ...)`:
     ```ts
     STUDENT_PORTAL_URL: topology
       ? topology.studentOrigin
       : studentWorker.url.as<string>(),
     ```
  2. Trong `apps/e2e/playwright.config.ts`, thêm `STUDENT_PORTAL_URL: \`http://localhost:${studentPort}\`,` vào `env` của entry `pnpm --filter profile run dev:bare`.
  3. Chạy `node --test scripts/topology-drift.test.mjs`, `pnpm check-types`, và `pnpm exec biome check .`.
- **Success criteria:** `topology-drift.test.mjs` pass, toàn bộ workspace pass `check-types`, và `biome check .` báo 0 lỗi.
- **Verify:** `node --test scripts/topology-drift.test.mjs && pnpm check-types && pnpm exec biome check .` thoát với mã `0`.

### Task 1.4 — Smoke test `dev:bare` cổng `8005`, trình duyệt Chromium 3 viewport + `320px` + keyboard `Tab` focus và Playwright E2E
- **Goal:** Xác minh thực tế trên server HTTP và trình duyệt Chromium thật ở cả 3 viewport chuẩn (`1440×900`, `768×1024`, `375×812`) + `320×812` reflow + điều hướng bàn phím `Tab`, đồng thời xác nhận E2E profile không hồi quy.
- **Target files and symbols:** `apps/profile/serve.mjs`, `apps/profile/public/index.html`, `apps/e2e/specs/profile-lead-intake.spec.ts`.
- **Steps:**
  1. Khởi chạy ngắn hạn `PORT=8005 LEAD_API_URL=http://localhost:8100 pnpm --filter profile dev:bare`, `curl -sS http://localhost:8005/` kiểm tra `#studentPortalLink` trỏ đúng `http://localhost:8003`, rồi dừng sạch tiến trình server (không để orphan process).
  2. Mở trang profile qua server local (`PORT=8105 LEAD_API_URL=http://localhost:8100 STUDENT_PORTAL_URL=http://localhost:8103`) bằng Chromium thật ở `1440×900`, `768×1024`, `375×812` và `320×812`:
     - Xác nhận `#studentPortalLink` hiển thị (`visible`), text `"Gốc học viên"`, `href === "http://localhost:8103"`, kích thước vùng chạm `height >= 44`, không tràn ngang (`scrollWidth <= clientWidth`), ở `1440×900` và `768×1024` toàn bộ `.nav-bar` nằm gọn trên 1 hàng, 2 nút CTA hiện hữu vẫn hiển thị đầy đủ, `0` console error.
     - Kiểm tra điều hướng bàn phím `Tab` qua header chạm đúng `#studentPortalLink` với vòng `outline` `:focus-visible` rõ nét (`outlineStyle !== "none"`, `outlineWidth >= 2px`).
     - Lưu ảnh chụp header ở 3 viewport (`1440×900`, `768×1024`, `375×812`) ra `/tmp/560-viewport-*.png` để kiểm tra trực quan (không commit ảnh nhị phân rác vào git).
  3. Dừng server smoke tạm và chạy Playwright E2E `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/profile-lead-intake.spec.ts`.
- **Success criteria:** `dev:bare` cổng `8005` trả đúng `http://localhost:8003`; Chromium 4 cỡ màn hình không tràn ngang, chiều cao nút `>= 44px`, focus bàn phím rõ nét, `0` console error; Playwright E2E xanh và không còn listener mồ côi trên `8005`/`8105`.
- **Verify:** Smoke script in `SMOKE_560_OK` VÀ lệnh Playwright `specs/profile-lead-intake.spec.ts` thoát với mã `0`.

### Task 1.5 — Đồng bộ tài liệu (`docs/*`) và `CHANGELOG.md`, chạy full gate toàn repo
- **Goal:** Cập nhật tài liệu vận hành/kiến trúc phản ánh biến `STUDENT_PORTAL_URL` mới của `apps/profile` (chế độ `beta` theo `ak-docs update`), ghi `CHANGELOG.md` (`#560`), và vượt qua toàn bộ bộ cổng chất lượng local (`pnpm exec biome check .`, `pnpm test`, `pnpm check-types`, `pnpm build`).
- **Target files and symbols:**
  - `docs/production-release-runbook.md` (bảng biến môi trường quanh dòng `35` và mục `5` quanh dòng `121`).
  - `docs/codebase-summary.md` (mục `apps/profile` dòng `40`).
  - `docs/system-architecture.md` (dòng `41` của bảng kiến trúc).
  - `CHANGELOG.md` (mục `## 2026-11-04` → `### Added`).
- **Steps:**
  1. Thêm dòng `STUDENT_PORTAL_URL (profile build)` vào bảng biến môi trường và chú thích build trong `docs/production-release-runbook.md`, đồng thời cập nhật câu mô tả ngắn trong `docs/codebase-summary.md` và `docs/system-architecture.md` theo đúng quy tắc mỏng WHY/WHERE của `ak-docs`.
  2. Thêm mục `### Added` dưới `## 2026-11-04` trong `CHANGELOG.md` ghi nhận nút `"Gốc học viên"` trên header `apps/profile` và biến `STUDENT_PORTAL_URL` (`#560`).
  3. Chạy trọn bộ cổng CI local: `pnpm exec biome check . && pnpm test && pnpm check-types && pnpm build`.
- **Success criteria:** Tài liệu và `CHANGELOG.md` đồng bộ chính xác với code, và cả 4 lệnh gate CI đều thoát `0`.
- **Verify:** `grep -q "STUDENT_PORTAL_URL" docs/production-release-runbook.md && grep -q "(#560)" CHANGELOG.md && pnpm exec biome check . && pnpm test && pnpm check-types && pnpm build` thoát với mã `0`.

## Verification

- `pnpm --filter profile test` thoát `0`.
- `node --test scripts/topology-drift.test.mjs` thoát `0`.
- `pnpm exec biome check . && pnpm test && pnpm check-types && pnpm build` thoát `0`.
- `PORT=8005 pnpm --filter profile dev:bare` trả `#studentPortalLink` trỏ `http://localhost:8003` (và được dừng sạch).
- `STUDENT_PORTAL_URL=https://x.example pnpm --filter profile build` thay `href` trong `apps/profile/dist/index.html` và giữ nguyên `dist/kiem-tra-dau-vao/index.html`.
- Smoke Chromium 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×812` + keyboard `Tab` focus + Playwright E2E `specs/profile-lead-intake.spec.ts` đều xanh, `0` console error.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Risk / Rollback

- Rủi ro bố cục header chật ở desktop (`1144px` container) và mobile (`375px`/`320px`): đã giải quyết bằng mở rộng nhẹ `.site-header .container` + ngưỡng `@media` rõ ràng, kiểm chứng trực tiếp bằng đo `scrollWidth <= clientWidth` và bounding box trên Chromium thật.
- Rủi ro URI sai scheme hoặc trượt khớp thẻ `#studentPortalLink`: đã chặn fail-closed trong `replaceStudentPortalHref` (throw ngay lúc build/test).
- Lưu ý vận hành staging: merge vào `develop` chỉ chạy `ci.yml`; kiểm tra trực tiếp trên `https://profile.staging.teacheros.io.vn` diễn ra khi nhánh `staging` được fast-forward từ `develop`.
- Rollback: `git revert` commit của PR này (thay đổi thuần tĩnh + env build, không chạm DB/migration).
