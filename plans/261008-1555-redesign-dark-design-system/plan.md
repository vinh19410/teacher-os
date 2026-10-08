---
title: "Redesign web + student theo design mới (dark-first, accent cam)"
description: "Áp dụng hệ thống thiết kế mới từ vinh19410/teacheros-design cho apps/web và apps/student: dark mặc định + toggle Light, accent cam, Inter Tight + DM Mono, trạng thái đơn sắc + cam. Chỉ đổi giao diện; không đổi hành vi, dữ liệu, API hay copy tiếng Việt."
status: in-progress
priority: P2
effort: 36h
issue: 349
branch: feat/redesign-dark-design-system
tags: [frontend, design-system, redesign]
blockedBy: []
blocks: []
created: 2026-10-08
---

# Redesign theo design mới (dark-first, accent cam)

## Overview

Design mới nằm ở repo private `vinh19410/teacheros-design` (commit `fcf60a5`, export
từ Figma Make: React 19 + Tailwind v4, dữ liệu mock, router hash). Design là bản
**tham chiếu giao diện**, không phải code để copy: nó dùng mock data, QR giả, chuỗi
tiếng Anh, và nút chuyển Teacher/Student chỉ có trong prototype.

Ngôn ngữ thị giác mới so với hiện tại:

| Khía cạnh | Hiện tại (`DESIGN.md`) | Design mới |
|---|---|---|
| Theme | Chỉ light, Apple-like | **Dark mặc định**, toggle Light (lưu `localStorage`) |
| Accent | Xanh `#0071e3` | Cam `#ff5b1f` (dark) |
| Font | SF Pro Display/Text, SF Mono | **Inter Tight** (400–900) + **DM Mono** |
| Tiêu đề trang | `font-display` semibold, 28–40px | Kicker mono uppercase màu cam + tiêu đề 800, tracking −0.045em, 48–72px |
| Card | `rounded-lg` 18px, surface-warm | `neu`: nền raise + viền 1px `line`, radius 4px |
| Input | viền + radius 12px | `neu-in`: nền sunk, không viền, ring cam khi focus |
| Selection (nav/tab/chip) | đen đặc `bg-fg text-bg` | nền sunk + chữ cam (`neu-in text-hot`), nav có dấu ■ |
| Nút chính | nền accent | nền ink, hover chuyển cam |
| Trạng thái | success xanh / warn vàng / danger đỏ | Đơn sắc + cam: quá hạn = cam đặc, một phần = viền ink, chưa đóng = viền đứt, đã đóng = chip xám |
| Minh họa | không có | 3 SVG nét vẽ: TeacherDesk (login), MorningSpot (dashboard), StudentSpot (student home) |

Bảng ánh xạ trang design ↔ route thật nằm ở [phase 4](./phase-04-teacher-pages-core.md),
[phase 5](./phase-05-teacher-pages-assignments-tuition.md) và
[phase 6](./phase-06-student-app.md).

## Quyết định đã chốt với user (2026-10-08)

| Câu hỏi | Quyết định |
|---|---|
| Theme | Dark mặc định + toggle Light, có script chống nháy theme trước khi render |
| Thương hiệu | Giữ **Teacher OS**; wordmark theo kiểu design: `TEACHER/OS` mono uppercase, dấu `/` màu cam |
| Phạm vi app | `apps/web` (giáo viên) + `apps/student`; `apps/landing` giữ nguyên |
| Màu trạng thái | Theo design: đơn sắc + cam; **giữ đỏ riêng cho hành động phá hủy** (xóa, hủy vĩnh viễn) |

Mặc định không cần hỏi: giữ copy **tiếng Việt** (voice trong `DESIGN.md`, AGENTS.md); chuỗi
tiếng Anh trong design chỉ để tham chiếu bố cục.

## Ràng buộc kỹ thuật đã kiểm chứng

- **CSP web** (`apps/web/src/security-headers.ts:15`): `script-src 'self'` → script chống nháy
  phải là file tĩnh `/theme-init.js`, không inline. `font-src 'self' data:` → font phải
  **self-host** (`@fontsource`), không dùng Google Fonts như design.
