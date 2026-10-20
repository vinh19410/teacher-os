---
title: "Redesign web + student theo design v2 (shadcn neutral, light mặc định) + tính năng mới của design"
description: "Lấy vinh19410/teacheros-design-v2@7a53fc0 làm base: token shadcn neutral oklch, Geist, light mặc định + toggle dark, shell sidebar-07 dùng chung, khoác lại mọi màn hình hiện có và xây các tính năng chỉ có trong design (Practice catalog, History, Classmates, ⌘K). DoD = ảnh chụp đối chiếu design ↔ app từng màn PASS."
status: pending
priority: P1
effort: 78h
issue: 378
branch: feat/redesign-design-v2
tags: [frontend, design-system, redesign, student, feature]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Redesign theo design v2

## Overview

Design v2 ở repo private `vinh19410/teacheros-design-v2`, ghim commit
`7a53fc0fcbf415367d245539cedc3855606266a7` (Figma Make export: React 19, Tailwind v4,
lucide, router hash, mock data `src/lib/data.ts`). Đây là **base giao diện mới** thay cho
design v1 (dark + cam, plan `261008-1555-redesign-dark-design-system`). Code design là
tham chiếu bố cục/token/component — không copy mock data, router hash, QR giả.

| Khía cạnh | Hiện tại (`DESIGN.md`, v1) | Design v2 |
|---|---|---|
| Theme | Dark mặc định, `.light` override | **Light mặc định** (`:root`), `.dark` override, toggle icon ghost Sun/Moon |
| Màu | `#0a0a0a` + accent cam `#ff5b1f`, trạng thái đơn sắc + cam | shadcn **neutral** oklch; primary = mực; `--destructive` đỏ; `--chart-1/2`; chấm trạng thái emerald/amber |
| Font | Inter Tight + DM Mono | **Geist** + **Geist Mono**, `html { font-size: 14px }` |
| Radius | 4–8px, card `neu` 4px | `--radius: 0.625rem`, card `rounded-xl border shadow-sm` |
| Page head | kicker mono cam + tiêu đề extrabold 48–72px | tiêu đề `text-2xl md:text-3xl font-semibold tracking-tight` + mô tả muted bên dưới |
| Selection | nền chìm + chữ cam, dấu ■ | tab segmented `bg-muted` + item `bg-background shadow-sm`; nav `bg-sidebar-accent font-medium` |
| Shell | sidebar riêng web/student, topbar | **sidebar-07** dùng chung: team switcher, nhóm nav có nhãn, user footer, content inset `rounded-xl border` trên nền `bg-sidebar`, header breadcrumb + actions |
| Login | form + minh họa | split 2 cột: form `max-w-xs` + panel `bg-muted` quote + TeacherDesk |

## Quyết định đã chốt với user (2026-10-20)

| Câu hỏi | Quyết định |
|---|---|
| Theme | **Light mặc định** theo v2, toggle Dark lưu `localStorage.theme`, giữ script chống nháy |
| Thương hiệu | Giữ **Teacher OS**; logo-block kiểu v2 (ô `bg-primary` + icon), không dùng "BandRoom" |
| Phạm vi | **Gồm cả tính năng mới** chỉ có trong design (Practice catalog, History, Classmates, ⌘K search) |
| DoD | **Đối chiếu cấu trúc** bằng ảnh chụp side-by-side design ↔ app, 3 viewport × 2 theme, checklist từng màn PASS mới xong; dữ liệu khác nhau được chấp nhận |
| Nguồn đề Practice | **Mọi đề `ready`** trong thư viện assignment test của tổ chức tự hiện cho học viên, không cần cờ |
| Dictation | **Chưa làm** — ẩn mục Dictation khỏi nav/catalog/history, tách issue sau |
| Classmates | Chỉ **tên + avatar chữ tắt** (không email/band/học phí/điểm của người khác) |

Mặc định không cần hỏi: copy **tiếng Việt** (chuỗi tiếng Anh của design chỉ để tham chiếu bố
cục); route path, query param, accessible name, `data-testid` giữ nguyên trừ màn mới.

## Ràng buộc kỹ thuật đã kiểm chứng

