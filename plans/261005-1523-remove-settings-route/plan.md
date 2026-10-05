---
title: "Remove /settings route"
description: "Gỡ trang Cài đặt (/settings) cùng endpoint /api/kernel/settings và contract zod vì không tính năng nào dùng workspace settings; giữ bảng DB workspace_settings."
status: completed
priority: P2
effort: "0.5d"
branch: chore/remove-settings-route
tags: [frontend, backend, cleanup]
blockedBy: []
blocks: []
created: 2026-10-05
issue: 321
linked-pr: 324
---

# Remove /settings route

## Overview

Trang `/settings` (4 tab: Tài khoản, Mẫu tin Zalo, Quy tắc, Dữ liệu) chỉ ghi/đọc bảng `workspace_settings` qua `/api/kernel/settings`. Đã xác minh **không có logic nào khác** ở server hay web đọc các giá trị này (`defaultUnitPrice`, `tpl*`, quy tắc vắng/nhắc): grep `workspaceSettings|defaultUnitPrice|tplReminder|...` chỉ khớp chính route, repo web, handler `kernel.ts:332-463`, contract và test. Tab "Dữ liệu" vẫn chọn được nhưng chỉ chứa các nút export disabled; nút "Quản lý thanh toán" disabled (`settings.tsx:209-210, :490-493`). Giữ lại chỉ gây hiểu nhầm cho giáo viên.

## Quyết định đã chốt (user, 2026-10-05)

