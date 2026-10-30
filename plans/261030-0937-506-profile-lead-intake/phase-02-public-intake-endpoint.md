---
phase: 2
title: "Endpoint công khai + chống spam + CORS"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: `POST /public/leads`

## Goal
Học viên từ `https://msmy.io.vn` gửi được đăng ký vào org cấu hình sẵn; bot và spam bị chặn theo D5–D7; lead mới gửi email báo giáo viên theo D13.
<!-- Updated: Validation Session 1 - thêm email báo lead -->

## Files (bổ sung cho email)
- Create: `apps/server/src/lib/lead-notify.ts` — `notifyNewLead({ db, mailer, orgId, lead, appOrigin })`
- Modify: `AppDeps` thêm `appOrigin?: string` (index.ts: `parseCORSOrigins(env.CORS_ORIGIN)[0]`, cùng cách `studentOrigin`); e2e boot truyền `recordingMailer` sẵn có + `appOrigin`.

## Files to Create / Modify
- Create: `apps/server/src/routes/public-leads.ts`
- Create: `apps/server/src/routes/public-leads.test.ts`
- Modify: `apps/server/src/app.ts` — `AppDeps` thêm `leadOrgId?: string`, `leadOrigins?: string[]`, `leadIpSecret?: string`; global `cors` bỏ qua `/public/leads`; `app.route("/public/leads", publicLeadRoutes(deps))` cạnh `/public/pay`.
- Modify: `apps/server/src/index.ts` — truyền `leadOrgId: env.LEAD_ORG_ID`, `leadOrigins: parseCORSOrigins(env.LEAD_ORIGINS)`, `leadIpSecret: env.BETTER_AUTH_SECRET`.
- Modify: `packages/infra/alchemy.run.ts` — binding `LEAD_ORG_ID` (`Config.string` default `""`), `LEAD_ORIGINS` (topology: default `https://msmy.io.vn,https://www.msmy.io.vn`; dev: `http://localhost:8005`; deploy không topology: bắt buộc như `CORS_ORIGIN`).
- Modify: `apps/e2e/src/boot.ts` — truyền `leadOrgId` (org seed), `leadOrigins: ["http://localhost:8105"]`, `leadIpSecret`.

## Tasks & Steps
1. Global CORS: bọc middleware hiện tại — `if (c.req.path === "/public/leads" || c.req.path.startsWith("/public/leads/")) return next();` trước khi gọi `cors(...)`. Comment lý do (preflight của cors toàn cục trả sớm với origin list teacher/student).
2. `publicLeadRoutes(deps)`:
   - `router.use("*", cors({ origin: deps.leadOrigins ?? [], allowMethods: ["POST", "OPTIONS"], allowHeaders: ["Content-Type"], maxAge: 600 }))` — không `credentials`.
   - `POST /`: thứ tự kiểm tra: (a) `leadOrgId` rỗng ⇒ 503 `LEAD_INTAKE_DISABLED`; (b) `Origin` không thuộc `leadOrigins` ⇒ 403 `LEAD_ORIGIN_FORBIDDEN`; (c) `Content-Length` > 4096 hoặc body text > 4096 ⇒ 413; (d) `leadSubmitSchema.safeParse` lỗi ⇒ 400 `LEAD_INVALID` kèm danh sách field (không echo giá trị); (e) honeypot hoặc `elapsedMs < 3000` ⇒ 201 `{ id: crypto.randomUUID() }`, không ghi DB; (f) tính `ipHash` (HMAC-SHA256 qua `crypto.subtle`, IP từ `CF-Connecting-IP`, vắng ⇒ `"unknown"`); (g) đếm lead `ipHash` với `updatedAt >= now - 10 phút` ≥ 3 ⇒ 429 `LEAD_RATE_LIMITED` + `Retry-After: 600`; (h) đếm lead org tạo từ 00:00 giờ VN (`vietnamTodayISO` → mốc UTC) ≥ 100 ⇒ 429 `LEAD_DAILY_CAP`; (i) tìm lead cùng org + phone `updatedAt >= now - 24h` ⇒ update field mới (giữ `status`, `teacherNote`), `submitCount + 1`, `updatedAt = now`, trả 200 `{ id, updated: true }`; không có ⇒ insert, 201 `{ id }`, rồi `runInBackground(notifyNewLead(...))` (vắng `runInBackground` ⇒ `await`, như `notification-logs.ts`).
   - `notifyNewLead`: lấy email thành viên org (`membership` join `user` theo `userId`, bỏ email rỗng); mỗi người một `mailer.send({ to, subject: "Đăng ký học mới: <tên>", text })`; nội dung: tên, nhãn khóa, hình thức, ngày học + khung giờ, link `<appOrigin>/leads?status=new` — **không** SĐT/email/ngày sinh/ghi chú. Mailer vắng ⇒ `console.warn("[leads] mailer missing, skip notify", leadId)`; lỗi gửi ⇒ `console.error` chỉ kèm `leadId`, nuốt lỗi.
   - Hằng số `LEAD_IP_WINDOW_MS`, `LEAD_IP_MAX`, `LEAD_DAILY_CAP`, `LEAD_MIN_ELAPSED_MS`, `LEAD_DEDUPE_WINDOW_MS` export để test.
   - `Cache-Control: no-store`. Log chỉ `lead id` + kết quả, không log body (đối chiếu `log-redaction.ts` — logger hiện log URL, không log body; route không chứa PII trên URL).
3. Test (`public-leads.test.ts`, harness libsql như `holidays.test.ts`): 201 + dòng DB đúng org; 503 khi thiếu org; 403 origin lạ; preflight `OPTIONS` từ `https://msmy.io.vn` có `Access-Control-Allow-Origin` và **không** có `Access-Control-Allow-Credentials`; route teacher (`/api/...`) vẫn giữ CORS cũ (origin msmy bị từ chối); 400 enum lạ / thiếu phone / key lạ; 413; honeypot và `elapsedMs` nhỏ ⇒ 201 nhưng không có dòng; lần thứ 4 cùng IP trong 10 phút ⇒ 429; trần ngày ⇒ 429 (seed 100 dòng); cùng phone ⇒ update, `submitCount = 2`; IP khác nhau ⇒ `ipHash` khác, không lưu IP thô; lead mới ⇒ mailer giả nhận đúng 1 email/thành viên, body không chứa SĐT/email; dedupe update ⇒ không email; honeypot ⇒ không email; mailer ném lỗi ⇒ vẫn 201 và có dòng DB.

## Verification
- `pnpm --filter server test -- public-leads`
- `pnpm --filter server test -- security` (không hồi quy CORS/secure headers)
- `pnpm --filter @teacher-os/infra test` (topology)
- `pnpm check-types`
