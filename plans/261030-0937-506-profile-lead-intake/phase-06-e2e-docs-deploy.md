---
phase: 6
title: "E2E, docs, cấu hình deploy"
status: completed
priority: P2
effort: "0.3d"
dependencies: [2, 3, 4, 5]
---

# Phase 6: E2E, docs, deploy config

## Goal
Chứng minh luồng đầu-cuối (profile gửi → web thấy lead) và ghi lại cấu hình vận hành.

## Files to Create / Modify
- Create: `apps/e2e/specs/profile-lead-intake.spec.ts`
- Modify: `apps/e2e/playwright.config.ts` / `apps/e2e/devserver-services.mjs` — thêm service profile ở port `E2E_PROFILE_PORT=8105` với `LEAD_API_URL=http://localhost:8100`
- Modify: `apps/e2e/specs/origins.ts` (origin profile)
- Modify: `docs/production-release-runbook.md` — env `LEAD_ORG_ID`, `LEAD_ORIGINS`, bước backup D1 trước migrate, WAF rule tùy chọn
- Modify: `docs/codebase-summary.md` — apps/profile gửi lead tới `/public/leads`; route `/leads` web
- Modify: `AGENTS.md` — port e2e 8105 cho profile (mục Lưu ý vận hành)

## Tasks & Steps
1. Spec e2e: mở profile, điền chỉ Tên + SĐT, gửi ⇒ thấy màn thành công; đăng nhập web bằng teacher seed của org `leadOrgId` ⇒ `/leads` có dòng mới, đổi trạng thái "Đã liên hệ" ⇒ chip đếm cập nhật; `recordingMailer` có đúng 1 email "Đăng ký học mới" không chứa SĐT. Case 2: gửi lại cùng SĐT ⇒ vẫn 1 dòng, "2 lần gửi". Case 3: chặn route `**/public/leads` trả 500 ⇒ thấy fallback copy-Zalo, dữ liệu còn nguyên.
2. Deploy runbook:
   - Backup: `wrangler d1 export <db> --remote --output backup-<date>.sql` trước khi apply migration `lead`.
   - Đặt `LEAD_ORG_ID` = `organization.id` của cô Mỹ (query D1 theo email teacher), `LEAD_ORIGINS` để mặc định.
   - Deploy apps/profile với `LEAD_API_URL=https://api.teacheros.io.vn pnpm --filter profile build`.
   - Tùy chọn: WAF rate limiting rule zone teacheros.io.vn cho `/public/leads`.
3. Chạy full gate trước merge (memory: full e2e trước squash-merge vào develop).

## Verification
- `pnpm --filter e2e e2e -- profile-lead-intake` (port override theo AGENTS.md)
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`
- Full `pnpm --filter e2e e2e` trước khi merge
