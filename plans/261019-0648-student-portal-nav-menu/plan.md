---
title: "Menu điều hướng học viên (StudentShell) & tách các trang chuyên biệt"
description: "Bổ sung thanh menu ngang responsive trong StudentShell và tách các trang chuyên biệt Lớp học (/classes), Bài tập (/assignments), Học phí (/tuition) bên cạnh Tổng quan (/) và Từ vựng (/vocab)."
status: pending
priority: P2
effort: 4h
issue: 365
branch: develop
tags: [frontend, student-app, ui, navigation, a11y]
blockedBy: []
blocks: []
created: 2026-10-19
---

# Menu điều hướng học viên (StudentShell) & tách các trang chuyên biệt

## Overview

Hiện tại giao diện học viên (`apps/student`) chỉ có header đơn giản trong [`StudentShell`](../../apps/student/src/components/layout/student-shell.tsx) gồm tên học viên bên trái và cụm `OrgSwitcher` + `ThemeToggle` + `NotificationBell` + `AvatarMenu` bên phải, **không có thanh menu điều hướng**. Mọi nội dung (Lớp học, Học phí, lối vào Từ vựng, Bài tập) đang dồn chung vào trang chủ [`/`](../../apps/student/src/routes/_auth/index.tsx), còn trang chi tiết phiếu học phí [`/tuition/$invoiceId`](../../apps/student/src/routes/_auth/tuition/$invoiceId.tsx) thậm chí chưa bọc trong `StudentShell`.

Kế hoạch này bổ sung:
1. **Thanh menu ngang (`StudentNav`) ngay trong header của `StudentShell`**: điều hướng 1 chạm tới 5 mục chính — **Tổng quan** (`/`), **Lớp học** (`/classes`), **Bài tập** (`/assignments`), **Từ vựng** (`/vocab`), **Học phí** (`/tuition`) — tuân thủ quy tắc selection của [`DESIGN.md`](../../DESIGN.md) (`neu-in text-hot` + dấu `■` cam `aria-hidden` trước nhãn đang active) và hiển thị mượt trên cả 3 viewport (`1440×900`, `768×1024`, `375×812`).
2. **Các trang chuyên biệt**:
   - `/classes` ([`apps/student/src/routes/_auth/classes/index.tsx`](../../apps/student/src/routes/_auth/classes/index.tsx)): danh sách lớp học của học viên + xác nhận tham gia lớp được mời.
   - `/assignments` ([`apps/student/src/routes/_auth/assignments/index.tsx`](../../apps/student/src/routes/_auth/assignments/index.tsx)): danh sách bài tập kèm bộ lọc trạng thái đồng bộ trên URL (`?status=all|due-soon|overdue|submitted`).
   - `/tuition` ([`apps/student/src/routes/_auth/tuition/index.tsx`](../../apps/student/src/routes/_auth/tuition/index.tsx)): tổng quan & danh sách hóa đơn học phí (có empty state rõ ràng khi chưa có hóa đơn) + bọc `StudentShell` và link quay lại cho [`/tuition/$invoiceId`](../../apps/student/src/routes/_auth/tuition/$invoiceId.tsx).
3. **Giữ nguyên trang Tổng quan (`/`)**: các khối tóm tắt trên `/` (kèm liên kết điều hướng nhanh sang từng trang) được giữ nguyên để không phá vỡ thói quen sử dụng và toàn bộ suite E2E hiện có.

## Quyết định đã chốt với user (2026-10-19)

| Câu hỏi | Lựa chọn |
|---|---|
| Bố cục menu ở `StudentShell` | Thanh menu ngang ngay trên header của `StudentShell` (giữ layout 1 cột `max-w-6xl` gọn nhẹ hiện tại, tự xuống hàng gọn gàng trên tablet/mobile). |
| Các mục (pages) trên menu | 5 mục chuyên biệt: **Tổng quan** (`/`), **Lớp học** (`/classes`), **Bài tập** (`/assignments`), **Từ vựng** (`/vocab`), **Học phí** (`/tuition`). |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bổ sung `StudentNav` trong `StudentShell` với 5 mục điều hướng, trạng thái active chuẩn `DESIGN.md` (`neu-in text-hot` + `■`), hỗ trợ bàn phím và 3 viewport (`1440×900`, `768×1024`, `375×812`) | P1 |
| 2 | Tạo các route chuyên biệt `/classes`, `/assignments` (filter URL `?status=`), `/tuition` và đồng bộ `StudentShell` + nút quay lại cho `/tuition/$invoiceId` | P1 |
| 3 | Chuẩn hóa query key `["student", "invoices"]` và `StudentPageGate` để đổi tổ chức (`OrgSwitcher`) và kiểm tra `NOT_LINKED` / `onboarding` hoạt động đồng nhất trên mọi trang | P1 |
| 4 | Bảo toàn 100% luồng E2E hiện có trên `/` và bổ sung unit test + E2E test cho thanh menu và các trang mới | P1 |

## Non-goals

