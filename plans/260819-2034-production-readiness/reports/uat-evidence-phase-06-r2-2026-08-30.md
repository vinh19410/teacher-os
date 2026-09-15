# UAT evidence phase-06 r2 — 2026-08-30 (re-run sau NO-GO 2026-08-20)

Verdict-only per sanitize allowlist của phase-06: status, hostname redacted,
SHA, migration/readiness result, timestamp, runner, pass/fail. Không hostname
thật, không OAuth value/state, không cookie value, không database ID/name, không
PII, không secret.

## Thông tin run

- Release commit: `235275c` (merge develop → main; develop tip `24132d9` gồm sign-off row + docs)
- Deploy: GitHub Actions `deploy.yml` run 33313994693 (workflow_dispatch, stage prod) — Deploy ✓, `/readyz` smoke ✓, auth-stub smoke ✓; run đầu 33312896437 fail ở Cloudflare auth (repo secret token sai/hết quyền — đã set lại; fail TRƯỚC khi tạo resource nào → không có partial-prod)
- Runner: AI agent (Chrome leg = Chromium isolate profile + headless fresh profile cho fault path; điều khiển qua browser automation), theo chỉ đạo operator Vinh Tran
- Timestamp: 2026-08-30 (UTC; probes ~13:05–14:20)
- App origin: `https://app.<domain>`; API origin: `https://api.<domain>` (redacted)
- Topology: `APP_DOMAIN` inline trong deploy env; cả 3 env file không có `CORS_ORIGIN`, không persist `APP_DOMAIN` (re-verified trước deploy)

## Step 1 — local gates trên release commit

- `pnpm test`: 0 fail — pass
- `pnpm check-types`: pass (turbo cache)
- `pnpm exec biome check .`: 0 error (1 warning + 1 info có sẵn) — pass
- `pnpm build` (VITE_SERVER_URL parity CI): pass

## Step 2 — topology gate (re-run)

- Zone in-account: Cloudflare API `GET /zones?name=` → success, 1 zone, status `active` — pass
- Google redirect URI: authorize precheck trên OAuth client production (repo secret đã đổi sang client "Production" 2026-08-30) → không `redirect_uri_mismatch` — pass
  (Lần precheck đầu trong ngày FAIL mismatch vì redirect được register trên client khác client app dùng; operator chuyển app sang client mới — giải quyết.)
- Dry-run `APP_DOMAIN=<domain> pnpm alchemy plan --stage prod` (no-apply, không `--yes`): topology derive OK, "Plan: 3 to update" — pass

## Step 3 — staging rehearsal gate

- Reference recorded throwaway-D1 proof của `0006` repaired (ledger 2026-08-20) — không đổi. Staging restage vẫn pending, không phải GO-gap.

## Step 4 — deploy + sign-off

- Sign-off row điền vào runbook TRƯỚC deploy (commit `24132d9`): Operator = AI agent (Vinh Tran chỉ đạo); Restore authority = Vinh Tran; Smoke/GO cập nhật sau run này
- Deploy prod từ `main` qua CI (runbook Automated section): pass (chi tiết ở phần Thông tin run)

## Step 5 — post-deploy probes

- `GET /readyz` → `200 {"ok":true}`, `cache-control: no-store` — pass
- `GET /` → `OK`, 200 — pass
- CORS preflight `Origin: https://app.<domain>` → 204, `access-control-allow-origin: https://app.<domain>` — pass

## Step 5b — migration/readiness (D1 prod, verdict-only)

- `d1_migrations`: 14/14 applied (0000→0013, gồm `0006_pink_ender_wiggin` repaired) — pass
- `/readyz` 200 (runtime + D1 reachability) — pass

## Step 6 — negative-origin matrix (status-only)

| # | Endpoint | Session | Origin | Expected | Got | Verdict |
|---|---|---|---|---|---|---|
| 1 | POST `/api/classes` | none | absent | 403 | 403 | pass |
| 2 | POST `/api/classes` | none | correct | 401 | 401 | pass |
| 3 | POST `/api/auth/sign-out` | valid | foreign | 403 | 403 | pass (session sau đó vẫn 200) |
| 4 | POST `/api/auth/sign-up/email` | none | correct | verdict + risk note | 200 | verdict: endpoint email sign-up MỞ trên prod; risk note: registration không gate — chấp nhận cho go-live hiện tại (app hướng Google sign-in), khuyến nghị hardening post-GO (disable hoặc invite-only) |

