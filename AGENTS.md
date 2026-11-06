# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI quality (`ci.yml` gọi chung `.github/workflows/quality.yml` chạy các job song song) trigger cho push + PR vào `main` **và `develop`** (từ #409; bỏ qua thay đổi chỉ chạm `plans/**/*.md` hoặc `plans/reports/**/*.html`; PR từ `develop` bỏ qua lượt `pull_request` vì lượt `push` cùng commit đã kiểm tra, trong khi `deploy.yml` và `deploy-staging.yml` luôn chạy đầy đủ uncached quality). E2E **chỉ chạy trên GitHub Actions ở deploy production** (job `e2e` trong `deploy.yml`: 6 shard, `--fully-parallel`, gate cùng uncached quality; không có `e2e.yml` riêng, PR/staging/develop không chạy e2e) — E2E còn chạy local qua bộ lệnh (`pnpm --filter <app> test`, `pnpm --filter e2e e2e` với port 8100/8101/8103). Bộ lệnh local (`pnpm check`, `pnpm check-types`, test) **vẫn là gate chính** cho agent — CI develop chỉ là lưới an toàn sau merge, không phải lý do bỏ local gate. Develop CI đỏ vì lint/format → remedy: `pnpm check:fix` rồi commit lại.
- **Full e2e chỉ bắt buộc khi `ak-ship` chạy ở mode `official`** (kể cả alias `stable`/`main`, mode tự nhận diện, `ak-vibe` không có `--beta`, và stage stable của `--both`): chạy toàn bộ `pnpm --filter e2e e2e` với port override bên dưới trước khi mở PR, ghi kết quả vào PR. Fail thì không ship. Mọi luồng khác (`ak-ship beta`, `ak-cook`, `ak-fix`, merge vào `develop`…) không bắt buộc e2e; chỉ chạy khi người dùng yêu cầu hoặc agent thấy cần để verify thay đổi.
- Artifact report sinh tự động (HTML…) đặt trong `plans/reports/` — glob `plans/reports/**/*.html` bị biome exclude (từ #409), không commit artifact report ở chỗ khác. Caveat: file dưới glob exclude không được lint quét — không dán secret/token/log nhạy cảm vào report.
- Dev stack local chiếm port 8000/8001/8003/8004/8005 (8004 = admin, plan #413 phase 5; 8005 = profile, plan #506 phase 6) — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`.
- Đăng ký tài khoản giáo viên ở `/login` (`apps/web`) bị ẩn bởi cờ build-time `VITE_TEACHER_SIGNUP_ENABLED` (#539, giai đoạn single-org): **mặc định tắt** khi deploy không đặt biến; e2e/verify tự bật (`playwright.config.ts`, `devserver-watchdog.mjs`, `launch.sh`). Bật lại ở môi trường thật: đặt biến `VITE_TEACHER_SIGNUP_ENABLED=true` rồi build lại web. Lớp UI này chỉ là bổ sung — server vẫn chặn theo allowlist `TEACHER_EMAILS` (packages/auth); nếu biến đó rỗng, Google OAuth vẫn tạo được tài khoản.
- E2E có giới hạn fail-fast trong `apps/e2e/playwright.config.ts`: toàn run tối đa 30 phút, dừng sau 10 test fail. Máy chậm hoặc cần xem hết lỗi thì override bằng `--global-timeout=<ms>` / `--max-failures=0`.
- E2E chạy web/student/admin từ bản build bằng `vite preview` (build trước mỗi run, khoảng 20 giây) thay vì vite dev, và đăng ký tài khoản trong spec bằng API (`signUpViaApi` trong `apps/e2e/specs/helpers.ts`); full suite khoảng 21 phút trên máy đang tải. Cần HMR hoặc debug source thì đặt `E2E_VITE_MODE=dev`. Spec nào kiểm tra hành vi của form đăng ký (ví dụ `callbackURL`) phải dùng `signUpViaUi`.
- E2E có watchdog hạ tầng (#402, entry `dev-watchdog`): vite web/student chết giữa run được restart tối đa 1 lần; chết lần 2 hoặc api chết → watchdog dừng run ngay và run FAIL với message `[dev-watchdog] hạ tầng dev server bất ổn…` — đừng nhầm đây là lỗi test; `design:compare` thì hủy run ngay kèm log tail. Root cause death (nếu gặp lại): native abort trong rolldown-binding của vite 8 dưới memory pressure — xem crash report `.ips` trong `~/Library/Logs/DiagnosticReports/`.
- `design:compare` tự chịu máy chia sẻ (#546): web/student bind `127.0.0.1`, design-v2 cấp port sát lúc boot + từ chối listener lạ (exit 3 → tự đổi port), dừng bằng `--force` khi muốn chụp lại raw + ghép đè ảnh compose (không force thì ghép đè khi raw mới hơn ảnh trong git); ảnh trắng/rỗng bị pixel check xoá + fail-loud — gặp `Ảnh chụp trắng/rỗng` thì chạy lại, đừng xoá check. SIGTERM/timeout tự dọn process group, không còn orphan cần kill tay.

## Quy ước UI

- Đọc `DESIGN.md` trước khi sửa/thêm UI: token màu/type/motion lấy từ
  `packages/ui/src/styles/globals.css` (design v2 — shadcn neutral oklch, light mặc định,
  Geist), không hard-code giá trị lệch scale. Component shadcn trong
  `apps/web/src/components/ui/*`; shell dùng chung `sidebar-07`, search ⌘K.
- Trang list có bộ lọc: filter sống trong URL (search param), ô search debounce ~300ms mới đẩy
  lên URL; taxonomy hai cấp nhóm chip theo nhãn; badge đếm `aria-hidden`. Xem
  `apps/web/src/components/ui/chip-filter.tsx` và `/assignments` làm mẫu.
- Verify UI ở 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; PR
  đụng hình ảnh kèm screenshot và chạy `pnpm design:compare`.

## GitHub Issues

- Khi tạo issue, **luôn gắn label `ai-handle`**: `gh issue create --label ai-handle …` (giữ thêm các label khác nếu có).
- Khi issue có phụ thuộc được đề cập (trong yêu cầu của người dùng, plan, hoặc nội dung issue — ví dụ "cần #X xong trước", "chặn #Y"), **luôn gắn quan hệ phụ thuộc tương ứng**: `--blocked-by <số|URL>` cho issue phải xong trước, `--blocking <số|URL>` cho issue đang chờ issue này (nhiều số phân cách bằng dấu phẩy, ví dụ `--blocked-by 200,201`). Issue đã tồn tại thì dùng `gh issue edit <N> --add-blocked-by …` / `--add-blocking …`. Không tự suy đoán phụ thuộc khi không được đề cập.

## **Khi cần hỏi**

Nếu bạn cần hỏi tôi điều gì đó, vui lòng sử dụng công cụ AskUserQuestion cùng với các thông tin thực tế ngắn gọn và sự đánh đổi để hỗ trợ quá trình ra quyết định.

## Luồng ak-plan → ak-git cp

- Khi skill `ak-plan` hoàn tất (plan đã được duyệt/chốt), **luôn gọi tiếp skill `ak-git cp`** để commit và push các file đã tạo ra trong session (plan, journal, các file liên quan).
- Không tự viết lệnh git thủ công thay cho `ak-git cp` trừ khi skill đó lỗi.

## Cursor Cloud specific instructions

- `node -v` phải là **v24** (CI pin Node 24; repo không có `engines`). Binary `/exec-daemon/node` là v22 và đứng trước nvm trên `PATH`. Snapshot này symlink Node 24 + pnpm 10.33.1 vào `/usr/local/cargo/bin` (đứng đầu `PATH`). Nếu `node -v` ra v22, đừng chạy test/dev bằng binary đó.
- `pnpm dev` là `alchemy dev` và **không chạy được** khi thiếu credential Cloudflare. Process non-interactive báo `AuthError: No credentials configured for 'Cloudflare'`. Cần `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (và `CI=1` để Alchemy đọc env thay vì `alchemy login`), cộng `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Không có các biến này trong VM.
- Không có credential Cloudflare thì stack đầy đủ (cùng app Hono + better-auth, libsql thay D1) là boot của e2e — đúng đường CI. Mở app bằng `http://localhost:8001`, không dùng `http://127.0.0.1:8001`: `CORS_ORIGIN` chỉ có `localhost`, sign-up từ `127.0.0.1` fail fetch.

```bash
pnpm --filter e2e run boot:api
VITE_SERVER_URL=http://localhost:8000 pnpm --filter web exec vite --port 8001 --strictPort
VITE_SERVER_URL=http://localhost:8000 pnpm --filter student exec vite --port 8003 --strictPort
pnpm run dev:landing
```

- `boot:api` xóa `apps/e2e/local.db` mỗi lần khởi động. Cổng 8000/8001/8003 phải trống trước `pnpm --filter e2e e2e` (override đã ghi ở mục vận hành). Chromium Playwright nằm trong cache VM; nếu lockfile đổi revision thì chạy lại `pnpm --filter e2e exec playwright install chromium`.
- Gate lint đọc-only là `pnpm exec biome check .`. `pnpm check` là `biome check --write` và sửa file. `pnpm test` và `pnpm check-types` là gate còn lại (xem `README.md` và `package.json`).
