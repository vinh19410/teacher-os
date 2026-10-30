---
title: "#506: Form đăng ký học trên msmy.io.vn lưu vào teacher-os (lead intake)"
description: "Thay form copy-Zalo của apps/profile bằng form gửi thẳng vào endpoint công khai /public/leads của teacher-os, có chống spam 2 lớp, và màn Đăng ký mới trong app web để giáo viên xử lý."
status: pending
priority: P2
effort: 3.3d
issue: 506
branch: feat/506-profile-lead-intake
tags: [feature, backend, frontend, profile, security]
blockedBy: []
blocks: []
created: 2026-10-30
---

# Plan: #506 — Lead intake cho form đăng ký học (apps/profile → teacher-os)

## Overview

Form đăng ký trên trang profile của cô Mỹ (`apps/profile`, production `https://msmy.io.vn`) hiện chỉ ghép text rồi copy clipboard để học viên tự dán vào Zalo — học viên bỏ ngang là mất lead. Google Form cũ (`forms.gle/9e7KB9Xjf5ujMhvZA`) có danh mục lớp thật nhưng dài (6 trường bắt buộc), tách IELTS/Giao tiếp thành 2 câu không bắt buộc và hỏi kết quả test 2 lần.

Plan này: (1) bảng `lead` + contract chung; (2) endpoint công khai `POST /public/leads` trên API (`api.teacheros.io.vn`) có CORS riêng cho msmy.io.vn và chống spam; (3) API giáo viên `/api/leads`; (4) màn **Đăng ký mới** trong app web; (5) viết lại form profile theo danh mục Google Form, chỉ bắt buộc Tên + SĐT, màn thành công có tóm tắt + nút Zalo (không hiện thông tin thanh toán), fallback copy-Zalo khi API lỗi; email báo cô Mỹ mỗi lead mới; (6) e2e + docs.

Nguồn quyết định: [brainstorm-261030-0930-profile-registration-form.md](../reports/brainstorm-261030-0930-profile-registration-form.md).

## Contract (đã chốt ở brainstorm)

