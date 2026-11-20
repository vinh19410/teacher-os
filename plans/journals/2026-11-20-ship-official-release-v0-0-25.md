---
title: Ship Official Release v0.0.25
date: 2026-11-20
summary: "Promote develop lên main v0.0.25: Zoom thay Google Meet, nhóm bộ từ vựng, 8 migration D1"
---

# Ship Official Release v0.0.25 (develop → main)

**Date**: 2026-11-20 03:05 Europe/London
**Severity**: Medium
**Component**: Release `v0.0.25` (nhánh `develop`)
**Status**: Đã qua local gate, đang hoàn tất commit bump version + mở PR vào `main`

## Chuyện gì đã xảy ra

Promote **48 commit** (không tính 30 merge commit, `origin/main..HEAD`, 291 files changed trong `git diff --stat origin/main...HEAD`) từ `develop` (`9731729a`) kết hợp merge `origin/main` (`2ba74edd`, PR #805) tại `c49a9fdd` lên `main` (`v0.0.24` → `v0.0.25`), kèm **8 D1 migration mới** (`0075_pretty_cammi.sql` → `0082_material_vargas.sql`).

Phạm vi chính của `v0.0.25`:
- **Zoom Pro thay Google Meet (#831, #842):** migration chuyển `class_session_meeting` sang cột Zoom, tạo/đồng bộ link Zoom theo từng buổi qua API; học viên chỉ mở được link trong khung giờ buổi học (`9731729a`).
- **Nhóm bộ từ vựng `vocab_group` (#832):** schema + contract + route server, quản lý nhóm, chọn nhóm inline, lọc deck, import CSV có cột nhóm, nhân bản hàng loạt; vá xoá nhóm đồng thời, lỗi từng phần của batch và live region a11y (`a49d4698`).
- **Từ vựng & study pack:** chọn/nhân bản deck giáo viên tạo (#825), import CSV định dạng bài học kèm `entryType`/`pos`/ví dụ (#815), đồng bộ First Step/GT2 với audio R2 + CLI promote production (#814, #817), gộp "bộ đề của tôi" và thư viện hệ thống (#829).
- **Thư viện bài thi:** xuất bản khi có ≥1 phần hợp lệ (#810), đồng bộ vào catalog luyện tập học viên (#812), sửa HTTP 500 `GET /api/admin/library/tests` do giới hạn D1 (#824).
- **Auth & UI:** chuyển học viên sai vai trò / `403 ACCOUNT_TEACHER_ROLE` về `/login` (#839); root font `14px` → `16px` (#805); brand `Cô Mỹ Dạy Tiếng Anh` + `no-reply@msmy.io.vn` (#806, #808); sửa date/time input trong `AddClassSessionModal`, `OrgEventModal` (#821, #822).
- **CI/Infra:** script + workflow dọn dữ liệu staging Step IELTS (`bea37b96`).

## Quyết định kỹ thuật chính

- **Zoom thay Google Meet, không chạy song song:** #819 vừa đưa Meet theo buổi + đồng bộ recording vào chính release này thì #831 đã thay bằng Zoom Pro. Nghĩ lại thì hơi đau — ta ship một tính năng rồi gỡ nó ngay trong cùng release, để lại migration `0078` (Meet) chồng với migration chuyển sang Zoom. Chọn Zoom vì tài khoản Pro có API tạo meeting ổn định; đổi lại là giới hạn **một meeting chạy cùng lúc** trên một license — đã ghi cảnh báo trong docs (`73533d95`) và để secret theo environment thay vì dùng chung.
- **`vocab_group` là bảng riêng, không phải tag tự do trên deck:** cho phép lọc, import CSV và clone batch có kiểm soát; chấp nhận thêm migration và phải xử lý race khi xoá nhóm đồng thời.
- **Giải conflict `apps/e2e/specs/modal-form-spacing.spec.ts` khi merge `origin/main`:** conflict chỉ nằm ở một dòng comment — `develop` ghi "Root font-size là 16px (globals.css)", `main` (#805, `0dd14044`) ghi "16px (mặc định trình duyệt)". Assertion `expect(g.gap).toBe(16)` giống hệt hai bên; giữ bản của `main` để diff `origin/main...c49a9fdd` sạch ở file này.

## Thách thức

**`pnpm check-types` đỏ ở `apps/student` vì thiếu `pdfjs-dist`.** Sau merge, task build/typecheck của student fail do không resolve được module `pdfjs-dist` (dependency đưa vào từ inline document preview #797/#801). Không phải lỗi code — `node_modules` local chưa có package vì chưa chạy `pnpm install` sau khi kéo lockfile mới, và turbo cache còn giữ trạng thái cũ. Mất thời gian vô ích để nghi ngờ merge làm hỏng import. Khắc phục: `pnpm install` rồi chạy lại turbo (rebuild, không dùng cache) → `check-types` 12/12 xanh.

Bài học: sau mỗi lần merge `origin/main` hoặc kéo lockfile mới, **chạy `pnpm install` trước khi chạy gate**. Lỗi "Cannot find module" ngay sau merge gần như luôn là môi trường, không phải code.

## Kiểm chứng (trên HEAD `c49a9fdd`)

- `pnpm exec biome check .`: 0 errors (chỉ còn warnings baseline).
- `pnpm check-types`: Exit 0 — 12/12 tasks passed (sau `pnpm install` + rebuild turbo).
- `pnpm test`: Exit 0.
- **E2E:** Không chạy full Playwright ở local theo `AGENTS.md` — chạy 6 shard trên GitHub Actions (`e2e.yml`) khi mở PR vào `main` và khi `deploy.yml` gate production.

## Rủi ro & việc cần theo dõi

1. **8 migration D1 trong một release** (`0075`–`0082`), có migration đổi cấu trúc `class_session_meeting` — bắt buộc backup D1 theo `docs/production-release-runbook.md` trước deploy.
2. **Secret Zoom phải có ở environment `production`** trước khi deploy; thiếu thì tạo link buổi học sẽ lỗi.
3. **Giới hạn một meeting Zoom cùng lúc:** hai lớp trùng giờ sẽ đá nhau — cần giáo viên/vận hành biết trước.
4. Dữ liệu Google Meet cũ (#819) sau migration: kiểm tra buổi học đã có link Meet không hiển thị link chết.

## Next steps

1. Commit bump `"0.0.25"` trong `package.json`, `CHANGELOG.md` và journal này; mở PR `develop` → `main`.
2. Theo dõi `quality.yml` + full 6-shard `e2e.yml` trên PR; backup D1 trước khi `deploy.yml` chạy.
3. Sau deploy: smoke tạo buổi học có Zoom và mở link từ tài khoản học viên trong/ngoài khung giờ.

**Status**: DONE
**Summary**: v0.0.25 đưa Zoom Pro thay Google Meet, nhóm bộ từ vựng và 8 migration D1 lên `main`; local gate xanh sau khi xử lý thiếu `pdfjs-dist` bằng `pnpm install` + rebuild turbo.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
