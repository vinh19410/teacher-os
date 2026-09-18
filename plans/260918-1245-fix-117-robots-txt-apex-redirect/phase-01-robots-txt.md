# Phase 01: robots.txt static asset and worker fallback handler

**Status: Completed**

## Objective
Đảm bảo request `https://app.teacheros.io.vn/robots.txt` (và local `http://localhost:8001/robots.txt`) luôn trả về file `text/plain; charset=utf-8` hợp lệ với mã trạng thái HTTP 200, nội dung `User-agent: *\nDisallow: /\n`, có security headers đầy đủ, không bao giờ rơi vào SPA shell hay HTTP 404.

## Proposed Changes

1. **`apps/web/public/robots.txt`**:
   - Tạo file tĩnh:
     ```txt
     User-agent: *
     Disallow: /
     ```
   - Vite sẽ tự động copy file này vào thư mục build `dist/robots.txt`.

2. **`apps/web/src/worker.ts`**:
   - Trong nhánh xử lý `isStaticAssetPath(pathname)`:
     - Nếu `pathname === "/robots.txt"`:
       - Thử `env.ASSETS.fetch(request)`.
       - Nếu kết quả trả về `res.ok`, đảm bảo response header có `Content-Type: text/plain; charset=utf-8` và security headers.
       - Nếu `!res.ok` hoặc `env.ASSETS` không có: fallback trả về HTTP 200 `text/plain; charset=utf-8` với nội dung `User-agent: *\nDisallow: /\n` và security headers.

3. **`apps/web/src/worker.test.ts`**:
   - Thêm test case:
     - GET `/robots.txt` trả về 200 `text/plain; charset=utf-8`, body `User-agent: *\nDisallow: /\n`.
     - GET `/robots.txt` khi ASSETS trả về 404: worker fallback vẫn trả về 200 với robots.txt hợp lệ và không trả về SPA HTML.

## Verification Commands
```bash
pnpm --filter web test
pnpm --filter web build
```
