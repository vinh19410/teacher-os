---
title: "Ship #506 lead intake: POST /public/leads + /api/leads + web Đăng ký mới (phase 5 profile blocked)"
date: 2026-10-30
summary: "ak-vibe beta ship #506: intake công khai cho form msmy.io.vn (contract, chống spam 2 lớp, CORS riêng, email báo lead), API giáo viên /api/leads, màn /leads trong web, e2e + docs. apps/profile không có trên máy — phase 5 blocked."
---

# Ship #506: Lead intake (msmy.io.vn → teacher-os)

## What happened
- Chạy ak-vibe beta cho issue #506 theo plan `plans/261030-0937-506-profile-lead-intake/` (đã commit trên develop `0768028f`) trên worktree `ai-handle-issue-506`. Môi trường này KHÔNG có skill `ak-vibe` (chỉ `e2e`) — bám đúng pipeline beta-ship: implement → test → review → PR develop → merge → watch CI.
- **Phase 1** — `packages/api/src/lead-contracts.ts`: 12 khóa + nhóm (IELTS/Giao tiếp/Khác), study modes (D12), ngày MT/TF/WS/SS, 5 khung giờ, statuses; `normalizeVietnamPhone` (84→0, `^0\d{9}$`); `leadSubmitSchema` strict (name+phone bắt buộc, email rỗng→undefined, birthDate 1940..nay, honeypot `website`, `elapsedMs`); query/patch schema; `LeadRow`/`LeadListResponse`; `LEAD_ERROR_CODES`. Schema `lead` (org-scoped, `ipHash`, `submitCount`, `statusChangedAt`, 3 index) + migration `0057_exotic_vulture.sql` (drizzle generate — chỉ CREATE TABLE + 3 index).
- **Phase 2** — `POST /public/leads` mount ngoài `/api/*` cạnh `/public/pay`: global CORS bọc lambda bỏ qua path (D5), route CORS riêng không credentials; thứ tự guard: 503 fail-closed thiếu `LEAD_ORG_ID` → 403 Origin → 413 >4KB → 400 `LEAD_INVALID`+fields (không echo giá trị) → honeypot/`elapsedMs`<3s 201 giả không ghi → HMAC-SHA256 IP (`CF-Connecting-IP`, secret `BETTER_AUTH_SECRET`) → 429 3/IP/10 phút → 429 100 lead/ngày (mốc 00:00 giờ VN qua `vietnamTodayISO`) → dedupe SĐT 24h (update giữ status+teacherNote, `submitCount+1`, không email lại) → insert + `notifyNewLead` (runInBackground, không PII, mailer lỗi nuốt). Wiring: `AppDeps` (leadOrgId/leadOrigins/leadIpSecret/appOrigin), index.ts, alchemy.run.ts (topology default msmy origins, dev 8005), boot.ts (org seed `e2e-lead-org` + origin 8105).
- **Phase 3** — `GET/PATCH /api/leads` trong kernelRoutes cạnh `/notification-logs`: q LIKE escape `%_\` trên lower(name)/phone, counts GROUP BY trên q-không-status, phân trang 20; PATCH org-scoped 404 `LEAD_NOT_FOUND`, `statusChangedAt` chỉ khi đổi status; response không `ipHash`.
- **Phase 4** — `/leads` web: chip trạng thái badge đếm từ server, search debounce 300ms, filter URL, DataTable (thời gian, tên + "N lần gửi", SĐT link zalo.me, khóa, hình thức, lịch, StatusTag), modal chi tiết (mọi field, mailto, textarea teacherNote, select trạng thái, PATCH + toast + invalidate), empty state; sidebar "Đăng ký mới" (Inbox) cạnh Học viên + ACTIVE_KEY_BY_PREFIX.
- **Phase 6 (điều chỉnh)** — e2e `profile-lead-intake.spec.ts` 3 case: AC-001 intake→/leads→đổi trạng thái→email; AC-002 dedupe (cùng id, submitCount 2, 1 email); AC-003 honeypot không ghi + 429 IP + IP khác không vạ lây. Runbook: section Lead intake (`LEAD_ORG_ID`/`LEAD_ORIGINS`, backup D1 trước migrate, WAF tùy chọn); codebase-summary thêm 3 file.

## Blocker
- **Phase 5 (form apps/profile) không làm được trên máy này:** `apps/profile` không tồn tại trong repo (mọi branch remote: chỉ develop/main/chore-*) và không có ở bất kỳ checkout/worktree nào trên VM. Nguồn thật (~3200 dòng index.html + serve.mjs + build.mjs) đang untracked ở máy khác. Không fabricate site profile. Cần commit baseline profile trước rồi chạy phase 5 + drift test + e2e form.

## Decision
- e2e intake driver là request API với Origin profile e2e (8105) — cùng hợp đồng CORS/payload của form; fallback copy-Zalo là behavior client-side profile, kiểm khi profile vào repo.
- Error response dùng literal string (convention `admin-library.ts`), `LEAD_ERROR_CODES` chỉ là catalog — lần đầu truy cập `.LEAD_NOT_FOUND` trên array trả undefined, JSON `{}` (đã fix, test bắt được).
- 2 test đêm đầu để lộ 2 bug import: `vietnamTodayISO` phải lấy từ `@teacher-os/api/vietnam-date` (không re-export qua lead-contracts), schema `db` mirror union `LeadStatus` local (db không phụ thuộc api, như notification-record).

## Verification
- api: 332/332 (25 files) gồm lead-contracts; server: public-leads 14 + leads 10 + security 7 + readiness/role-gates 18; infra: 20/20; web: leads 8/8 + sidebar/routes-matcher 35.
- Gates đầy đủ (biome/check-types/test/e2e) xem Completion Report — VM 2GB phải chạy serial + heap cap (turbo parallel OOM 137).

## Open
- Phase 5 + drift test + e2e qua form profile: chờ baseline profile.
- Jira: không thấy key `TOS-N` nào cho #506 (plan/brainstorm không tham chiếu) — bỏ qua sync; GitHub board do watcher đổi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
