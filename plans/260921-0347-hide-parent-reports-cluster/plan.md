---
title: "Tạm ẩn cụm Phụ huynh Báo cáo (hoãn phát triển)"
description: "Ẩn toàn bộ điểm vào UI của cụm Phụ huynh — Báo cáo bằng flag tĩnh, giữ nguyên backend, DB và code trang để bật lại sau."
status: completed
priority: P2
effort: 3h
branch: vinh19410/issue-210-hide-parent-reports
tags: [frontend, feature-flag]
created: 2026-09-21
issue: 210
---

# Tạm ẩn cụm Phụ huynh Báo cáo (hoãn phát triển)

## Bối cảnh & mục tiêu

Cụm "Phụ huynh — Báo cáo" (danh sách báo cáo tuần, tạo báo cáo, mẫu báo cáo trong Cài đặt) được hoãn sang giai đoạn phát triển sau. Yêu cầu: tạm ẩn toàn bộ điểm vào UI, giữ nguyên backend + DB + code trang để bật lại dễ dàng. Mode: fast, HOLD SCOPE — không xóa code, không đụng dữ liệu.

Cơ chế: hằng số `PARENT_REPORTS_ENABLED = false` trong module mới `apps/web/src/lib/features.ts`. Repo chưa có feature flag nào; không dựng env-flag vì không cần toggle runtime — bật lại = flip 1 hằng số.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Không còn điểm vào UI nào dẫn tới cụm Báo cáo phụ huynh (sidebar, route, trang học viên, Cài đặt) | P1 |
| 2 | Backend, DB, code trang giữ nguyên vẹn — bật lại bằng 1 flip flag | P1 |
| 3 | Toàn bộ test/lint/typecheck hiện có xanh sau thay đổi | P2 |

## Phạm vi

**Ẩn (gate bằng `PARENT_REPORTS_ENABLED`):**
- Section "Phụ huynh" trong sidebar — `apps/web/src/components/layout/sidebar.tsx:145-167`
- Route `/reports` — `apps/web/src/routes/_auth/reports.tsx:13-15` (thêm `beforeLoad` redirect về `/dashboard`)
- Nút "Tạo báo cáo" + `CreateReportModal` ở trang học viên — `apps/web/src/routes/_auth/students/$studentId.tsx:116-118, 272-278`
- Title `"Báo cáo phụ huynh"` — `apps/web/src/components/layout/app-shell.tsx:24`
- Copy "· Báo cáo phụ huynh" và Card "Mẫu báo cáo tuần" trong Cài đặt — `apps/web/src/routes/_auth/settings.tsx:168-171, 288-297`

