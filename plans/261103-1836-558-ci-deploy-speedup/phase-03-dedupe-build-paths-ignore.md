# Phase 3 — Bỏ build trùng + paths-ignore

## Mục tiêu

Giảm thời gian `types-build` (~114s) bằng cách không chạy `vite build` hai lần, và không chạy CI cho thay đổi không ảnh hưởng code.

## Files

Đọc: `apps/{web,student,admin}/package.json` (script `check-types`), `turbo.json`, `.gitignore` (dòng `apps/web/src/routeTree.gen.ts` bị ignore), `AGENTS.md` (mục "Lưu ý vận hành"), `docs/production-release-runbook.md`.

Sửa:
- `apps/{web,student,admin}/package.json`, `turbo.json` (có thể thêm `turbo.json` cấp package)
- `.github/workflows/ci.yml`
- `AGENTS.md` (dòng mô tả trigger CI)
- `scripts/ci-workflow.test.mjs`

## Các bước

1. **Xác nhận vì sao `check-types` chạy `vite build` trước `tsc`**: `routeTree.gen.ts` bị gitignore, nên `tsc` cần file này do vite plugin sinh ra. Xác minh bằng cách xoá file rồi chạy `pnpm --filter web exec tsc --noEmit` (kỳ vọng fail thiếu route tree).
2. **Chọn cách bỏ trùng, ưu tiên ít rủi ro nhất**:
   - Cách A (ưu tiên): task `check-types` của 3 app `dependsOn: ["build"]` (khai báo ở `turbo.json` cấp package), script đổi thành `tsc --noEmit`. Turbo cache `build` (`dist/**`) nên `vite build` chỉ chạy một lần cho cả `check-types` và `build`.
   - Cách B (nếu A làm hỏng chạy cục bộ): dùng lệnh sinh route tree riêng thay cho `vite build` nếu TanStack Router CLI hỗ trợ trong cấu hình hiện tại.
   Chọn sau khi thử; ghi lý do.
3. Cục bộ: xoá `routeTree.gen.ts` và `dist/`, chạy `pnpm check-types` từ checkout sạch: phải xanh. Chạy `pnpm build` ngay sau: không build lại phần đã cache.
4. **paths-ignore cho `ci.yml`**: thêm `paths-ignore: ["plans/**", "docs/**", "**/*.md"]` cho cả `pull_request` và `push` (đặt sau dòng `branches:` để regex hợp đồng hiện tại còn khớp). Không áp dụng cho `deploy.yml`/`deploy-staging.yml`: deploy luôn chạy đủ quality.
   Cân nhắc loại trừ: nếu `docs/` hay `*.md` chứa file mà test đọc (ví dụ test đọc doc), bỏ glob tương ứng. Kiểm bằng `grep` các test đọc `docs/`.
5. Cập nhật `AGENTS.md` dòng mô tả CI: ghi rõ CI bỏ qua thay đổi chỉ động `plans/**`, `docs/**`, `*.md`. Cập nhật runbook nếu có câu nói quality chạy ở `deploy*.yml` (đã chuyển sang `quality.yml` từ Phase 1).
6. Cập nhật `ci-workflow.test.mjs` để khoá `paths-ignore` trong `ci.yml` và khoá rằng `deploy*.yml` không có `paths-ignore`.

## Kiểm chứng

- `pnpm check-types && pnpm build` xanh từ checkout sạch (xoá `routeTree.gen.ts`, `dist/`, `.turbo`).
- `node --test scripts/ci-workflow.test.mjs` xanh.
- PR thử chỉ sửa `plans/x.md`: không có run CI. PR thử sửa 1 file `.ts`: CI chạy.
- Run CI thật: thời gian `types-build` giảm so với bảng hiện trạng; ghi số vào report.

## Rủi ro và rollback

- `check-types` phụ thuộc `build` làm local `pnpm check-types` chậm lần đầu: chấp nhận, vì trước đây đã chạy `vite build` bên trong.
- `paths-ignore` bỏ sót case đổi file `.md` mà code đọc lúc runtime: giảm bằng kiểm tra ở bước 4.
- Rollback: khôi phục script `check-types` cũ và bỏ `paths-ignore`.
