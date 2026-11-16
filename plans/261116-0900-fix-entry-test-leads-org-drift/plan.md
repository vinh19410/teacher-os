---
title: "fix(server): route public leads and placement submissions to active teacher org"
description: "Khắc phục lỗi lệch organization giữa LEAD_ORG_ID cũ và tổ chức hoạt động của TEACHER_EMAILS khiến bài nộp Entry Test (/kiem-tra-dau-vao/) và form /public/leads không hiển thị tại /leads của giáo viên."
status: pending
priority: P1
branch: "vinh19410/Debug-entry-test"
base_branch: "develop"
tags: ["bugfix", "server", "leads", "placement-test", "single-org", "pot"]
created: 2026-11-16
---

# Plan: Sửa lỗi lệch Organization (`LEAD_ORG_ID` vs `TEACHER_EMAILS`) khiến bài nộp Entry Test không hiện trên `/leads`

## Bối cảnh & Nguyên nhân gốc

- Chi tiết chẩn đoán: [debugger-261116-entry-test-leads-org-drift.md](../reports/debugger-261116-entry-test-leads-org-drift.md).
- Trên GitHub Environment `staging` (và `production`), `LEAD_ORG_ID` mang UUID của một organization QA cũ được tạo trước khi siết allowlist `TEACHER_EMAILS = "msthucmy@gmail.com"`.
- Khi giáo viên `msthucmy@gmail.com` đăng nhập qua `bootstrapMiddleware`, hệ thống tạo riêng một `organization` mới (`ctx.orgId != LEAD_ORG_ID`), còn các route công khai `POST /public/leads` và `POST /public/placement-test/submissions` lại bỏ qua `deps.teacherEmails` và chỉ ghi vào `deps.leadOrgId`. Kết quả là mọi bài nộp Entry Test rơi vào org QA bị khóa nên trang `/leads` của giáo viên không có dữ liệu.

## Hợp đồng phạm vi đã khóa với người dùng (`ask_question`)

1. **Routing dữ liệu (`A2`):**
   - Định tuyến toàn bộ `POST /public/leads` và `POST /public/placement-test/submissions` mới (kèm dedupe, `speaking-media`, `notifyNewLead`) về organization `FINANCE_ROLES` (`teacher`, `owner`, `admin`) đang hoạt động của `TEACHER_EMAILS`.
   - Nếu org giáo viên chưa tự phát hành bộ đề riêng (`published === null`), các endpoint công khai đọc đề/audio (`GET /public/placement-test`, lấy snapshot chấm `POST /submissions`, `GET /public/placement-test/audio/:id`, tra cứu `PUT .../speaking-media` và `GET /results/:token`) fallback sang `LEAD_ORG_ID`. Ngay khi giáo viên tự phát hành đề tại `/placement-test`, org giáo viên được ưu tiên tuyệt đối.
   - Giữ nguyên cầu dao fail-closed: khi `deps.leadOrgId?.trim()` rỗng thì trả ngay `503 LEAD_INTAKE_DISABLED` / `503 PLACEMENT_DISABLED` không chạm DB.
   - **Không** gộp hay làm lộ dữ liệu QA/smoke cũ nằm trong `LEAD_ORG_ID` cũ sang `/leads` của giáo viên.
2. **Chiến lược POT (`A1`):**
   - E2E Playwright (`placement-lead-org-drift.spec.ts`) tái hiện chính xác kịch bản lệch `LEAD_ORG_ID` vs `TEACHER_EMAILS`, chạy full luồng `/placement-test` → `/kiem-tra-dau-vao/` → `/leads` → chấm & xem `/kiem-tra-dau-vao/ket-qua/?t=<token>`, chụp ảnh POT 3 viewport (`1440×900`, `768×1024`, `375×812`) + modal chi tiết (light + dark).
   - Sau khi merge PR vào `develop` và `Deploy Staging` xanh, chạy Playwright nộp thật 1 bài Entry Test 5 kỹ năng lên `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/`, lưu biên nhận `201`/`200` + ảnh 3 viewport live staging, push ảnh và đăng comment POT đầy đủ lên GitHub Issue.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | TDD Unit, Integration & Server Lead Org Resolution | pending | [phase-01-server-lead-org-resolution.md](./phase-01-server-lead-org-resolution.md) |
| 2 | E2E Reproduction, POT Screenshots, Docs & Live Staging Verification | pending | [phase-02-e2e-pot-and-docs.md](./phase-02-e2e-pot-and-docs.md) |

## Acceptance Criteria

