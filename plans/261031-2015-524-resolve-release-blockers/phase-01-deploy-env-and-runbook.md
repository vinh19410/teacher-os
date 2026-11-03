---
phase: 1
title: "Map biến deploy, chuẩn hóa LEAD_ORIGINS và cập nhật runbook"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Map biến deploy, chuẩn hóa `LEAD_ORIGINS` và cập nhật runbook

## Goal

Đảm bảo `.github/workflows/deploy-staging.yml` và `.github/workflows/deploy.yml` truyền `LEAD_ORG_ID` và `LEAD_ORIGINS` vào bước `alchemy deploy`, chuẩn hóa `LEAD_ORIGINS` (và `.trim()` `LEAD_ORG_ID`) để biến GitHub Environment chưa đặt (`""`) hoặc chỉ chứa khoảng trắng/dấu phẩy không bao giờ làm mất origin mặc định `https://msmy.io.vn,https://www.msmy.io.vn` hay gây lỗi FK 500, và cập nhật runbook vận hành cho `TEACHER_EMAILS` (kèm cổng kiểm tra `email_verified = 1`) và `LEAD_ORG_ID`.

## Files to Create / Modify

- Modify: `packages/infra/src/topology.ts`
- Modify: `packages/infra/src/topology.test.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/server/src/routes/public-leads.ts`
- Modify: `apps/server/src/routes/placement-test.ts`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/topology-drift.test.mjs`
- Modify: `docs/production-release-runbook.md`

## Tasks & Steps

### Task 1.1 — Viết test TDD (Red) cho `resolveLeadOrigins` và workflow drift

- **Goal:** Tạo test kiểm tra chuẩn hóa `LEAD_ORIGINS` trong `packages/infra/src/topology.test.ts` và test kiểm tra `.github/workflows/deploy.yml` + `deploy-staging.yml` + `packages/infra/alchemy.run.ts` trong `scripts/topology-drift.test.mjs`. <!-- Updated: Red Team RT-5 -->
- **Target files and symbols:**
  - `packages/infra/src/topology.test.ts` (import `DEFAULT_PROD_LEAD_ORIGINS`, `DEFAULT_DEV_LEAD_ORIGINS`, `resolveLeadOrigins` từ `./topology`)
  - `scripts/topology-drift.test.mjs` (thêm test `"deploy workflows pass LEAD_ORG_ID and LEAD_ORIGINS to alchemy deploy"`)
- **Steps:**
  1. Trong `packages/infra/src/topology.test.ts`, thêm `describe("resolveLeadOrigins (#524)", ...)` kiểm tra:
     - Khi `hasTopology: true`: `undefined`, `""`, `"   "`, `" , , "` đều trả về `DEFAULT_PROD_LEAD_ORIGINS` (`"https://msmy.io.vn,https://www.msmy.io.vn"`).
     - Khi `hasTopology: true` và `raw = " https://profile.staging.teacheros.io.vn , https://msmy.io.vn "`: trả về chuỗi đã lọc và nối `"https://profile.staging.teacheros.io.vn,https://msmy.io.vn"`.
     - Khi `hasTopology: false, isDev: true`: `undefined`, `""`, `" , "` trả về `DEFAULT_DEV_LEAD_ORIGINS` (`"http://localhost:8005"`).
     - Khi `hasTopology: false, isDev: false`: `undefined` hoặc `""` ném lỗi `/LEAD_ORIGINS must be set/`.
  2. Trong `scripts/topology-drift.test.mjs`, thêm test cắt khối bước `Deploy to Cloudflare` trong cả `.github/workflows/deploy.yml` và `.github/workflows/deploy-staging.yml`, assert khối đó chứa `LEAD_ORG_ID: ${{ vars.LEAD_ORG_ID }}` và `LEAD_ORIGINS: ${{ vars.LEAD_ORIGINS }}`, đồng thời assert `packages/infra/alchemy.run.ts` gọi `resolveLeadOrigins(`. <!-- Updated: Red Team RT-5 -->
- **Success criteria:** Cả hai bộ test đều fail vì `resolveLeadOrigins` chưa tồn tại và workflow chưa có biến.
- **Verify:** `pnpm --filter @teacher-os/infra test` exits non-zero (Red phase); `node --test scripts/topology-drift.test.mjs` exits non-zero (Red phase).

### Task 1.2 — Hiện thực `resolveLeadOrigins`, trim `LEAD_ORG_ID` và nối vào `alchemy.run.ts` + workflows (Green)

- **Goal:** Hiện thực `resolveLeadOrigins` trong `packages/infra/src/topology.ts`, sử dụng trong `packages/infra/alchemy.run.ts` cùng `(process.env.LEAD_ORG_ID ?? "").trim()`, đồng bộ `.trim()` cho `leadOrgId` ở `public-leads.ts` và `placement-test.ts`, và truyền `LEAD_ORG_ID` + `LEAD_ORIGINS` trong `.github/workflows/deploy-staging.yml` và `.github/workflows/deploy.yml`. <!-- Updated: Red Team RT-5 -->
- **Target files and symbols:**
  - `packages/infra/src/topology.ts` (hằng `DEFAULT_PROD_LEAD_ORIGINS`, `DEFAULT_DEV_LEAD_ORIGINS`, hàm `resolveLeadOrigins`)
  - `packages/infra/alchemy.run.ts` (biến `leadOrigins`, `leadOrgId`)
  - `apps/server/src/routes/public-leads.ts` (`leadOrgId` trim tại dòng 96)
  - `apps/server/src/routes/placement-test.ts` (`leadOrgId` trim tại dòng 164)
  - `.github/workflows/deploy-staging.yml` (khối `env:` của step `Deploy to Cloudflare (stage staging)`)
  - `.github/workflows/deploy.yml` (khối `env:` của step `Deploy to Cloudflare (stage prod)`)
- **Steps:**
  1. Trong `packages/infra/src/topology.ts`, export:
     - `export const DEFAULT_PROD_LEAD_ORIGINS = "https://msmy.io.vn,https://www.msmy.io.vn";`
     - `export const DEFAULT_DEV_LEAD_ORIGINS = "http://localhost:8005";`
     - `export function resolveLeadOrigins(raw: string | undefined, options: { hasTopology: boolean; isDev: boolean }): string` — tách `raw` theo dấu phẩy, trim và bỏ phần tử rỗng; nếu có ít nhất 1 origin thì trả `entries.join(",")`; nếu rỗng thì khi `options.hasTopology` trả `DEFAULT_PROD_LEAD_ORIGINS`, khi `options.isDev` trả `DEFAULT_DEV_LEAD_ORIGINS`, ngược lại `throw new Error("LEAD_ORIGINS must be set when deploying without APP_DOMAIN")`.
  2. Trong `packages/infra/alchemy.run.ts`, import `resolveLeadOrigins` từ `./src/topology.ts`, tính `const leadOrgId = (process.env.LEAD_ORG_ID ?? "").trim();` và `const leadOrigins = resolveLeadOrigins(process.env.LEAD_ORIGINS, { hasTopology: Boolean(topology), isDev: isDevCommand });`, rồi gán `LEAD_ORG_ID: leadOrgId` và `LEAD_ORIGINS: leadOrigins` trong `server` Worker `env`. Đồng thời dùng `deps.leadOrgId?.trim() ?? ""` tại `apps/server/src/routes/public-leads.ts:96` và `deps.leadOrgId?.trim()` tại `apps/server/src/routes/placement-test.ts:164`. <!-- Updated: Red Team RT-5 -->
  3. Trong `.github/workflows/deploy-staging.yml` (ngay dưới `TEACHER_EMAILS: ${{ vars.TEACHER_EMAILS }}`) và `.github/workflows/deploy.yml` (ngay dưới `TEACHER_EMAILS: ${{ vars.TEACHER_EMAILS }}`), thêm:
     ```yaml
          LEAD_ORG_ID: ${{ vars.LEAD_ORG_ID }}
          LEAD_ORIGINS: ${{ vars.LEAD_ORIGINS }}
     ```
- **Success criteria:** Unit test của `@teacher-os/infra` và `topology-drift.test.mjs` đều pass.
- **Verify:** `pnpm --filter @teacher-os/infra test && node --test scripts/topology-drift.test.mjs` exits 0.

### Task 1.3 — Cập nhật `docs/production-release-runbook.md` cho cổng preflight `TEACHER_EMAILS` và `LEAD_ORG_ID`

- **Goal:** Bổ sung cổng preflight cứng kiểm tra tài khoản trong `TEACHER_EMAILS` đã tồn tại với `role = 'teacher'` và `email_verified = 1` trên D1 production và hướng dẫn đặt `LEAD_ORG_ID` / `LEAD_ORIGINS` trên GitHub Environment `staging` và `production`. <!-- Updated: Red Team RT-4 -->
- **Target files and symbols:**
  - `docs/production-release-runbook.md` (mục `## Lead intake — form đăng ký msmy.io.vn (#506)` và mục `### Single-org allowlist giáo viên (TEACHER_EMAILS, #513)`)
- **Steps:**
  1. Tại mục `## Lead intake — form đăng ký msmy.io.vn (#506)`, ghi rõ `deploy-staging.yml` và `deploy.yml` đọc `vars.LEAD_ORG_ID` và `vars.LEAD_ORIGINS` từ GitHub Environment tương ứng (`staging` / `production`), kèm lệnh:
     - `gh variable set LEAD_ORG_ID --env staging --body "<org-id-staging>"`
     - `gh variable set LEAD_ORG_ID --env production --body "<org-id-co-my>"`
     - Giải thích rằng `LEAD_ORIGINS` để trống sẽ tự nhận mặc định `https://msmy.io.vn,https://www.msmy.io.vn` nhờ `resolveLeadOrigins`.
  2. Tại mục `### Single-org allowlist giáo viên (TEACHER_EMAILS, #513)`, cập nhật bước 1 thành cổng preflight bắt buộc:
     - Chạy `SELECT id, email, email_verified, created_at FROM user WHERE role = 'teacher';` trên D1 production.
     - **Hard Gate trước khi deploy:** Mọi email đưa vào `TEACHER_EMAILS` **bắt buộc phải đã có dòng `user` (`role = 'teacher'`) VÀ `email_verified = 1`** trên D1 production (vì `bootstrapMiddleware` chặn mọi tài khoản có `emailVerified !== true` bằng 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` để chống đăng ký chiếm chỗ). Nếu tài khoản chủ app đã tồn tại nhưng `email_verified = 0`, chủ app phải xác thực email qua link xác thực (hoặc nếu cập nhật D1 thủ công thì phải xóa toàn bộ session cũ của user đó bằng `DELETE FROM session WHERE user_id = '<id>';` để loại trừ session chiếm chỗ) trước khi deploy. <!-- Updated: Red Team RT-4 -->
- **Success criteria:** Runbook chứa truy vấn `email_verified` và lệnh `gh variable set LEAD_ORG_ID`.
- **Verify:** `grep -c "email_verified" docs/production-release-runbook.md` prints a number >= 2, and `grep -c "gh variable set LEAD_ORG_ID" docs/production-release-runbook.md` prints a number >= 1.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
