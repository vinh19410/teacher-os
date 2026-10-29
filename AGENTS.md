# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI/E2E workflow chỉ trigger cho target `main`; PR vào `develop` không có checks — gate verification là bộ lệnh local (`pnpm check`, `pnpm check-types`, `pnpm --filter <app> test`, `pnpm --filter e2e e2e`).
- Dev stack local chiếm port 8000/8001/8003 — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## Quy ước UI

- Đọc `DESIGN.md` trước khi sửa/Thêm UI: token màu/type/motion và quy tắc chip/card lấy từ đó,
  không hard-code giá trị lệch scale của `packages/ui/src/styles/globals.css`.
- Trang list có bộ lọc: filter sống trong URL (search param), ô search debounce ~300ms mới đẩy
  lên URL; taxonomy hai cấp nhóm chip theo nhãn; badge đếm `aria-hidden`. Xem `apps/web/src/components/ui/chip-filter.tsx`
  và `/assignments` làm mẫu.
- Verify UI ở 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; PR
  đụng hình ảnh kèm screenshot.

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