1. **Phạm vi: web + API, giữ bảng DB.** Xoá route, sidebar, repo web, endpoint `/api/kernel/settings` (GET/PUT/POST) và `workspaceSettingsSchema`/`workspaceSettingsUpdateSchema`. Giữ `packages/db/src/schema/settings.ts` + bảng `workspace_settings` — không migration, dữ liệu còn nguyên, khôi phục bằng revert.
2. **Plan SePay (#320) phải đổi chỗ đặt UI liên kết ngân hàng** — không còn tab `/settings?tab=payments`; plan này cập nhật plan SePay và comment lên #320.
3. **Phối hợp plan phụ thuộc (red-team 2026-10-05):** plan SePay (#320) và plan chấm bài đều `pending` với worktree branch đã cut sẵn — chặn thực thi của chúng cho tới khi plan này merge: sửa frontmatter `blockedBy` + banner cảnh báo trong 2 plan đó ngay từ commit đầu của branch (không đợi phase 3), và đăng comment phối hợp lên #320 khi mở PR.

## Scope Challenge

- **Đã có:** `getApiBaseUrl()` đang nằm trong `lib/repos/settings.ts` nhưng là helper dùng chung (`invitations.ts`, `invitations.test.ts`, plan chấm bài phase 3) → tách sang `lib/repos/api-base-url.ts` thay vì xoá.
- **Yêu cầu:** gỡ path `/settings`. Không thêm trang thay thế, không redirect riêng — `/settings` rơi vào luồng route không hợp lệ sẵn có (`routes-matcher.ts`).
- **Ngoài phạm vi:** drop bảng DB; sửa các plan đã `completed`; các mục CHANGELOG lịch sử.
- **Độ phức tạp:** ~14 file chạm, toàn bộ là xoá/đổi import; 3 phase tuần tự. Mode: fast.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Gỡ trang /settings phía web | completed | [phase-01-remove-web-settings-route.md](phase-01-remove-web-settings-route.md) |
| 2 | Gỡ endpoint + contract settings phía server | completed | [phase-02-remove-settings-api-and-contract.md](phase-02-remove-settings-api-and-contract.md) |
| 3 | Đồng bộ plan phụ thuộc, docs, verify | completed | [phase-03-sync-dependent-plans-and-docs.md](phase-03-sync-dependent-plans-and-docs.md) |

Phase 2 phụ thuộc phase 1 (web phải hết import contract trước khi xoá contract). Phase 3 chạy sau cùng.

## Acceptance Criteria

- [x] Sidebar không còn nhóm "Hệ thống"/mục "Cài đặt"; topbar map không còn `/_auth/settings`.
- [x] Truy cập `/settings` cho kết quả giống một path không hợp lệ khác (vd `/admin`) — không crash, không render trang cũ.
- [x] `GET/PUT/POST /api/kernel/settings` với **teacher session** trả 404 — GET không qua origin guard; PUT/POST với Origin hợp lệ qua guard rồi 404; Origin thiếu/lạ → 403.
- [x] Không còn symbol `workspaceSettingsSchema`, `workspaceSettingsUpdateSchema`, `WorkspaceSettings*`, `workspaceSettingsQueryOptions` trong `apps/` và `packages/api/src`.
- [x] Bảng `workspace_settings` và `packages/db/src/schema/settings.ts` còn nguyên; không có migration mới.
- [x] Test origin guard (PUT/PATCH) vẫn chạy và xanh với path thay thế.
- [x] Plan SePay + plan chấm bài không còn trỏ tới `settings.tsx`/`/settings`/`repos/settings`; #320 có comment ghi chú (đã đăng: issues/320#issuecomment-5991712634).
- [x] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test` xanh.

## Rủi ro

- **Plan SePay #320 đang `pending`** (frontmatter, không phải "ready to review"): phase 2/5/6 đặt UI ở Cài đặt và sửa trực tiếp `settings.tsx`. Giảm thiểu: Quyết định #3 — banner + `blockedBy` ngay commit đầu; phase 3 rewrite dứt khoát sang trang riêng `/payments` với điều kiện đối chiếu route `/tuition` đang tồn tại, không để "đề xuất treo".
- **`routeTree.gen.ts` bị gitignore:** tự regenerate qua `pnpm --filter web check-types` (`vite build && tsc`); drift guard skip im lặng khi file vắng — chạy check-types trước web test.
- **Khôi phục:** `git revert` + merge + **re-run `pnpm deploy`** (web + server deploy cùng một stack alchemy — revert code mà không deploy thì endpoint vẫn 404 trên prod); dữ liệu DB không mất.

## Red Team Review

### Session — 2026-10-05
**Findings:** 23 raw → 16 sau dedupe (16 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 4 High, 11 Medium/Low
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier), Failure Mode Analyst (Fact Checker). Tier Standard — 96 claims checked, 89 verified, 5 failed, 2 partial.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | SePay/grading đang `pending` + worktree đã cut — collision modify/delete `settings.tsx`, không encode dependency (Critical) | Critical | Accept | plan.md QĐ#3, phase-03 |
| 2 | Claim sai "SePay `ready to review`" — thực tế `pending` | High | Accept | plan.md Rủi ro |
| 3 | Plan files untracked — worktree mới không thấy plan | High | Accept | phase-01 task 0 |
| 4 | Assertion "khác 403" làm yếu regression CSRF guard — phải hard `toBe(404)` | High | Accept | phase-02 bước 3 |
| 5 | Grade plan còn touchpoint `:65` (query key `["kernel","settings"]`) bị bỏ sót; grep verification không bắt được | High | Accept | phase-03 |
| 6 | AC origin guard sai bản chất: GET không qua guard; Origin lạ → 403; student session 403 ở bootstrap | Medium | Accept | plan.md AC, phase-02 bước 4 |
| 7 | Mệnh đề sai "kernel không còn route PUT/PATCH" (còn qua mount `/assignments`) | Medium | Accept | phase-02 bước 3 |
| 8 | Drift guard skip vacuous khi `routeTree.gen.ts` vắng; build riêng thừa (check-types đã regen) | Medium | Accept | phase-01 bước 4, Verification |
| 9 | Grep verification mù với chuỗi tiếng Việt "Cài đặt" | Medium | Accept | phase-03 bước 1, Verification |
| 10 | `docs/project-roadmap.md:85,:100` còn nhắc settings persist | Medium | Accept | phase-03 |
| 11 | Claim sai "Tab Dữ liệu disabled" (tab vẫn chọn được, chỉ nút bên trong disabled) | Medium | Accept | plan.md Overview |
| 12 | Rollback thiếu bước re-deploy (`pnpm deploy` thủ công, single stack) | Medium | Accept | plan.md Rủi ro |
| 13 | Cite dòng `kernel.ts` trong grade plan sẽ lệch ~135 dòng sau xoá | Medium | Accept | phase-03 (symbol anchors) |
| 14 | POST `/api/kernel/settings` không có test khoá việc gỡ | Medium | Accept | phase-02 bước 4 (GET+PUT+POST) |
| 15 | Đề xuất `/payments` bỏ qua route `/tuition` đang tồn tại | Medium | Accept | phase-03 |
| 16 | Assertion 404 đo routing mặc định Hono — fragile khi thêm route PUT sau này | Medium | Accept (modified) | phase-02 bước 3: hard 404 + comment buộc xem lại có chủ đích |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi áp 16 findings)
- Decision deltas checked: 7 (SePay pending không phải ready-to-review; blockedBy/banner từ commit đầu; hard 404 assertion; GET+PUT+POST 404 teacher session; drift guard sau check-types; grep "Cài đặt"/`kernel", "settings`; roadmap + /tuition + deploy note)
- Reconciled stale references: 5 (Overview tab Dữ liệu; AC guard; Rủi ro routeTree; phase-01 Verification; phase-03 GitHub gate)
- Unresolved contradictions: 0
