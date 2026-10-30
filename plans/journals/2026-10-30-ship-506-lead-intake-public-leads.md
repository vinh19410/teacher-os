---
title: "Ship #506 lead intake: POST /public/leads + /api/leads + web Đăng ký mới + form apps/profile"
date: 2026-10-30
summary: "ak-vibe beta ship #506: intake công khai cho form msmy.io.vn (contract, chống spam 2 lớp, CORS riêng, email báo lead), API giáo viên /api/leads, màn /leads trong web, form đăng ký mới trên apps/profile + drift test + E2E đầu-cuối."
---

# Ship #506: Lead intake (msmy.io.vn → teacher-os)

## What happened
- Chạy ak-vibe beta cho issue #506 theo plan `plans/261030-0937-506-profile-lead-intake/` (đã commit trên develop `0768028f`) trên worktree `ai-handle-issue-506`. Môi trường này KHÔNG có skill `ak-vibe` (chỉ `e2e`) — bám đúng pipeline beta-ship: implement → test → review → PR develop → merge → watch CI.
- **Phase 1** — `packages/api/src/lead-contracts.ts`: 12 khóa + nhóm (IELTS/Giao tiếp/Khác), study modes (D12), ngày MT/TF/WS/SS, 5 khung giờ, statuses; `normalizeVietnamPhone` (84→0, `^0\d{9}$`); `leadSubmitSchema` strict (name+phone bắt buộc, email rỗng→undefined, birthDate 1940..nay, honeypot `website`, `elapsedMs`); query/patch schema; `LeadRow`/`LeadListResponse`; `LEAD_ERROR_CODES`. Schema `lead` (org-scoped, `ipHash`, `submitCount`, `statusChangedAt`, 3 index) + migration `0057_exotic_vulture.sql` (drizzle generate — chỉ CREATE TABLE + 3 index).
- **Phase 2** — `POST /public/leads` mount ngoài `/api/*` cạnh `/public/pay`: global CORS bọc lambda bỏ qua path (D5), route CORS riêng không credentials; thứ tự guard: 503 fail-closed thiếu `LEAD_ORG_ID` → 403 Origin → 413 >4KB → 400 `LEAD_INVALID`+fields (không echo giá trị) → honeypot/`elapsedMs`<3s 201 giả không ghi → HMAC-SHA256 IP (`CF-Connecting-IP`, secret `BETTER_AUTH_SECRET`) → 429 3/IP/10 phút → 429 100 lead/ngày (mốc 00:00 giờ VN qua `vietnamTodayISO`) → dedupe SĐT 24h (update giữ status+teacherNote, `submitCount+1`, không email lại) → insert + `notifyNewLead` (runInBackground, không PII, mailer lỗi nuốt). Wiring: `AppDeps` (leadOrgId/leadOrigins/leadIpSecret/appOrigin), index.ts, alchemy.run.ts (topology default msmy origins, dev 8005), boot.ts (org seed `e2e-lead-org` + origin 8105).
- **Phase 3** — `GET/PATCH /api/leads` trong kernelRoutes cạnh `/notification-logs`: q LIKE escape `%_\` trên lower(name)/phone, counts GROUP BY trên q-không-status, phân trang 20; PATCH org-scoped 404 `LEAD_NOT_FOUND`, `statusChangedAt` chỉ khi đổi status; response không `ipHash`.
- **Phase 4** — `/leads` web: chip trạng thái badge đếm từ server, search debounce 300ms, filter URL, DataTable (thời gian, tên + "N lần gửi", SĐT link zalo.me, khóa, hình thức, lịch, StatusTag), modal chi tiết (mọi field, mailto, textarea teacherNote, select trạng thái, PATCH + toast + invalidate), empty state; sidebar "Đăng ký mới" (Inbox) cạnh Học viên + ACTIVE_KEY_BY_PREFIX.
- **Phase 5** — Sau khi baseline `apps/profile` vào `develop` (`738eb150`), viết lại `#consultForm` trong `apps/profile/public/index.html` gửi `POST /public/leads` qua `<meta name="lead-api">` (`serve.mjs` và `build.mjs` inject `LEAD_API_URL`), chỉ bắt buộc Tên + SĐT Zalo, danh mục khóa học (`<optgroup>` IELTS / Giao tiếp + `undecided`), hình thức lớp (`studyMode`), chip radio ngày/giờ, ghi chú, kết quả test (`placement` + `<details>` ExamEnglish), honeypot `website` (`tabindex="-1"`), màn thành công `role="status"` không kèm thông tin thanh toán (D10), lưu nháp `localStorage`, fallback copy-Zalo khi API lỗi (D11), kèm `apps/profile/tests/index.test.mjs` (9/9) và `apps/server/src/lead-catalog-drift.test.ts` (5/5).
- **Phase 6** — Thêm service `profile` (port `E2E_PROFILE_PORT=8105`, `LEAD_API_URL=http://localhost:${apiPort}`) vào `apps/e2e/playwright.config.ts` và `PROFILE_ORIGIN` vào `apps/e2e/specs/origins.ts`; cập nhật `apps/e2e/specs/profile-lead-intake.spec.ts` lái trực tiếp form UI trên `PROFILE_ORIGIN` (AC-001 màn thành công + `/leads` + đổi trạng thái + email không lộ SĐT; AC-002 dedupe 24h "2 lần gửi" + lưu `studyMode` + không email thêm; AC-003 honeypot + 429 IP + chặn route 500 hiện fallback copy-Zalo giữ nguyên dữ liệu); cập nhật `AGENTS.md`, `docs/codebase-summary.md`, `docs/production-release-runbook.md`.

## Verification
- `pnpm --filter profile test`: 9/9 passed.
- `pnpm --filter server exec vitest run src/lead-catalog-drift.test.ts`: 5/5 passed.
- `pnpm check` & `pnpm check-types`: 0 errors.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/profile-lead-intake.spec.ts`: 3/3 passed (52.0s).
- UI 3 viewport (`1440×900`, `768×1024`, `375×812`) + keyboard Tab focus + validation focus verified in Chromium.
- Jira: không thấy key `TOS-N` nào cho #506 (plan/brainstorm không tham chiếu) — bỏ qua sync; GitHub board do watcher đổi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