- **CSP** (`apps/web/src/security-headers.ts`): `script-src 'self'`, `font-src 'self' data:` →
  Geist phải **self-host** qua `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`
  (design dùng Google Fonts — không port). Script chống nháy `/theme-init.js` giữ nguyên cơ chế,
  chỉ đảo mặc định.
- **Token tập trung** ở `packages/ui/src/styles/globals.css` (đã `@import "shadcn/tailwind.css"`,
  `@custom-variant dark`). Component đang dùng tên token v1 (`bg-surface`, `text-fg`,
  `border-line`, `text-hot`, `neu*`…). Chiến lược 2 bước: (1) map token v1 sang giá trị v2 để
  toàn app đổi theo ngay; (2) từng phase màn hình chuyển markup sang utility shadcn
  (`bg-card`, `text-muted-foreground`, `border`) và xóa alias v1 ở phase 12.
- Student đã có `org-switcher.tsx` + `notification-bell.tsx` (lời mời) → chỉ restyle, không
  xây mới. Teacher đã có attendance, giao dịch chưa khớp, syllabus template → restyle.
- `quiz_attempt.assignment_id` **NOT NULL** FK `class_assignment` → Practice cần migration
  (assignment_id nullable + `test_id` + `mode`), **backup DB trước migration**.
- `assignment_test.skill` ∈ reading|listening|writing|speaking, `status` draft|ready → nguồn
  catalog Practice (vocab đi từ `vocab`/`vocab_library_course` hiện có).
- 55 spec e2e; selector bám class còn lại: `aside.sidebar` (3), `div.overflow-hidden`,
  `div.mt-8`, `.grid.grid-cols-3 > div`, `.assign-item`, `img[src*='vietqr.app']`. Quy tắc như
  plan v1: class móc ngữ nghĩa giữ nguyên; selector bám utility sửa sang role/testid **cùng
  commit** đổi markup.
- Dev stack chiếm 8000/8001/8003; e2e dùng 8100/8101/8103; harness design v2 dùng **8200**.

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|-------|--------|--------|-----------|
| 1 | [Harness chụp đối chiếu + baseline ảnh "cũ"](./phase-01-visual-harness-baseline.md) | Completed | 5h | — |
| 2 | [Token neutral, Geist self-host, light mặc định](./phase-02-tokens-fonts-theme.md) | Completed | 5h | 1 |
| 3 | [Primitive dùng chung theo v2](./phase-03-shared-primitives.md) | Completed | 7h | 2 |
| 4 | [App shell sidebar-07 dùng chung web + student](./phase-04-app-shell.md) | Pending | 6h | 3 |
| 5 | [Auth, pay, 404 (web + student)](./phase-05-auth-public-pages.md) | Pending | 4h | 3 |
| 6 | [Giáo viên: dashboard, lớp, học viên, lịch, giáo trình, hồ sơ, báo cáo](./phase-06-teacher-core-pages.md) | Pending | 8h | 4 |
| 7 | [Giáo viên: bài tập, đề thi, chấm bài, học phí, vocab](./phase-07-teacher-assignments-tuition.md) | Pending | 7h | 4 |
| 8 | [Giáo viên: ô tìm kiếm ⌘K (mới)](./phase-08-teacher-command-search.md) | Pending | 4h | 4 |
| 9 | [Học viên: màn hiện có + Classmates (mới)](./phase-09-student-existing-pages.md) | Pending | 8h | 4 |
| 10 | [Học viên: Practice catalog (mới, gồm migration)](./phase-10-student-practice.md) | Pending | 11h | 9 |
| 11 | [Học viên: History heatmap + lịch sử chi tiết (mới)](./phase-11-student-history.md) | Pending | 7h | 10 |
| 12 | [Sweep, DESIGN.md, e2e, DoD ảnh đối chiếu toàn bộ](./phase-12-sweep-docs-visual-dod.md) | Pending | 6h | 5, 6, 7, 8, 11 |

Phase 6, 7, 8, 9 độc lập về file sau phase 4 (5 sau phase 3). Mỗi phase màn hình **tự chạy
harness cho màn của mình** và chỉ đóng khi các màn đó PASS (DoD cục bộ); phase 12 chạy lại
toàn bộ. Một nhánh `feat/redesign-design-v2`, commit theo phase; có thể tách PR theo nhóm
(nền tảng 1–5, giáo viên 6–8, học viên 9–11, sweep 12) để review nhỏ hơn.

