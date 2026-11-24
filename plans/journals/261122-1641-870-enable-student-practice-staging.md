# Journal: Bật lại menu "Luyện tập" (và "Lịch sử") ở student trên staging (#870)

- **Date:** 2026-11-22
- **Issue:** #870 (liên quan #852)
- **Branch:** `vinh19410/enable-student-practice-staging` (target: `develop`)

## Context
Ở #852, menu "Luyện tập" (`/practice`) và "Lịch sử" (`/history`) trong `apps/student` đã bị ẩn mặc định qua cờ build-time `VITE_STUDENT_PRACTICE_ENABLED`. Trên môi trường staging (`lms.staging.teacheros.io.vn`), QA cần bật lại menu này để kiểm thử luồng tự luyện (dữ liệu từ vựng và study packs đã được seed tự động trong `deploy-staging.yml`), trong khi Production (`msmy.io.vn`) phải giữ mặc định tắt và chặn fail-closed.

## Key Decisions & Technical Findings
- **Tách tên biến hạ tầng `STUDENT_PRACTICE_ENABLED` khỏi `VITE_STUDENT_PRACTICE_ENABLED`:** `deploy-staging.yml` đặt `STUDENT_PRACTICE_ENABLED: "true"` riêng trong step `Deploy to Cloudflare (stage staging)` (least-privilege, cùng mẫu `AI_ENABLED` → `VITE_AI_ENABLED`), và `packages/infra/alchemy.run.ts` ánh xạ sang `VITE_STUDENT_PRACTICE_ENABLED` trong `Cloudflare.Website.Vite("lms", { env })`. Cách này ngăn `apps/lms/vite.config.ts` đọc tắt từ `process.env`, bảo đảm cờ luôn đi qua Alchemy state/memo và `config.define`.
- **Fail-closed trên Production & fail-loud khi cấu hình sai:** `resolveStudentPracticeEnabled(raw, appDomain)` trong `packages/infra/src/topology.ts` ném lỗi nếu bật `"true"` trên `PROD_APP_DOMAIN` (`msmy.io.vn`, cùng mẫu `resolveAssumeEmailVerified`) hoặc nhận giá trị non-empty ngoài `"true"`/`"false"`.
- **Phát hiện thực nghiệm cú pháp minifier Rolldown/Oxc (Vite 8):** Build thật `apps/lms` cho thấy Rolldown/Oxc nén chuỗi bằng dấu backtick (`` VITE_STUDENT_PRACTICE_ENABLED:`true` ``) thay vì nháy kép. Nhờ có build-time guard `bundleMatchesStudentPracticeFlag` trong `apps/lms/scripts/assemble-dist.mjs`, phát hiện này lộ ra ngay ở bước build local, từ đó regex ở cả `assemble-dist.mjs` và smoke check CI (`deploy-staging.yml`, `deploy.yml`) được mở rộng hỗ trợ cả `"`, `'`, và `` ` ``.
- **Smoke check fail-closed trên PROD:** Sau bước review độc lập, vòng quét `forbidden_pattern` trên `deploy.yml` được chuyển sang `curl -fsS` kèm nhánh trả lỗi khi tải chunk thất bại để không bỏ sót chunk bị lỗi mạng/HTTP.

## Verification
- Unit & contract tests: `@teacher-os/infra` (51/51), `lms` (50/50 kể cả khi chạy với ambient `VITE_STUDENT_PRACTICE_ENABLED=true`), `student` nav tests, `topology-drift`, `ci-workflow`, và toàn bộ `pnpm test`.
- Build thật `apps/lms`: xác minh cả chế độ staging (`true`), auto-rebuild stale dist (`true → false` không đặt `LMS_REBUILD_PORTALS`), và prod (`false`).
- `pnpm exec biome check .` (0 lỗi), `pnpm check-types` (14/14 tasks pass), `yaml.safe_load` cả 2 workflow pass.