**Giữ nguyên (Out of scope):**
- Component `ReportsRoute` và toàn bộ nội dung trang (có unit test trực tiếp — vẫn chạy được)
- Card thông tin "Phụ huynh" (tên/SĐT) ở `$studentId.tsx:168-190` và nút "Nhắn Zalo" (`:107-115`) — dữ liệu học viên, không phải tính năng báo cáo
- `apps/web/src/routes-matcher.ts:9` giữ `"/reports": true` (SW phải cho qua để client redirect hoạt động)
- Payload save `tplReport` trong settings (`settings.tsx:220-224`)
- Comment bank (`grade-modal.tsx:116` của cụm Bài tập đang dùng) và chuông notif ở topbar
- `apps/web/src/components/modals/create-report-modal.tsx`, `apps/web/src/lib/repos/reports.ts`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/data-store-reducer.ts`, `apps/web/src/lib/mock-data.ts`
- Toàn bộ `apps/server`, `packages/api`, `packages/db` (bảng report/comment_bank/notif + migrations, snapshot fields)
- `apps/web/src/routeTree.gen.ts` (file generated)

## Quyết định thiết kế

1. Flag hằng số trong `features.ts` (module mới) — repo chưa có flag nào; env-flag là overkill khi không cần toggle runtime.
2. `/reports` dùng `beforeLoad` + `redirect({ to: "/dashboard" })` — chuẩn TanStack Router, component và test component giữ nguyên.
3. Không đổi `routes-matcher.ts` — route file vẫn tồn tại, redirect chạy phía client; nếu SW chặn `/reports` sẽ không bao giờ tới client để redirect. (Bằng chứng thêm: `routes-matcher.test.ts:20` đang assert `"/reports"` phải nằm trong danh sách route hợp lệ — xóa khỏi `VALID_EXACT_ROUTES` sẽ làm test này đỏ.)
4. Không đụng backend/DB — tạm ẩn để hoãn, không phải xóa; giữ dữ liệu người dùng.
5. Comment bank + chuông notif không thuộc cụm này — chúng phục vụ cụm Bài tập/thông báo riêng, ẩn sẽ vỡ tính năng đang dùng.
6. Card "Phụ huynh" ở trang học viên được giữ — tên/SĐT phụ huynh là dữ liệu hồ sơ học viên.

## Hướng dẫn bật lại

1. Flip `PARENT_REPORTS_ENABLED = true` trong `apps/web/src/lib/features.ts`.
2. `settings.test.tsx`: kỳ vọng textarea về `toBe(3)`, bỏ assert `not.toContain("Mẫu báo cáo tuần")`.
3. `reports.test.tsx`: bỏ test kỳ vọng `beforeLoad` throw redirect (hoặc đổi chiều assert flag bật).
4. Chạy lại 3 lệnh kiểm chứng; smoke: /reports hiển thị trang, sidebar hiện lại section "Phụ huynh".

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Ẩn điều hướng và điểm vào UI](./phase-01-start.md) | Completed |
| 2 | [Chặn route /reports và kiểm chứng tổng thể](./phase-02-block-reports-route-and-verify.md) | Completed |

## Success Criteria

- [ ] Sidebar không còn section "Phụ huynh"; topbar không còn title "Báo cáo phụ huynh"
- [ ] Vào trực tiếp `/reports` bị redirect về `/dashboard`
- [ ] Trang học viên: không có nút "Tạo báo cáo"/modal; vẫn còn card "Phụ huynh" + nút "Nhắn Zalo"
- [ ] Cài đặt: không còn "Báo cáo phụ huynh" trong copy; tab Mẫu tin chỉ còn 2 textarea
- [ ] `pnpm -C apps/web test` pass (bao gồm test `beforeLoad` mới)
- [ ] `pnpm -C apps/web check-types` pass; `pnpm check` không diff
- [ ] Không file nào trong danh sách "giữ nguyên" bị thay đổi

## Validation Log

### Verification Results (2026-09-21, orchestrator — tier Light: 2 phases)

- Claims checked: 14 — Verified: 14 | Failed: 0 | Unverified: 0
- `apps/web/src/lib/features.ts` chưa tồn tại — xác nhận là file tạo mới.
- Toàn bộ tham chiếu `"/reports"` trong apps/web chỉ gồm `routes-matcher.ts:9`, `routes-matcher.test.ts:20`, `sidebar.tsx:149` — không còn điểm vào UI nào khác bị bỏ sót.
- Import `@/lib/repos/settings` trong settings.tsx kết thúc dòng 26 ✓; import `format-invoice` trong `$studentId.tsx` ở dòng 14 (đã sửa tham chiếu 13→14 trong phase-01).
- 3 lệnh kiểm chứng khớp `apps/web/package.json` (`test`, `check-types`) và root (`check`).
- Interview user: bỏ qua (phiên chạy autonomous); các điểm quyết định đã chốt bằng mặc định dễ đảo ngược, ghi tại "Quyết định thiết kế" ở trên.

### Whole-Plan Consistency Sweep

- Đã reread `plan.md` + 2 phase files: link phase hợp lệ, frontmatter đúng schema, Phases table khớp file thực, các tham chiếu file:line nhất quán giữa plan và phase sau khi sửa dòng 14.
- Không mâu thuẫn chưa giải quyết. Kết luận: plan đủ điều kiện triển khai.

<!-- slug: hide-parent-reports-cluster -->