## Định nghĩa hoàn thành (DoD)

Một màn **PASS** khi ảnh side-by-side `design | app (mới)` (kèm `app (cũ)` làm tham chiếu)
ở **1440×900, 768×1024, 375×812 × light/dark** thỏa checklist cấu trúc trong
[phase 1](./phase-01-visual-harness-baseline.md#checklist-khớp-cấu-trúc): cùng khung shell,
cùng thứ tự/khối vùng, cùng loại component (card/stat/tabs/table/badge), cùng thang
typography/radius/spacing/màu token; khác biệt chỉ ở **dữ liệu thật** và **copy tiếng Việt**
(hoặc lệch có chủ đích đã ghi vào `DESIGN.md`). Kết quả ghi vào `screenshots/verdict.md`
(một dòng/màn: PASS/FAIL + ghi chú). Plan hoàn thành khi **100% màn trong bảng ánh xạ PASS**
và gate kỹ thuật xanh.

## Acceptance criteria

1. Lần đầu mở (không `localStorage.theme`) → **light**; toggle → dark; reload giữ; không nháy.
2. Font Geist/Geist Mono tải từ origin app; không request `fonts.googleapis.com`; CSP sạch.
3. `screenshots/verdict.md` có 100% màn trong `scripts/design-compare/screens.json` = PASS ở
   6 tổ hợp viewport×theme.
4. Shell sidebar-07 dùng chung (`@teacher-os/ui`) cho web + student; mobile drawer hoạt động,
   breadcrumb đúng route.
5. Tính năng mới chạy với dữ liệu thật: Practice (Reading/Listening/Writing/Speaking/
   Vocabulary, không Dictation) tạo attempt `mode=practice` không lẫn điểm lớp; History hiển
   thị heatmap tháng + bảng tuần + chi tiết từ attempt/vocab thật; Classmates chỉ tên + chữ tắt;
   ⌘K tìm lớp/học viên/bài tập/hóa đơn và điều hướng đúng.
6. Contrast AA chữ thường cả 2 theme; ranh giới input ≥3:1; focus ring thấy rõ.
7. Gate xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter web test`,
   `pnpm --filter student test`, `pnpm --filter server test`, full
   `pnpm --filter e2e e2e` (port 8100–8103) trước khi merge vào `develop`.

## Non-goals

- **Dictation** (ẩn hoàn toàn, issue riêng).
- Không đổi `apps/landing`, email template, `logo.png`, tên thương hiệu.
- Không port router hash, `data.ts`, QR giả, nút chuyển Teacher/Student của prototype.
- Không đổi route path/query param hiện có; route mới chỉ thêm (`/practice/*`, `/history`).
- Practice không ảnh hưởng điểm lớp, báo cáo, học phí.

## Rủi ro chính

| Rủi ro | Giảm thiểu |
|---|---|
| Đổi base font 15px → 14px + radius lớn làm vỡ màn dày (test builder, grading) | Phase 2 chụp nhanh 2 màn dày nhất trước khi sang phase 3 |
| Bỏ ngôn ngữ "đơn sắc + cam" — trạng thái quá hạn chuyển `destructive` (đỏ) theo v2 | Viết lại quy tắc màu trong `DESIGN.md` ở phase 2; e2e không assert màu |
| Migration `quiz_attempt` (NOT NULL → nullable) trên SQLite cần rebuild bảng | Backup `.db` trước; migration test như các `*-migration.test.ts` hiện có; attempt cũ giữ `mode=assignment` |
| Practice attempt lọt vào bảng điểm/báo cáo giáo viên | Mọi query giáo viên lọc `mode='assignment'`; test hồi quy reporting/grading |
| Design mock dữ liệu khác app → ảnh khó so | Checklist cấu trúc, không pixel-diff; seed e2e đủ dữ liệu cho mọi khối (không màn rỗng khi chụp) |
| Selector e2e bám utility class | Bảng "E2E bám class" ở trên; sửa cùng commit |
| Design repo private, CI không clone được | Harness chạy local (`gh` auth); không đưa vào CI |

## Câu hỏi còn mở

- Không có câu hỏi chặn. Các mặc định đã ghi trong từng phase (vd. Practice Writing/Speaking
  "chờ chấm" do giáo viên chấm tùy chọn — xem phase 10).
