---
title: "#560: Nút \"Gốc học viên\" ở trang profile dẫn tới student portal"
description: "Thêm nút \"Gốc học viên\" trên header apps/profile, trỏ tới origin của apps/student theo từng môi trường (prod/staging/dev)."
status: in-progress
priority: P3
effort: 2h
issue: 560
branch: feat/560-profile-student-portal-button
tags: [frontend, profile, infra]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #560 — Nút "Gốc học viên" ở trang profile

## Outcome

Trang `apps/profile` có nút **"Gốc học viên"** (header, desktop + mobile). Bấm vào sẽ mở student portal (`apps/student`) đúng môi trường: prod `https://student.teacheros.io.vn`, staging `https://student.staging.teacheros.io.vn`, dev `http://localhost:8003`.

## Non-goals

- Không đổi `apps/student`, API, auth, CORS.
- Không thêm nút ở trang `kiem-tra-dau-vao/` (chỉ trang chủ profile, trừ khi chủ dự án yêu cầu thêm).
- Không đổi hành vi các CTA hiện có.

## Phát hiện từ scout

- `apps/profile` là site tĩnh (`public/index.html`), không có bundler. Origin khác nhau theo môi trường nên **không hard-code** được.
- Tiền lệ cùng loại: `LEAD_API_URL` → `<meta name="lead-api">`, thay lúc build (`build.mjs`) và lúc dev (`serve.mjs` `replaceLeadApiMeta`), truyền từ `packages/infra/alchemy.run.ts` (StaticSite `profile`, `env`) và `apps/e2e/playwright.config.ts` (khi chạy E2E trên cổng `8105` / `8103`).
- Topology đã có `topology.studentOrigin` (`packages/infra/src/topology.ts`); khi không có topology dùng `studentWorker.url`; dev local mặc định là port `8003` khi `STUDENT_PORTAL_URL` chưa đặt (`undefined`), còn đặt chuỗi rỗng `""` thì giữ nguyên mặc định prod của HTML.
- Header hiện có `.nav-actions` với 2 nút CTA (dòng ~1856 của `index.html`). Lưu ý `biome.json:37` loại trừ `!**/apps/profile/public/index.html`, nên Phase 1 bổ sung kiểm tra cân bằng ngoặc `<style>` cùng bộ unit/integration test trong `apps/profile/tests/index.test.mjs` và drift guard trong `scripts/topology-drift.test.mjs`.

## Hướng làm

Nhân bản đúng cơ chế `lead-api`: env `STUDENT_PORTAL_URL` → thay `href` của nút lúc build/dev. HTML mặc định trỏ prod để file mở thẳng vẫn dùng được. Một cơ chế duy nhất, không thêm abstraction.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Nút + cơ chế thay URL + wiring infra](phase-01-student-portal-button.md) | completed |

## Acceptance criteria

- Header có nút "Gốc học viên" (`<a>`, `rel="noopener"`), href mặc định `https://student.teacheros.io.vn`.
- `STUDENT_PORTAL_URL` đặt hợp lệ (`http://` hoặc `https://`) → build/dev thay `href` (chỉ `index.html` gốc); để trống (`""`) → giữ mặc định prod; khi biến môi trường không đặt (`undefined`) ở `serve.mjs` → dev mặc định `http://localhost:8003`; URI sai scheme (`javascript:`, `data:`, thiếu scheme) → fail-closed (`throw`).
- `alchemy.run.ts` truyền origin student đúng theo `topology.studentOrigin` / `studentWorker.url.as<string>()`; `apps/e2e/playwright.config.ts` truyền `http://localhost:${studentPort}` cho webServer `profile`.
- Test mới trong `apps/profile/tests/index.test.mjs` và `scripts/topology-drift.test.mjs` xanh; `pnpm --filter profile test`, `pnpm test`, `pnpm exec biome check .`, `pnpm check-types` xanh.
- 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320×812` reflow: nút hiển thị, không vỡ/tràn ngang header, giữ nguyên 2 CTA hiện hữu, focus bàn phím thấy rõ.

## Phụ thuộc / lưu ý

- `#559` đã được merge vào `develop` trước nhánh này (`7496774e`); `#562` (nếu merge sau) chỉ chạm `.nav-links`, không xung đột `.nav-actions`.