- Không thay đổi API backend (`/api/student/overview`, `/api/student/invoices`, `/api/student/vocab/overview` đã cung cấp đủ dữ liệu).
- Không thêm sidebar dọc kiểu giao diện giáo viên (`apps/web`).
- Không thay đổi màn làm bài quiz (`/learn/quizzes/$assignmentId`) — màn thi giữ header runtime riêng (`QuizRuntimeHeader`) để tránh học viên bấm nhầm rời bài thi ngoài luồng nút `Thoát`.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Thanh điều hướng StudentShell, chuẩn hóa query key & StudentPageGate](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Các trang chuyên biệt (/classes, /assignments, /tuition) & bọc StudentShell cho /tuition/$invoiceId](./phase-02-dedicated-student-pages.md) | Pending |
| 3 | [Phase 3: Unit tests, E2E verification & kiểm tra 3 viewport](./phase-03-tests-and-e2e-verification.md) | Pending |

## Success Criteria

- [ ] Header `StudentShell` hiển thị `<nav aria-label="Điều hướng học viên">` gồm 5 link: `Tổng quan` (`/`), `Lớp học` (`/classes`), `Bài tập` (`/assignments`), `Từ vựng` (`/vocab`), `Học phí` (`/tuition`).
- [ ] Mục đang active có `aria-current="page"`, nền `neu-in`, chữ `text-hot` và dấu `■` (`aria-hidden="true"`); các route con (`/classes/$classId`, `/vocab/$deckId`, `/vocab/$deckId/session`, `/tuition/$invoiceId`) vẫn giữ active ở mục cha tương ứng.
- [ ] Trang `/classes` hiển thị danh sách lớp học (`ClassCard`), hỗ trợ xác nhận tham gia lớp mời và hiển thị empty state khi chưa có lớp.
- [ ] Trang `/assignments` hiển thị danh sách bài tập với bộ lọc trạng thái lưu trên URL (`?status=due-soon|overdue|submitted`), badge đếm trên tab có `aria-hidden="true"`.
- [ ] Trang `/tuition` hiển thị `TuitionList` khi có hóa đơn và `OverviewEmptyState` khi chưa có hóa đơn; trang `/tuition/$invoiceId` nằm trong `StudentShell` và có link `← Học phí` quay về `/tuition`.
- [ ] Chuyển đổi tổ chức qua `OrgSwitcher` tự động làm mới dữ liệu ở cả `/`, `/classes`, `/assignments`, `/vocab`, `/tuition`.
- [ ] Unit tests (`pnpm --filter student test`), typecheck (`pnpm check-types`), lint (`pnpm check`) và E2E (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`) đều pass.

## Red Team Review

### Session — 2026-10-19
**Findings:** 6 (6 accepted, 0 rejected) — 4 lenses (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic).
**Severity breakdown:** 0 Critical, 3 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `apps/e2e/specs/tuition-bank-transfer.spec.ts:265` gọi `page.getByRole("link", { name: /Học phí/ }).first().click()` trên `/`; vì `<header>` nằm trước `<main>`, thêm link `"Học phí"` vào header sẽ làm `.first()` bấm nhầm vào `/tuition` thay vì dòng hóa đơn `/tuition/$invoiceId` | High | Accept | Phase 3 |
| 2 | `StudentTuitionSection` (`index.tsx:154`) dùng `queryKey: ["student-invoices"]` và `tuition/$invoiceId.tsx` dùng `["student-me"]` / `["student-invoice-payment"]` không nằm dưới prefix `["student"]`, khiến `OrgSwitcher` (`invalidateQueries({ queryKey: ["student"] })`) không làm mới hóa đơn khi đổi tổ chức | High | Accept | Phase 1, 2 |
| 3 | Học viên chưa liên kết (`NOT_LINKED`) hoặc chưa hoàn tất onboarding (`onboardingCompletedAt == null`) bấm vào `/classes`, `/assignments`, `/tuition`, `/tuition/$invoiceId` sẽ gặp UI không nhất quán nếu thiếu guard chung như `/` và `/classes/$classId` | High | Accept | Phase 1, 2 |
| 4 | Các unit test trong `apps/student/test/` dùng `renderToStaticMarkup` với mock `<Link>` tối giản; nếu `StudentNav` gọi `useLocation`/`useRouterState` trực tiếp sẽ làm gãy test khi chưa mock hook — nên dùng `<Link activeOptions={{ exact }}>` + selector `aria-[current=page]:*` giống `apps/web/src/components/layout/sidebar.tsx` | Medium | Accept | Phase 1, 3 |
| 5 | `TuitionList` trả về `null` khi `invoices.length === 0` (để ẩn cột phải ở `/`); nếu `/tuition` chỉ gọi `<TuitionList />` thì trang `/tuition` sẽ trắng trơn khi học viên chưa có hóa đơn | Medium | Accept | Phase 2 |
| 6 | Đặt 5 mục menu + tên học viên + 4 nút công cụ trên cùng 1 hàng không wrap sẽ tràn ngang ở `768×1024` và `375×812`; nhân đôi 2 `<nav>` (desktop + mobile drawer) lại sinh 2 link trùng tên trong DOM — giải quyết bằng 1 `<nav>` duy nhất kết hợp `flex-wrap lg:flex-nowrap` (`order-3 w-full` ở `< lg`) | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-dedicated-student-pages.md`, `phase-03-tests-and-e2e-verification.md`
- Decision deltas checked: 6 (bảng Red Team trên)
- Unresolved contradictions: 0

<!-- slug: student-portal-nav-menu -->