- **Outcome:** học viên điền form < 1 phút; mỗi lần gửi tạo/cập nhật một lead thuộc org cô Mỹ; giáo viên xem và đổi trạng thái lead trong app web.
- **Constraints:** endpoint không đăng nhập ⇒ chống spam bắt buộc; org đích lấy từ env, không tin client; CORS msmy.io.vn chỉ trên route lead, không đụng `CORS_ORIGIN`/better-auth; migration có backup; profile giữ zero-dependency; không log thô SĐT/email/ngày sinh.
- **Non-goals:** tự tạo `student`/`enrollment` từ lead; thanh toán online cho lead; sửa/tắt Google Form cũ; migrate dữ liệu Sheet; deploy apps/profile; Turnstile (chỉ bật khi có spam thật).
- **Acceptance:** xem mục "Tiêu chí hoàn thành" bên dưới.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Bảng mới `lead` (org-scoped), không tái dùng `student`. Trạng thái `new → contacted → enrolled \| dropped`. | Lead chưa phải học viên; `student` có invariant riêng (portal identity, email unique). |
| D2 | Enum code ổn định trong `packages/api/src/lead-contracts.ts`: khóa `ielts-foundation`, `ielts-first-step`, `ielts-pre`, `ielts-advanced`, `ielts-sw-intensive`, `ielts-single-skill`, `comm-1`…`comm-5`, `undecided`; ngày học `mt`, `tf`, `ws`, `ss`, `flexible`; khung giờ `0900`, `1330`, `1545`, `1815`, `2000`, `flexible`. Nhãn tiếng Việt đi kèm trong contract. | Danh mục theo Google Form (quyết định người dùng); code ổn định để đổi nhãn không phải migrate. |
| D3 | Chỉ `name` + `phone` bắt buộc. SĐT chuẩn hóa: bỏ ký tự không phải số, `84xxxxxxxxx` → `0xxxxxxxxx`, phải khớp `^0\d{9}$`. | Quyết định người dùng; chuẩn hóa để dedupe theo SĐT. |
| D4 | `POST /public/leads` mount ngoài `/api/*` (cùng cách `/public/pay`), org đích = `LEAD_ORG_ID`. Thiếu `LEAD_ORG_ID` ⇒ 503 `LEAD_INTAKE_DISABLED` (fail-closed như `getBankHub`). | Tránh bootstrap middleware; không tin `orgId` từ client. |
| D5 | CORS: middleware CORS toàn cục **bỏ qua** path `/public/leads`; route lead tự gắn `cors({ origin: leadOrigins, allowMethods: ["POST","OPTIONS"], allowHeaders: ["Content-Type"], credentials: false })`. POST còn kiểm `Origin` ∈ `leadOrigins`, sai ⇒ 403. `LEAD_ORIGINS` mặc định prod `https://msmy.io.vn,https://www.msmy.io.vn`, dev `http://localhost:8005`. | Global cors trả preflight sớm với origin list cũ nên phải bỏ qua path; `CORS_ORIGIN` nuôi better-auth `trustedOrigins` và bị check topology. |
| D6 | Chống spam lớp 1: honeypot `website` không rỗng hoặc `elapsedMs < 3000` ⇒ 201 giả, không ghi. Zod whitelist enum, `.strict()`, giới hạn độ dài (name ≤ 80, email ≤ 120, note ≤ 500, placement ≤ 300), body > 4 KB ⇒ 413. | Rẻ, không cần dịch vụ ngoài; bot không biết bị lọc. |
| D7 | Chống spam lớp 2 bằng chính bảng `lead`: `ip_hash = HMAC-SHA256(BETTER_AUTH_SECRET, "lead-ip:" + CF-Connecting-IP)` (không lưu IP thô). Trước khi ghi: ≥ 3 lead có `ip_hash` đó với `updated_at` trong 10 phút ⇒ 429 `LEAD_RATE_LIMITED`; ≥ 100 lead tạo trong ngày (giờ VN) của org ⇒ 429 `LEAD_DAILY_CAP`. Cùng org + SĐT có lead `updated_at` trong 24 giờ ⇒ cập nhật bản ghi đó (giữ `status`, `submit_count + 1`) thay vì tạo mới. | Test được trên libsql của e2e (Workers Rate Limiting binding không có ở e2e); không thêm bảng. |
| D8 | API giáo viên mount trong `kernelRoutes` (`kernel.route("/leads", …)`) như `/notification-logs`: `GET /api/leads?q=&status=&page=` trả `rows`, `total`, `counts` theo trạng thái; `PATCH /api/leads/:id` đổi `status` (+ `teacherNote`). Lead khác org ⇒ 404. | Thừa hưởng Origin guard + role gate có sẵn; tái dùng mẫu list + chip count. |
| D9 | Profile đọc URL API từ `<meta name="lead-api" content="https://api.teacheros.io.vn">`; `serve.mjs`/`build.mjs` thay giá trị khi có env `LEAD_API_URL`. | Giữ zero-dependency, không cần bundler. |
| D10 | Màn thành công trên profile chỉ hiện tóm tắt + nút "Nhắn Zalo cô Mỹ"; **không** hiện thông tin chuyển khoản/VietQR. <!-- Updated: Validation Session 1 - bỏ thông tin thanh toán --> | Quyết định người dùng: form đăng ký học không kèm thanh toán. |
| D12 | Trường tùy chọn `studyMode`: `group-online` (Bàn tròn 4–6 bạn, Google Meet), `private-online` (Kèm 1-1, Google Meet), `offline-vgp` (Offline Vinhomes Grand Park). <!-- Updated: Validation Session 1 - giữ hình thức lớp --> | Quyết định người dùng: giữ trường đang có trên trang dù Google Form không có. |
| D13 | Mỗi lead **mới** (insert, không tính lần cập nhật dedupe) gửi một email tới mọi thành viên org (`membership` join `user.email`) qua `deps.mailer`, chạy nền bằng `runInBackground`. Nội dung tối thiểu: họ tên, khóa, hình thức, lịch mong muốn + link `<appOrigin>/leads`; **không** đưa SĐT/email/ngày sinh vào email. Mailer vắng hoặc gửi lỗi ⇒ log cảnh báo (không PII), lead vẫn lưu, response không đổi. <!-- Updated: Validation Session 1 - email báo lead --> | Quyết định người dùng. Bỏ PII khỏi email vì `MAILER_IMPL=log` (mặc định) in nguyên body ra log. |
| D11 | API lỗi mạng/5xx/429 ⇒ form giữ dữ liệu, hiện khối fallback "Copy & gửi Zalo" (tái dùng logic `generatedMsgBox` hiện có). | Không mất lead khi API gặp sự cố. |

## Phases

| # | Phase | Phụ thuộc | Effort |
|---|---|---|---|
| 1 | [Contract + schema + migration](phase-01-contract-schema-migration.md) | — | 0.4d |
| 2 | [Endpoint công khai + chống spam + CORS + email báo lead](phase-02-public-intake-endpoint.md) | 1 | 1d |
| 3 | [API giáo viên `/api/leads`](phase-03-teacher-leads-api.md) | 1 | 0.4d |
| 4 | [Màn Đăng ký mới trong web](phase-04-web-leads-page.md) | 3 | 0.6d |
| 5 | [Form đăng ký mới trên profile](phase-05-profile-registration-form.md) | 2 | 0.6d |
| 6 | [E2E, docs, cấu hình deploy](phase-06-e2e-docs-deploy.md) | 2, 3, 4, 5 | 0.3d |

Phase 2 và 3 độc lập sau phase 1 (file khác nhau); phase 4 và 5 độc lập với nhau.

## Tiền điều kiện

- `apps/profile` hiện **chưa được commit** (untracked) cùng các thay đổi `package.json` (`dev:profile`), `biome.json`, `docs/codebase-summary.md` trên `develop`. Cần commit baseline profile riêng trước khi tạo branch `feat/506-profile-lead-intake`, để diff của plan chỉ chứa thay đổi form.
- Cần biết `organization.id` của cô Mỹ trên production để đặt `LEAD_ORG_ID` khi deploy (phase 6).

