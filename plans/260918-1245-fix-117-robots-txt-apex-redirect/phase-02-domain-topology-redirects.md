# Phase 02: Domain topology redirects and worker host redirect

**Status: Completed**

## Objective
Cấu hình apex domain (`teacheros.io.vn`) và `www.teacheros.io.vn` trong Cloudflare infrastructure để Alchemy tự động provision DNS records (A/AAAA/CNAME) và Cloudflare Dynamic Redirect 301 về `https://app.teacheros.io.vn`. Đồng thời, bổ sung cơ chế host redirection defense-in-depth trong Worker.

## Proposed Changes

1. **`packages/infra/src/topology.ts`**:
   - Thêm thuộc tính `appRedirects: string[]` vào interface `DomainTopology`.
   - Trong `resolveDomainTopology(appDomain)`:
     - Nếu `domain === PROD_APP_DOMAIN` (tức `teacheros.io.vn`):
       - `appRedirects: [PROD_APP_DOMAIN, `www.${PROD_APP_DOMAIN}`]` (tức `["teacheros.io.vn", "www.teacheros.io.vn"]`).
     - Với các domain khác (ví dụ `staging.teacheros.io.vn`):
       - `appRedirects: [domain]` (tức `["staging.teacheros.io.vn"]`).
     - Với domain apex bất kỳ không phải subdomain:
       - Có thể hỗ trợ `[domain, `www.${domain}`]`.

2. **`packages/infra/alchemy.run.ts`**:
   - Thay đổi cấu hình domain của `web` Worker từ:
     ```ts
     ...(topology && { domain: topology.appHost, workersDev: false }),
     ```
     thành:
     ```ts
     ...(topology && {
         domain: {
             name: topology.appHost,
             redirects: topology.appRedirects,
         },
         workersDev: false,
     }),
     ```

3. **`apps/web/src/security-headers.ts` & `worker.ts`**:
   - Trong `security-headers.ts`: Thêm helper `shouldRedirectHost(request: Request): string | null` (hoặc mở rộng `shouldRedirectRequest`):
     - Kiểm tra nếu `url.hostname` là apex hoặc www (ví dụ `teacheros.io.vn`, `www.teacheros.io.vn`, `staging.teacheros.io.vn`, hoặc bất kỳ host nào bắt đầu bằng `www.`):
       - Tính toán canonical target host: `app.teacheros.io.vn` (hoặc `app.staging.teacheros.io.vn`).
       - Nếu khác `url.hostname`: trả về URL đã đổi sang `https://${targetHost}...`.
   - Trong `worker.ts`:
     - Kiểm tra redirect trước khi xử lý route (gộp cùng hoặc ngay sau `shouldRedirectToHttps`):
     - Trả về HTTP 301 Moved Permanently kèm HSTS header và Location header.

4. **Tests**:
   - `packages/infra/src/topology.test.ts`: Kiểm tra `appRedirects` cho prod (`teacheros.io.vn`) và staging (`staging.teacheros.io.vn`).
   - `apps/web/src/worker.test.ts`: Kiểm tra redirect 301 khi gửi request tới `http://teacheros.io.vn`, `https://teacheros.io.vn`, `http://www.teacheros.io.vn`, `https://www.teacheros.io.vn`.

## Verification Commands
```bash
pnpm --filter @teacher-os/infra test
pnpm --filter web test
pnpm test
pnpm check
pnpm check-types
```
