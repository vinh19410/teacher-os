# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI quality (`ci.yml`: biome check, test, check-types, build) trigger cho push + PR vào `main` **và `develop`** (từ #409). E2E workflow vẫn chỉ trigger `main` — E2E chạy local qua bộ lệnh (`pnpm --filter <app> test`, `pnpm --filter e2e e2e` với port 8100/8101/8103). Bộ lệnh local (`pnpm check`, `pnpm check-types`, test, e2e) **vẫn là gate chính** cho agent — CI develop chỉ là lưới an toàn sau merge, không phải lý do bỏ local gate. Develop CI đỏ vì lint/format → remedy: `pnpm check:fix` rồi commit lại.
- Artifact report sinh tự động (HTML…) đặt trong `plans/reports/` — glob `plans/reports/**/*.html` bị biome exclude (từ #409), không commit artifact report ở chỗ khác. Caveat: file dưới glob exclude không được lint quét — không dán secret/token/log nhạy cảm vào report.
- Dev stack local chiếm port 8000/8001/8003/8004/8005 (8004 = admin, plan #413 phase 5; 8005 = profile, plan #506 phase 6) — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`.
- Đăng ký tài khoản giáo viên ở `/login` (`apps/web`) bị ẩn bởi cờ build-time `VITE_TEACHER_SIGNUP_ENABLED` (#539, giai đoạn single-org): **mặc định tắt** khi deploy không đặt biến; e2e/verify tự bật (`playwright.config.ts`, `devserver-watchdog.mjs`, `launch.sh`). Bật lại ở môi trường thật: đặt biến `VITE_TEACHER_SIGNUP_ENABLED=true` rồi build lại web. Lớp UI này chỉ là bổ sung — server vẫn chặn theo allowlist `TEACHER_EMAILS` (packages/auth); nếu biến đó rỗng, Google OAuth vẫn tạo được tài khoản.
- E2E có watchdog hạ tầng (#402, entry `dev-watchdog`): vite web/student chết giữa run được restart tối đa 1 lần; chết lần 2 hoặc api chết → run FAIL cuối run với message `[dev-watchdog] hạ tầng dev server bất ổn…` — đừng nhầm đây là lỗi test; `design:compare` thì hủy run ngay kèm log tail. Root cause death (nếu gặp lại): native abort trong rolldown-binding của vite 8 dưới memory pressure — xem crash report `.ips` trong `~/Library/Logs/DiagnosticReports/`.
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

- Mỗi khi tạo GitHub issue mới trong repo này (ví dụ `gh issue create`), **luôn thêm label `ai-handle`** theo mặc định (`--label ai-handle`).
- Chỉ bỏ label này khi người dùng yêu cầu rõ ràng cho issue đó.
- Khi issue có phụ thuộc được đề cập (trong yêu cầu của người dùng, plan, hoặc nội dung issue — ví dụ "cần #X xong trước", "chặn #Y"), **luôn gắn quan hệ phụ thuộc tương ứng**: `--blocked-by <số|URL>` cho issue phải xong trước, `--blocking <số|URL>` cho issue đang chờ issue này (nhiều số phân cách bằng dấu phẩy, ví dụ `--blocked-by 200,201`). Issue đã tồn tại thì dùng `gh issue edit <N> --add-blocked-by …` / `--add-blocking …`. Không tự suy đoán phụ thuộc khi không được đề cập.
- Lưu ý: label `ai-handle` chỉ là điều kiện để agent nhận việc; người duyệt vẫn phải kéo card sang **Ready** trên board "Teacher OS" thì agent mới bắt đầu làm.
- Pipeline chạy từ repo chung `vinh19410/ai-handle@38656c3` (installed tại `~/.local/lib/teacher-os-ai-handle/`); upgrade = `bash install.sh --project teacher-os`.

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