## Validation Log

### Session 1 — 2026-11-04
- **Mode:** Autonomous (`ak-vibe --ship --beta --advice`) — handover-ready cho downstream executor kèm `## Failure Protocol`.
- **Câu hỏi mở đã chốt theo mặc định bảo thủ của issue/plan:** Giữ nhãn `"Gốc học viên"` (không emoji) và mở cùng tab (`rel="noopener"`, không thêm `target="_blank"`) đúng nguyên văn tiêu chí nghiệm thu của Issue #560; ghi chú vào mục *Việc cần người xử lý* để chủ dự án đổi 1 dòng nếu muốn nhãn/tab khác.

### Verification Results
- **Tier:** Light (1 phase — Fact Checker)
- **Claims checked:** 10
- **Verified:** 6 | **Failed:** 4 (đã xử lý triệt để vào `plan.md` và Phase 1) | **Unverified:** 0

#### Verified & Resolved Claims
1. `VERIFIED (apps/profile/package.json:5-8, apps/profile/build.mjs:12-15)` — `apps/profile` là site tĩnh không bundler (`serve.mjs` + `build.mjs`).
2. `VERIFIED (apps/profile/public/index.html:9, apps/profile/serve.mjs:32-42, apps/profile/build.mjs:10-24, packages/infra/alchemy.run.ts:369-377)` — Cơ chế tiền lệ `LEAD_API_URL` / `replaceLeadApiMeta` / `StaticSite("profile")` khớp codebase.
3. `VERIFIED (packages/infra/src/topology.ts:20,120, packages/infra/alchemy.run.ts:318,369,376)` — `topology.studentOrigin` tồn tại và `studentWorker` (`:318`) khai báo trước `profileWorker` (`:369`).
4. `VERIFIED (apps/profile/public/index.html:270-287,317-326,338-342)` — Các class `.btn`, `.btn-outline`, `.btn-sm` và `:focus-visible` (`:165-168`) có sẵn.
5. `FAILED -> RESOLVED (apps/profile/public/index.html:1856-1859, CHANGELOG.md:17)` — Cập nhật toạ độ `.nav-actions` về dòng `~1856` và ghi nhận `#559` đã merge sẵn vào `develop`.
6. `FAILED -> RESOLVED (apps/profile/public/index.html:170-193,238-267,1768-1777)` — Không tồn tại mobile menu trong `index.html`, và lòng `.container` (`1144px` ở desktop, `343px` ở `375px`) không đủ chứa thêm nút thứ 3 nếu không chỉnh CSS responsive cho `.site-header`/`.nav-bar`/`.nav-actions`. Đã đặc tả rõ quy tắc CSS cho cả desktop (`1440`), tablet (`768`) và mobile (`375`/`320`) trong Task 1.2 và xoá giả định "đưa vào menu".
7. `FAILED -> RESOLVED (apps/profile/serve.mjs:42, plan.md:47)` — Chuẩn hoá `studentPortalUrl = process.env.STUDENT_PORTAL_URL ?? "http://localhost:8003"` để phân biệt rõ biến chưa đặt (`undefined` → `http://localhost:8003` khi dev) với chuỗi rỗng `""` (giữ mặc định prod của HTML).
8. `FAILED -> RESOLVED (biome.json:37, scripts/design-compare/screens.json:1-583)` — `biome check .` loại trừ `apps/profile/public/index.html` và `pnpm design:compare` chỉ chụp `apps/web` + `apps/student` (không có `apps/profile`). Đã thay bằng kiểm tra cân bằng ngoặc `<style>` trong `index.test.mjs`, drift guard trong `scripts/topology-drift.test.mjs`, và smoke Chromium 3 viewport + `320px` + keyboard `Tab` + Playwright E2E.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-student-portal-button.md`
- Decision deltas checked: 7
- Reconciled stale references: 6
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-04
**Findings:** 9 deduplicated from `RedTeamSecurity` & `RedTeamAssumptions` (7 accepted, 2 rejected)
**Severity breakdown:** 2 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Header `.nav-bar` / `.nav-actions` tràn/gãy dòng ở cả desktop `1440×900` (`1385px > 1144px` lòng `.container`) lẫn mobile `375×812` / `320×812`, và phương án dự phòng "đưa vào menu" dựa trên mobile menu không tồn tại (`apps/profile/public/index.html:170-267,1768-1777`) | Critical | Accept | `plan.md`, Phase 1 (Task 1.2, Task 1.4) |
| 2 | `replaceStudentPortalHref` thiếu kiểm tra URI scheme `http:`/`https:` trên navigation sink `<a href>`, mở đường cho `javascript:`/`data:` XSS (đọc PII trong `localStorage['msmy_lead_draft_v1']`) hoặc đường dẫn tương đối lỗi khi thiếu scheme (`apps/profile/serve.mjs:25-39`, `apps/profile/public/index.html:3264-3277`) | Critical | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.2) |
| 3 | Lỗ hổng `$`-pattern (`$&`, `` $` ``, `$'`, `$$`) của `String.prototype.replace`, regex phụ thuộc thứ tự thuộc tính `href`/`id`, và nguy cơ fail-open về prod khi không khớp thẻ `#studentPortalLink` (`apps/profile/serve.mjs:25-39`) | High | Accept | Phase 1 (Task 1.1, Task 1.2) |
| 4 | `build.mjs:17` đang khoá việc đọc/ghi `dist/` trong `if (leadApiUrl)` và `distBaseHref` nằm cục bộ bên trong khối đó, làm rơi `STUDENT_PORTAL_URL` khi build độc lập; thiếu integration test cho `buildProfile()` và HTTP `createProfileServer()` (`apps/profile/build.mjs:6-25`, `apps/profile/serve.mjs:94-104`) | High | Accept | Phase 1 (Task 1.1, Task 1.2) |
| 5 | Mâu thuẫn giữa `process.env.STUDENT_PORTAL_URL \|\| "http://localhost:8003"` và tiêu chí `"để trống → giữ mặc định"`, cộng so khớp đường dẫn phân biệt hoa/thường `/Index.html` trên filesystem case-insensitive (`apps/profile/serve.mjs:42,94`) | High | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.2) |
| 6 | `apps/e2e/playwright.config.ts:116-119` chưa truyền `STUDENT_PORTAL_URL: http://localhost:${studentPort}` (lệch cổng `8003` vs `8103`), và `scripts/topology-drift.test.mjs:203-218` chưa khoá `STUDENT_PORTAL_URL` trong `StaticSite("profile")` / cổng `8003` trong `serve.mjs` | High | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.3) |
| 7 | `biome.json:37` loại trừ `apps/profile/public/index.html` (lọt lỗi ngoặc CSS `@media`), `pnpm design:compare` không bao phủ `apps/profile` (`scripts/design-compare/screens.json`), và `phase-01` chưa đạt chuẩn handover `--advice` + thiếu đồng bộ `docs/*` / `CHANGELOG.md` ở chế độ `beta` | Medium | Accept | `plan.md`, Phase 1 (toàn file) |
| 8 | Sửa `.github/workflows/deploy.yml` và `.github/workflows/deploy-staging.yml` để thêm biến `STUDENT_ORIGIN` vào bước `Smoke check profile` | Medium | Reject | Không áp dụng theo Scope Lock của Kongming (`no change to deploy*.yml`) — giữ phạm vi gọn trong app/infra/tests; tính đúng đắn lúc build và khớp topology đã được khoá fail-closed trong `replaceStudentPortalHref`, integration test `buildProfile`, và `scripts/topology-drift.test.mjs` |
| 9 | Đổi nhãn `"Gốc học viên"` sang `"Góc Học Viên"` / `"Cổng Học Viên"` hoặc thêm `target="_blank"` trước khi code | Medium | Reject | Không tự ý đổi copy/hành vi đã ghi tường minh trong tiêu chí nghiệm thu của Issue #560 và `plan.md` (`"Gốc học viên"`, mặc định cùng tab, `rel="noopener"`); ghi nhận tuỳ chọn đổi 1 dòng cho chủ dự án ở báo cáo bàn giao |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-student-portal-button.md`
- Decision deltas checked: 7 accepted findings
- Reconciled stale references: 6
- Unresolved contradictions: 0
