---
title: "Single-org theo chính sách: chỉ giáo viên chủ dùng app, giữ nguyên schema multi-org"
description: "Khoá đăng ký và truy cập app giáo viên bằng allowlist TEACHER_EMAILS (fail-closed trên production), giữ nguyên orgId/membership, và chỉnh roadmap về phục vụ một giáo viên trước khi thương mại hoá."
status: pending
priority: P2
effort: 5h
issue: 513
branch: develop
tags: [feature, backend, auth, infra, docs]
blockedBy: []
blocks: []
created: 2026-10-31
---

# Single-org theo chính sách

## Overview

Chủ dự án muốn app giáo viên chỉ phục vụ chính mình. Khi app đã chạy tốt cho mình thì mới mở public/thương mại cho các giáo viên khác. Brainstorm ngày 2026-10-31 chốt hướng: **single-org bằng chính sách, không đổi cấu trúc schema**.

Lý do không gỡ `orgId`:

- `orgId`/`organizationId` xuất hiện khoảng 2.379 lần trong 168 file và có mặt trong hầu hết bảng nghiệp vụ trên D1 production.
- Gỡ ra thì khi thương mại hoá phải gắn lại phân tách tenant, đây là việc khó retrofit nhất.
- Phía giáo viên vốn đã chạy single-org: `bootstrapMiddleware` ([app.ts:183](../../apps/server/src/app.ts)) tự tạo một org cho giáo viên mới rồi luôn lấy membership đầu tiên. Web giáo viên không có chỗ đổi org.

