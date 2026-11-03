# Phase 01 — Nút "Gốc học viên" + URL theo môi trường

## Context

Xem [plan.md](plan.md). Làm theo tiền lệ `lead-api`.

## Files

- Sửa: `apps/profile/public/index.html` (nút header, CSS nếu cần cho mobile)
- Sửa: `apps/profile/serve.mjs` (hàm thay href, áp dụng cho dev server)
- Sửa: `apps/profile/build.mjs` (áp dụng khi build, đọc `STUDENT_PORTAL_URL`)
- Sửa: `packages/infra/alchemy.run.ts` (truyền env cho StaticSite `profile`)
- Thêm test: `apps/profile/tests/index.test.mjs`
- Không sửa: `apps/student`, thư mục output build.

## Steps

1. `index.html`: trong `.nav-actions` thêm `<a href="https://student.teacheros.io.vn" id="studentPortalLink" class="btn btn-outline btn-sm" rel="noopener">Gốc học viên</a>`, theo style nút hiện có. Kiểm tra `.nav-actions`/`.nav-links` ở breakpoint nhỏ để nút không bị ẩn hoặc tràn.
2. `serve.mjs`: thêm `replaceStudentPortalHref(html, url)` (cùng kiểu `replaceLeadApiMeta`: trim, rỗng → giữ nguyên, escape attr, regex nhắm `id="studentPortalLink"`). `createProfileServer` nhận thêm `studentPortalUrl = process.env.STUDENT_PORTAL_URL || "http://localhost:8003"`, áp dụng cùng chỗ đang thay lead-api (chỉ `index.html` gốc).
3. `build.mjs`: nếu `STUDENT_PORTAL_URL` có giá trị, thay trong `index.html` đầu ra (chỉ trang gốc).
4. `alchemy.run.ts`: thêm vào `env` của StaticSite `profile`: `STUDENT_PORTAL_URL: topology ? topology.studentOrigin : studentWorker.url.as<string>()`. Xác nhận `studentWorker` khai báo trước `profileWorker`. Dev dùng 8003 qua mặc định ở bước 2.
5. Test (`index.test.mjs`): (a) HTML có đúng một `#studentPortalLink` với href mặc định prod và text "Gốc học viên"; (b) `replaceStudentPortalHref` đổi href, input rỗng trả nguyên; (c) giá trị có ký tự `"` được escape.

## Validation

- `pnpm --filter profile test`
- `pnpm exec biome check .` và `pnpm check-types`
- `PORT=8005 pnpm --filter profile dev:bare`: nút trỏ `http://localhost:8003`; dừng server sau khi xong (không để process mồ côi).
- `STUDENT_PORTAL_URL=https://x.example pnpm --filter profile build` rồi grep `studentPortalLink` trong index đầu ra thấy URL mới.
- Xem 3 viewport + tab bàn phím; chụp screenshot cho PR, chạy `pnpm design:compare` nếu PR đụng hình ảnh.
- Sau deploy staging: nút trỏ `https://student.staging.teacheros.io.vn`.

## Risk / Rollback

- Rủi ro thấp: sai thứ tự khai báo `studentWorker` trong infra → lỗi lúc deploy; bước 4 yêu cầu kiểm tra.
- Mobile: nếu header chật, nút có thể phải đưa vào menu — chốt khi xem viewport 375.
- Rollback: revert một commit.

## Câu hỏi mở

- Nhãn/emoji của nút (hiện: chữ "Gốc học viên", không emoji) và có mở tab mới hay không — mặc định cùng tab.