- **Token tập trung** ở `packages/ui/src/styles/globals.css` (258 dòng). Component dùng tên
  token (`bg-surface` 136 chỗ, `text-fg` 214, `border-line` 243, `accent-blue` 126,
  `text-danger|bg-danger` 116 chỗ / 68 file). Chiến lược: **giữ tên token, đổi giá trị** để
  phần lớn UI đổi theo mà không sửa từng file; chỉ sửa file khi cấu trúc (layout, variant,
  selection) khác design.
- `@custom-variant dark (&:is(.dark *))` đã có; shadcn component trong `packages/ui` dùng
  `dark:` 34 chỗ → theme dark dùng class `.dark` trên `<html>` để giữ tương thích.
- Toaster đang khóa `theme="light"` (`apps/web/src/routes/__root.tsx:43`,
  `apps/student/src/routes/__root.tsx:40`).
- 48 spec e2e trong `apps/e2e/specs`; không spec nào assert màu hay screenshot, **nhưng một số
  selector bám class** (xem bảng "E2E bám class" dưới). Đây là rủi ro e2e chính của redesign.
- **Contrast** (đo WCAG): dark mute/base 5.89, hot/base 6.38, on-hot/hot 6.38 — đạt AA.
  Light hot `#e8490f`/trắng chỉ **3.90** — trượt AA cho chữ nhỏ → light accent dùng
  `#c93d0b` (5.05). Viền `#262626`/nền `#0a0a0a` = 1.31 → input cần ranh giới ≥ 3:1
  (WCAG 1.4.11), xem phase 1.

## E2E bám class

Grep `locator("…class…")` trong `apps/e2e/specs` (2026-10-08):

| Selector | Spec | Phase | Xử lý |
|---|---|---|---|
| `aside.sidebar` | `sidebar-collapse` | 3 | Class móc ngữ nghĩa — **giữ** `sidebar` trên `<aside>` |
| `button.lesson-block`, `div.lesson-block`, `not.toHaveClass(/opacity-60/)` | `schedule-session-modal`, `projected-sessions`, `class-operations:124` | 4 | Giữ class `lesson-block`; buổi hủy/đã qua giữ đúng `opacity-60` (design dùng 50 — lệch có chủ đích) hoặc đổi spec sang `data-state` trong cùng commit |
| `div.mt-8` | `class-roster-tuition-debt`, `create-invoice` | 4, 5 | Utility layout sẽ đổi → thay selector bằng `getByRole("region", { name })` / `data-testid` trong cùng commit đổi layout |
| `div.overflow-hidden` | `class-sessions-manage-modal` | 4 | như trên |
| `.grid.grid-cols-3 > div` | `student-tuition-summary`, `tuition-revenue-chart`, `create-invoice` | 4, 5 | như trên; unit `student-tuition-summary.test.tsx:155` cũng assert `[&>div:first-child]:text-danger` — cập nhật cùng lúc đổi `StatCard` |
| `article.assign-item`, `.assign-item` | `teacher-grade-submission`, `class-assign` | 5 | Giữ class móc `assign-item` |

Quy tắc: class móc có tên ngữ nghĩa (`sidebar`, `lesson-block`, `assign-item`) giữ nguyên;
selector bám utility Tailwind thì sửa spec sang role/label/testid **trong cùng commit** đổi
markup, không để e2e đỏ giữa các phase.

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|-------|--------|--------|-----------|
| 1 | [Nền tảng: token dark/light, font self-host, theme toggle](./phase-01-tokens-fonts-theme.md) | Pending | 5h | — |
| 2 | [Primitive dùng chung + minh họa SVG](./phase-02-shared-primitives.md) | Pending | 5h | 1 |
| 3 | [Shell giáo viên + trang auth/pay/404](./phase-03-teacher-shell-and-auth.md) | Pending | 4h | 2 |
| 4 | [Trang giáo viên: dashboard, lớp, học viên, lịch, giáo trình, hồ sơ, báo cáo](./phase-04-teacher-pages-core.md) | Pending | 6h | 3 |
| 5 | [Trang giáo viên: bài tập, đề thi, chấm bài, học phí](./phase-05-teacher-pages-assignments-tuition.md) | Pending | 6h | 3 |
| 6 | [App học viên: shell, tổng quan, làm bài, kết quả, auth](./phase-06-student-app.md) | Pending | 6h | 2 |
| 7 | [Sweep, DESIGN.md, e2e + screenshot 3 viewport × 2 theme](./phase-07-sweep-docs-verification.md) | Pending | 4h | 4, 5, 6 |