## Step 7 — browser leg: Chrome (Chromium isolate/fresh profile, incognito-equivalent)

- Runner: AI agent
- Step 1 sign-in: pass — account UAT chuyên dụng `fixture` (email/password theo chỉ định operator; tạo qua sign-up trên production ngay trước run). **Google OAuth leg: CHƯA chạy** (không có Google account credentials) — xem "GO-gap"
- Step 2 cookie attributes: pass — replay sign-in (curl) cho session cookie: `Domain=.<domain>` (dot-domain), `SameSite=None`, `Secure`, `HttpOnly`, prefix `__Secure-` (giá trị không ghi)
- Step 3 bootstrap: pass — org/actor tự bootstrap lúc sign-up; workspace render đủ nav
- Step 4 syllabus/class/Add Student/roster: pass — syllabus `fixture-uat-syllabus-r2` tạo OK (dropdown template thấy nhau giữa 2 trang); class `fixture-uat-class-r2` tạo OK (api list = 1 row, schedule T3 19:00–20:30, 12 buổi); Add Student `fixture-uat-student-1` OK; roster = 1 row ("10/10", "Ổn")
  - Ghi chú automation: lần submit đầu KHÔNG chọn skill/ngày → dialog đóng im không error toast (validation error hiển thị inline); lần submit đủ điều kiện → thành công. Không phải product blocker; đề xuất UX: error toast/scroll-to-error khi submit thiếu điều kiện
  - Minor UI finding: header trang Lớp hiển thị "3 lớp đang hoạt động" hardcoded trong khi list/API = 0 lớp (placeholder chưa wired) — cosmetic, không chặn GO
- Step 5 hard reload: pass — roster nguyên vẹn
- Step 6 sign-out/sign-in: pass — Đăng xuất → `/login`, API với session cũ → 401 (server revoke thật); sign-in lại → `/dashboard`; class-detail + roster nguyên vẹn

## Step 8 — fault path (Chromium headless fresh profile, DevTools-protocol route block)

- Block `/api/kernel` + reload → blocking load error `<h1>Không tải được dữ liệu lớp/học viên</h1>` hiển thị (không phải workspace trống) — pass
- Server trong lúc fault: `GET /` → 200 `OK` (không outage) — pass
- Gỡ block + reload → workspace load bình thường, roster còn `fixture-uat-student-1` — pass

## Quyết định GO/NO-GO

**NO-GO (có điều kiện, 1 GO-gap duy nhất)** theo unified GO table:

| Hàng | Kết quả |
|---|---|
| Local gates | pass |
| Topology gate | pass |
| Staging rehearsal | pass (reference) |
| Deploy + sign-off | pass |
| Probes + migration/readiness | pass |
| Negative-origin matrix | pass (row 4: risk note đã ghi) |
| Chrome leg | pass (sign-in bằng email theo chỉ định operator) |
| Safari leg | **CHƯA CHẠY** — computer-use bị chặn bởi TCC Accessibility chưa cấp cho ZCode Computer Use.app; cần operator cấp quyền hoặc runner người chạy theo runner kit |
| Google OAuth leg | **CHƯA CHẠY** — không có Google UAT account; contract #30 yêu cầu "Incognito Google sign-in" nguyên văn |
| Fault path | pass |

Hai GO-gap còn lại đều là input/quyền operator, không phải lỗi sản phẩm:
1. **Safari incognito leg**: operator cấp Accessibility cho ZCode Computer Use.app (System Settings → Privacy & Security → Accessibility) rồi agent tự chạy; HOẶC người chạy theo `uat-runner-kit.md` rồi nộp evidence
2. **Google OAuth leg**: operator cung cấp Google UAT account (out of band) cho agent chạy; HOẶC operator phê duyệt deviation chấp nhận email-auth leg làm bằng chứng auth cross-origin (cookie contract đã verify attributes + behavior đầy đủ) — cần ghi deviation vào plan

Sau khi 2 gap trên pass → tick GO row, evidence bổ sung r2.1, các plan/issues đánh dấu theo kết quả.