Lỗ hổng duy nhất so với mục tiêu: **ai cũng đăng ký được tài khoản giáo viên** và tự có org trên production. Plan này đóng lỗ đó bằng allowlist email theo đúng pattern `ADMIN_EMAILS` (plan #413), rồi chỉnh tài liệu và roadmap.

## Quyết định đã chốt với user (2026-10-31)

| Câu hỏi | Quyết định |
|---|---|
| Đổi cấu trúc schema sang single-org? | Không. Giữ `organization`, `membership`, `orgId` và các test phân tách org. |
| Học viên có học ở nơi khác dùng Teacher OS không? | Không, chỉ học viên của chủ app. |
| Org-switcher của app student | **Không cần sửa code.** `TeamSwitcher` chỉ hiện dropdown khi `orgs.length > 1` ([team-switcher.tsx:49](../../packages/ui/src/components/app-shell/team-switcher.tsx)); một org thì chỉ hiện nhãn tên org (`org-switcher-single`). Học viên chỉ thuộc org của chủ app nên không bao giờ thấy dropdown. |
| Landing, profile, bài kiểm tra đầu vào | Giữ nguyên, không đụng. |
| Đăng ký học viên trên portal | Giữ mở (mặc định đề xuất, user chưa phản hồi). Người lạ đăng ký được nhưng không có lời mời thì không vào lớp nào và không thấy dữ liệu. |
| Gói subscription/credit AI (giai đoạn A0) và nhiều nhân sự (giai đoạn C) | Hoãn tới khi qua cổng "chạy tốt cho tôi". |

## Quyết định kỹ thuật

- **Binding mới `TEACHER_EMAILS`** (danh sách email phân tách dấu phẩy, so khớp lowercase).
  - **Rỗng = không giới hạn.** Giữ hành vi hiện tại cho dev, e2e và staging, nơi test tạo tài khoản giáo viên với email ngẫu nhiên. Ngược nghĩa với `ADMIN_EMAILS`, và điều này có chủ ý.
  - **Fail-closed trên production:** deploy với `APP_DOMAIN === PROD_APP_DOMAIN` mà `TEACHER_EMAILS` rỗng thì alchemy ném lỗi, giống `resolveAssumeEmailVerified` ([topology.ts:115](../../packages/infra/src/topology.ts)). Nhờ vậy production không thể vô tình mở đăng ký.
- **Hai lớp gate:**
  1. `databaseHooks.user.create.before` ([auth index.ts](../../packages/auth/src/index.ts)): sign-up role `teacher` (email/password lẫn Google callback) với email ngoài allowlist bị 403 `TEACHER_SIGNUP_FORBIDDEN`.
  2. `bootstrapMiddleware` mỗi request: session teacher có email ngoài allowlist bị 403 `ACCOUNT_TEACHER_NOT_ALLOWED`, **trước** khi tạo org. Lớp này chặn cả tài khoản teacher lạ đã tồn tại trên production, và gỡ email khỏi danh sách là mất quyền ngay.
- **Web:** mã 403 mới đi vào cùng lối thoát "role-blocked" như `ACCOUNT_STUDENT_ROLE` (`isStudentRoleRejected` ở [kernel.ts:684](../../apps/web/src/lib/repos/kernel.ts)), nên không phát sinh màn hình lỗi chung chung.
- **Extension trace (tenant thứ hai khi thương mại hoá):** contract giữ nguyên gồm `orgId` trên mọi bảng, `kernelCtx.orgId` và test phân tách org. Khi mở public chỉ cần bỏ trống `TEACHER_EMAILS` (sau khi đổi rule fail-closed) hoặc thay bằng cơ chế mời/billing. Không phải sửa schema hay query. Không thêm registry, cờ mode hay config layer nào.

## Phases

| # | Phase | Trạng thái | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Allowlist email giáo viên](phase-01-teacher-email-allowlist.md) | pending | 4h | — |
| 2 | [Tài liệu, runbook và roadmap](phase-02-docs-runbook-roadmap.md) | pending | 1h | 1 |

## Acceptance criteria

- [ ] Sign-up role teacher với email ngoài `TEACHER_EMAILS` (đã set) bị 403 `TEACHER_SIGNUP_FORBIDDEN`. Có unit test trong `packages/auth`.
- [ ] Session teacher có email ngoài `TEACHER_EMAILS` (đã set) gọi kernel API thì nhận 403 `ACCOUNT_TEACHER_NOT_ALLOWED`, và không có row `organization`/`membership` mới. Có test server.
- [ ] `TEACHER_EMAILS` rỗng thì hành vi y như cũ: toàn bộ test server và e2e hiện có vẫn xanh.
- [ ] `resolveTeacherEmails("", PROD_APP_DOMAIN)` ném lỗi. Có test trong `packages/infra`.
- [ ] Web hiển thị màn hình role-blocked khi gặp mã mới. Có test transport trong `apps/web`.
- [ ] Runbook, `.env.example` và roadmap được cập nhật, gồm cổng "chạy tốt cho tôi" trước khi thương mại hoá.
- [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` và e2e đầy đủ đều xanh.

## Non-goals

- Không xoá hay đổi `orgId`, `organization`, `membership`. Không viết migration D1.
- Không sửa org-switcher học viên, đăng ký học viên, landing, profile hay bài kiểm tra đầu vào.
- Không làm billing/subscription, mời nhân sự hay phân quyền.
- Không xoá tài khoản teacher lạ (nếu có) trên production. Gate mỗi request đã chặn họ; việc dọn dữ liệu là quyết định riêng của user.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Quên set `TEACHER_EMAILS` khi deploy production | Alchemy fail-closed trên `PROD_APP_DOMAIN` (task 1.1). |
| Chủ app tự khoá mình vì gõ sai email | Runbook yêu cầu đối chiếu email với `SELECT email FROM user WHERE role='teacher'` trước khi deploy. Sửa binding là mở lại ngay. |
| Gmail có dấu chấm hoặc `+alias` lệch với email đã lưu | So khớp lowercase chính xác như `ADMIN_EMAILS`. Runbook ghi rõ: dùng đúng email hiển thị trong bảng `user`. |

## Handover

Plan được viết theo contract `--advice`: mỗi phase tách task kèm Verify bằng lệnh có điều kiện pass cụ thể, và có khối Failure Protocol. Executor dừng và escalate khi có bước Verify fail; đó là hành vi mong muốn, không phải bị kẹt.

## Câu hỏi còn mở

- Đăng ký học viên: giữ mở (mặc định trong plan) hay chỉ cho đăng ký khi có lời mời?
- Ngưỡng cụ thể của cổng "chạy tốt cho tôi" (phase 2 đề xuất giá trị mặc định, user chỉnh lại).