Phase 4, 5, 6 độc lập về file sau khi phase 3 (và 2 cho phase 6) xong; có thể làm tuần tự
trên cùng nhánh. Một nhánh `feat/redesign-dark-design-system` → một PR vào `develop`, commit
theo phase.

## Non-goals

- **Không thêm tính năng** chỉ có trong mock: nút "Generate invoices", bảng "Unmatched
  transactions" có dropdown match, "Copy syllabus template", nút chuyển Teacher/Student,
  ô search ⌘K mới (search hiện có giữ nguyên hành vi), autosave hiển thị giờ.
- Không đổi server, DB, API contract, kernel snapshot, route path, query param.
- Không đổi copy tiếng Việt, accessible name, `data-testid` (e2e dựa vào chúng). Spec e2e chỉ
  được sửa **selector** bám utility class (bảng "E2E bám class"), không sửa assertion nghiệp vụ.
- Không đổi `apps/landing`, email template, `logo.png`, tên thương hiệu.
- Không port router hash, mock `data.ts`, QR giả `QR()` của design (app đã có
  `payment-qr-panel.tsx` thật).
- Tính năng app có nhưng design không vẽ (báo cáo, tạo bài tập chi tiết, onboarding,
  liên kết ngân hàng…) **giữ nguyên hành vi**, chỉ khoác ngôn ngữ thị giác mới.

## Acceptance criteria

1. Lần đầu mở app (không có `localStorage.theme`) → dark; bấm toggle → light; reload giữ
   lựa chọn; không có khung hình light nháy trước dark (kiểm bằng reload với CPU throttle).
2. Font Inter Tight + DM Mono tải từ origin của app (Network tab không có request tới
   `fonts.googleapis.com`), CSP không báo vi phạm trong console.
3. Mọi trang trong bảng ánh xạ (phase 4–6) khớp design về: page head kicker + tiêu đề lớn,
   card `neu`, input `neu-in`, selection `neu-in text-hot`, badge trạng thái đơn sắc + cam,
   bảng có header mono.
4. Đỏ chỉ xuất hiện ở hành động phá hủy; quá hạn/lỗi dùng cam; không còn xanh `#0071e3`,
   xanh lá, vàng trong UI (grep hex + token ở phase 7 = 0 kết quả ngoài whitelist).
5. Contrast AA cho chữ thường ở cả hai theme; ranh giới input ≥ 3:1; focus ring thấy rõ ở
   cả hai theme.
6. Gate local xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`,
   `pnpm --filter student test`, `pnpm --filter @teacher-os/ui test` (nếu có),
   `pnpm --filter e2e e2e` với port override.
7. PR kèm screenshot 3 viewport (1440×900, 768×1024, 375×812) × 2 theme cho các trang chính.

## Rủi ro chính

| Rủi ro | Giảm thiểu |
|---|---|
| Đổi `--text-base` 17px → 15px và radius làm vỡ layout dày (test builder, grading) | Đổi ở phase 1, chạy screenshot nhanh trang dày nhất trước khi sang phase 2 |
| `danger` dùng lẫn cho cả lỗi trạng thái và nút xóa (116 chỗ) | Tách token: `--danger` → cam (trạng thái/lỗi), thêm `--destructive` đỏ; sweep 18 chỗ `variant="danger|destructive"` + link xóa sang `destructive` |
| Selector e2e bám utility class vỡ khi đổi layout | Bảng "E2E bám class"; sửa selector cùng commit đổi markup |
| Dark làm lộ chỗ hard-code `bg-white`, hex (web 10, student 12, ui 16) | Sweep ở phase 7 với grep có whitelist (QR phải giữ nền trắng) |
| Recharts/Tiptap/sonner có màu riêng | Revenue chart dùng `var(--…)` sẵn; Tiptap placeholder dùng `--meta`; Toaster theo theme hiện hành |
| Đoạn văn đọc hiểu dùng `.font-serif` (weight 800) trong design → khó đọc | Passage dùng weight 400 leading 1.85; ghi lệch có chủ đích trong DESIGN.md |

## Câu hỏi còn mở

- Không có câu hỏi chặn. Nếu sau phase 1 user muốn light accent giữ đúng `#e8490f` (chấp
  nhận trượt AA), chỉ đổi một giá trị token.