## Tiêu chí hoàn thành

1. Form profile có Tên*, SĐT Zalo* (`type="tel"`, `inputmode="tel"`, `autocomplete="tel"`), Email, Ngày sinh, Hình thức lớp (tùy chọn), Khóa học (một `<select>` với `<optgroup>` IELTS / Giao tiếp + "Chưa rõ – cần test 1-1"), Ngày học, Khung giờ, Mục tiêu/ghi chú, Kết quả test (tự điền từ quiz trên trang; một ô tùy chọn cho examenglish).
2. Chỉ nhập Tên + SĐT vẫn gửi được; lỗi hiện tại chỗ, focus trường lỗi đầu tiên.
3. `POST /public/leads` hợp lệ ⇒ 201 + một dòng `lead` đúng `LEAD_ORG_ID`; honeypot/quá nhanh ⇒ 201 không ghi; vượt ngưỡng ⇒ 429; enum lạ/thiếu field ⇒ 400; origin lạ ⇒ 403; preflight từ msmy.io.vn có `Access-Control-Allow-Origin` đúng và không có `Allow-Credentials`; thiếu `LEAD_ORG_ID` ⇒ 503.
4. Cùng SĐT gửi lại trong 24 giờ ⇒ cập nhật lead cũ, `submit_count` tăng, không tạo dòng mới.
5. API lỗi ⇒ form không mất dữ liệu, hiện fallback copy + Zalo.
6. Màn thành công có tóm tắt + nút Zalo, không có thông tin thanh toán.
10. Lead mới ⇒ đúng một email tới thành viên org, không chứa SĐT/email/ngày sinh; gửi lại cùng SĐT trong 24 giờ không gửi email thêm; mailer lỗi không làm hỏng response.
11. Trường "Hình thức lớp" tùy chọn được lưu và hiện trong web.
7. Web có `/leads` "Đăng ký mới": chip trạng thái có đếm, tìm kiếm debounce 300ms, filter trong URL, đổi trạng thái, xem chi tiết; lead org khác không thấy.
8. Không có SĐT/email/ngày sinh thô trong log server.
9. `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, e2e spec mới xanh; verify UI 3 viewport.

## Rủi ro

- **Hành vi CORS khi bỏ qua middleware toàn cục** — sai thứ tự middleware làm preflight trả thiếu header. Giảm thiểu: test preflight + POST cross-origin ở phase 2.
- **Mạng di động dùng chung IP (CGNAT)** — nhiều học viên thật cùng IP có thể chạm ngưỡng 3/10 phút. Giảm thiểu: 429 chuyển sang fallback Zalo (không mất lead); ngưỡng là hằng số dễ chỉnh.
- **Lệch danh mục giữa profile HTML và contract** — profile không import được TS. Giảm thiểu: test server đọc `apps/profile/public/index.html` và so `value` option với enum contract.
- **`CF-Connecting-IP` vắng ở e2e/node** — fallback chuỗi `"unknown"`; test truyền header thủ công.

## Câu hỏi mở

- msmy.io.vn có dùng `www` không — đang cho phép cả hai.

## Validation Log

### Session 1 — 2026-10-30

| Câu hỏi | Trả lời | Tác động |
|---|---|---|
| Ngưỡng chống spam | Giữ 3 lần/IP/10 phút, 100 lead/ngày | Không đổi (D7). |
| Hiện chuyển khoản + VietQR ở màn thành công? | Không hiện thông tin thanh toán | D10 viết lại; phase 5 bỏ khối chuyển khoản/VietQR. |
| Trường "Hình thức lớp" | Giữ làm trường tùy chọn | Thêm D12; phase 1 (enum + cột), phase 4 (cột web), phase 5 (select + drift test). |
| Báo cô Mỹ khi có lead mới | Có, gửi email mỗi lead | Thêm D13; phase 2 thêm `lib/lead-notify.ts` + test; phase 6 kiểm `recordingMailer`; effort phase 2 0.7d → 1d. |

### Verification Results
- Claims checked: 22 (đường dẫn file, tên package, script test, symbol `vietnamTodayISO`, `StatusTag`, `reauth`, `recordingMailer`, `ChipFilter`, mount `/public/pay`, `kernel.route("/notification-logs")`, migration mới nhất 0056, `DESIGN.md`/`REVIEW.md`, `design:compare`).
- Verified: 22 | Failed: 0 | Unverified: 0
- Tier: Full (6 phase)

### Whole-Plan Consistency Sweep
- Đã quét mọi file plan cho "chuyển khoản", "VietQR", "TPBank", "bỏ select hình thức": chỉ còn trong D10/phase 5 ở dạng phủ định ("không hiện").
- `studyMode` có mặt nhất quán ở contract (phase 1), schema, web (phase 4), form + drift test (phase 5).
- Email báo lead: D13 ↔ phase 2 (impl + test) ↔ phase 6 (e2e) ↔ tiêu chí 10 khớp nhau.
- Không còn mâu thuẫn chưa giải quyết.
