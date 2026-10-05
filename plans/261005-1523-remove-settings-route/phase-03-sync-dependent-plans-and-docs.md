---
phase: 3
title: "Đồng bộ plan phụ thuộc, docs, verify"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Đồng bộ plan phụ thuộc, docs, verify

## Goal
Các plan đang mở không còn trỏ tới trang/module đã xoá; CHANGELOG ghi nhận việc gỡ; toàn bộ gate local xanh.

## Files to Create / Modify
- Modify: `plans/261005-0754-sepay-bank-hub-tuition-qr/plan.md` (:20, :38, :72), `phase-02-teacher-bank-linking.md` (:14, :26, :52, :88-89, :115), `phase-05-tuition-and-portal-ui.md` (:45), `phase-06-e2e-sandbox-and-docs.md` (:38) — thay "Cài đặt → tab Nhận học phí" / `settings.tsx` / `/settings?tab=payments` bằng **đề xuất** trang riêng `/payments` ("Nhận học phí": route `apps/web/src/routes/_auth/payments.tsx`, mục sidebar, entry `routes-matcher.ts` + `app-shell.tsx`). Đánh dấu `<!-- Updated: settings route removed 2026-10-05 -->`.
- Modify: `plans/261005-1234-teacher-grade-writing-speaking-submissions/phase-03-web-grading-ui.md:64` — `getApiBaseUrl()` lấy từ `./api-base-url`; `:65` — precedent query key `["kernel", "settings"]` không còn (`repos/settings.ts` đã xoá) → trỏ sang precedent query key còn tồn tại (vd `pendingInvitationsQueryKey` trong `invitations.ts:10`); `:168` precedent `validateSettingsSearch` không còn → trỏ sang precedent `validateSearch` khác còn tồn tại (kiểm tra file route thật, vd login/profile/schedule, trước khi ghi). `plan.md:160` cập nhật claim `validateSettingsSearch` + các cite `kernel.ts:91-109`, `kernel.ts:2120-2123` sẽ lệch ~135 dòng sau khi phase 2 xoá handler — đổi sang anchor theo symbol (vd `kernel.use("*")`, `kernel.route("/assignments", …)`) thay vì số dòng.
- Modify: `CHANGELOG.md` — mục ngày merge, nhóm `### Removed`: "Gỡ trang Cài đặt (`/settings`) và API `/api/kernel/settings` — chưa tính năng nào dùng workspace settings; bảng DB giữ nguyên."
- Modify: `docs/project-roadmap.md:85` (claim "settings persist đã lên production") và `:100` (ứng viên M5 "settings persist") — ghi chú feature đã bị gỡ 2026-10-05 (issue #321), không xoá lịch sử release.
- Modify: frontmatter 2 plan phụ thuộc (SePay + chấm bài) — thêm `blockedBy` trỏ plan này + banner cảnh báo đầu file. **Làm ngay từ commit đầu của branch** (Quyết định #3), không đợi phase 3.
- GitHub: comment lên #320 tóm tắt thay đổi chỗ đặt UI, kèm link PR. Đề xuất `/payments` phải nêu rõ quan hệ với route `/tuition` đang tồn tại (`routes-matcher.ts` có `"/tuition": true`; server có `/classes/:id/tuition-fee` + invoices) — gắn panel SePay vào `/tuition` hoặc khác biệt hoá rõ route mới, tránh 2 route money trùng semantic.
- Điều phối worktree (trước khi comment #320): `git worktree list` — nếu branch SePay/chấm bài đã có commit thì phối hợp merge order (merge removal trước, SePay rebase); nếu chưa (0 commit phía trước develop) thì edit plan text trên branch này là đủ.

## Tasks & Steps
- [ ] 1. Sửa plan SePay + plan chấm bài như trên; grep `settings`, `Cài đặt\|Mẫu tin Zalo` và `kernel", "settings` trong 2 thư mục plan đó chỉ còn khớp ghi chú cập nhật (chuỗi tiếng Việt "Cài đặt" không khớp grep "settings" — SePay `plan.md:20,38,72` và `phase-06:38` chỉ chứa chữ "Cài đặt").
- [ ] 2. Thêm mục CHANGELOG.
- [ ] 3. Chạy full gate local (PR vào `develop` không có CI): `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test`.
- [ ] 4. E2E: `grep -rln "settings" apps/e2e --include='*.ts'` — nếu có spec đụng `/settings` thì sửa; sau đó `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- [ ] 5. Comment lên #320.

## Verification
- Tất cả lệnh ở bước 3–4 xanh.
- Grep `/settings`, `repos/settings`, `settings.tsx`, `Cài đặt`, `kernel", "settings` trong `plans/261005-0754-*` và `plans/261005-1234-*` không còn chỉ dẫn thực thi trỏ tới code đã xoá.