1. Hàm dùng chung `resolveLeadTargetOrg` và `loadPublishedPlacementSnapshot` trong `apps/server/src/lib/resolve-lead-org.ts`:
   - Trả `null` ngay khi `leadOrgId?.trim()` rỗng (giữ nguyên hợp đồng kill-switch `503`).
   - Trả `targetOrgId` = `membership.orgId` khớp `FINANCE_ROLES` (`teacher`, `owner`, `admin`) của `TEACHER_EMAILS` (không phân biệt hoa/thường email, bất kể `user.emailVerified`), ưu tiên theo thứ tự `teacherEmails` rồi `membership.createdAt ASC, membership.id ASC`; fallback `configuredLeadOrgId` khi chưa có membership phù hợp.
   - `loadPublishedPlacementSnapshot` ưu tiên snapshot `published` hợp lệ của `targetOrgId`, fallback sang `configuredLeadOrgId`.
2. `POST /public/leads` (`public-leads.ts`), toàn bộ route trong `publicPlacementTestRoutes` (`public-placement-test.ts`), `kernelRoutes` (`kernel.ts`), và `GET /api/placement-test` (`placement-test.ts`) dùng thống nhất `resolveLeadTargetOrg` + `teacherEmails`.
3. Toàn bộ test server (`pnpm --filter server test`), lint (`pnpm exec biome check .`), types (`CI=1 pnpm check-types`), test toàn repo (`CI=1 pnpm test`) và build (`CI=1 pnpm build`) xanh.
4. E2E `placement-lead-org-drift.spec.ts` + `profile-placement-test.spec.ts` + `profile-lead-intake.spec.ts` pass xanh, không tràn ngang ở `1440×900`, `768×1024`, `375×812`, `320×568`, chụp đủ bộ ảnh POT `/leads`.
5. `docs/production-release-runbook.md` và `CHANGELOG.md` được cập nhật chính xác.
6. PR nhắm vào `develop` được review (`code-reviewer`), CI xanh, merge xong và workflow `Deploy Staging` xanh; nộp 1 bài Entry Test thật lên `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/` trả `201`/`200` + ảnh live 3 viewport + comment POT đầy đủ trên GitHub Issue.

## Red Team Review

Kết quả rà soát độc lập bởi `code-reviewer` trên plan và mã nguồn server (`app.ts`, `public-leads.ts`, `public-placement-test.ts`, `placement-test.ts`, `kernel.ts`) & kết quả kiểm chứng tiếp theo:

| # | Phát hiện | Mức độ | Xử lý |
|---|-----------|--------|-------|
| 1 | Kiểu `deps` ở `buildApp` (`app.ts:435,437,486`) & `kernelRoutes` (`kernel.ts:158`): `buildApp` truyền nguyên `deps` đã có `teacherEmails`, nhưng `kernelRoutes` cần bổ sung `teacherEmails?: string[]` vào type để truyền xuống `placementTestRoutes`. | Important | Accept — đã bổ sung tường minh ở Phase 1. |
| 2 | Đối chiếu `leads.ts` và `run-placement-grading.ts` xem có chỗ nào đọc nhầm `deps.leadOrgId` thay vì `ctx.orgId` / `sub.orgId`. | Important | Verified — `leads.ts` hoàn toàn query theo `ctx.orgId`; `run-placement-grading.ts` query theo `sub.id` duy nhất và `sub.speakingMediaKey`. |
| 3 | Lệch đề giữa phiên làm bài nếu giáo viên bấm Phát hành ở `org-teacher` ngay khi thí sinh vừa tải đề fallback từ `LEAD_ORG_ID`. | Minor | Accept trade-off — phát hành là hành vi chủ động của giáo viên; `PUT .../speaking-media` và `GET /results/:token` vẫn an toàn nhờ `allowedOrgIds` + `sub.orgId`. |
| 4 | Upload audio mới trên `/placement-test` luôn gắn với `ctx.orgId` (`org-teacher`), nên giáo viên dùng "Nhập đề gốc" sẽ upload audio qua `PUT /api/placement-test/audio` về org mình; giữ thứ tự ưu tiên `normalizedEmails.indexOf` + `createdAt ASC` giữ ổn định khi thêm email phụ cuối danh sách. | Minor | Accept — không chặn luồng hiện tại. |
| 5 | **Bẫy `signUpViaApi` trong Playwright `placement-lead-org-drift.spec.ts`:** `page.request` đi thẳng qua mạng, bỏ qua `context.route(\`\${API_ORIGIN}/**\`)`. | Critical | Accept — Phase 2 dùng `signUpViaUi(page, ...)` (qua browser `fetch`) để mọi request auth/kernel đi trọn vào `isolatedApp.fetch` cô lập! |

## Validation Log

- `2026-11-16`: `ak plan validate ./plans/261116-0900-fix-entry-test-leads-org-drift` → `[OK] ... is a valid plan directory` (và `ak plan reindex` nhận diện `recognized`).
- `2026-11-16`: Đối chiếu xong `apps/server/src/routes/leads.ts` (`PATCH /:id/placement-submission`, xác nhận không dùng `POST .../grade`) và `apps/server/src/lib/placement-ai/run-placement-grading.ts`.
