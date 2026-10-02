---
title: "Portal học viên: card lớp hiện giáo viên + trang chi tiết lớp"
description: "Card 'Lớp học của tôi' hiển thị avatar, tên, email giáo viên. Bấm card (lớp đã tham gia) mở trang chi tiết lớp gồm thông tin lớp, giáo viên, danh sách buổi học của học viên và bài tập của lớp."
status: completed
priority: P2
effort: "8h"
issue: 307
branch: vinh19410/feat/307-student-class-card-teacher-detail
tags: [feature, frontend, backend, student-portal]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Portal học viên: card lớp hiện giáo viên + trang chi tiết lớp (#307)

## Overview

Ở trang chủ portal học viên, card "Lớp học của tôi" (`apps/student/src/components/overview/class-card.tsx`) có badge band/hình thức, tên lớp, lịch, tiến độ và buổi tới. Card chưa cho biết ai dạy lớp, và cũng không bấm vào được: student app chưa có trang chi tiết lớp nào (`apps/student/src/routes/_auth/` chỉ có `index`, `onboarding`, `learn/quizzes/*`).

Plan này làm hai việc:
- Card hiển thị thông tin giáo viên: avatar (hoặc chữ cái đầu), tên, email.
- Bấm card của lớp đã tham gia thì mở trang `/classes/$classId`. Trang gồm header lớp, card giáo viên, danh sách buổi học của học viên trong lớp, và bài tập của lớp.

## Hiện trạng đã xác minh

- **Giáo viên của lớp:** bảng `class` không có cột giáo viên. Giáo viên là người sở hữu org. Org được tạo bởi bootstrap của teacher app, kèm một `membership` có `role: "teacher"` (`apps/server/src/app.ts:84-93`). Tên, email, ảnh nằm ở `user` (`packages/db/src/schema/auth.ts`). Hiện chưa có luồng mời thêm giáo viên vào org.
- **Dữ liệu card:** `GET /api/student/overview` (`apps/server/src/routes/student.ts:596`) trả `classes: StudentClass[]` (`packages/api/src/contracts.ts:1594`).
- **Buổi học:** mỗi enrollment có các row `lesson` riêng (`packages/db/src/schema/lesson.ts`). Trạng thái là `upcoming | completed | cancelled | absent`. `date` null nghĩa là lớp legacy, và null theo cả lớp chứ không lẫn từng row.
- **Bài tập:** overview đã map `class_assignment` targets thành `StudentAssignment` có `classId`. `AssignmentList` và `AssignmentRow` đã có filter tab và link vào màn làm bài.
- **Sidebar:** mục "Trang chủ" trong `student-shell.tsx:76-79` là `div` tĩnh, không phải link.
- **Đổi org:** `org-switcher.tsx:61` invalidate toàn bộ key `["student"]`.

## Key Decisions

1. **Thông tin giáo viên = giáo viên sở hữu org** (user chốt hiển thị avatar + tên + email). Server lấy `membership` có `role = 'teacher'` sớm nhất của org (`createdAt asc, id asc`), join `user` lấy `{ name, email, image }`. Mỗi request query một lần rồi gắn vào mọi lớp trong response. Không thêm cột `teacherId` vào `class` vì repo chưa có khái niệm nhiều giáo viên mỗi org. Khi có, chỉ cần đổi helper này.
2. **Contract:** thêm `studentTeacherSchema = { name, email, image: string | null }`. `studentClassSchema` có thêm `teacher: studentTeacherSchema.nullable().catch(null)`. `.catch(null)` giữ client chạy được với server cũ, theo precedent `enrollmentStatus`. `null` nghĩa là org không có membership giáo viên (dữ liệu seed hoặc legacy), khi đó UI ẩn dòng giáo viên.
3. **Endpoint mới `GET /api/student/classes/:classId`**, đặt trong router `/api/student` và sau `requireStudent` (RT#1: router này tự gánh auth). Trả `StudentClassDetail = { class: StudentClass & { startDate }, lessons: StudentClassLesson[], assignments: StudentAssignment[] }`.
   - **IDOR guard:** chỉ trả khi có `enrollment` khớp `orgId` + `studentId` của học viên đăng nhập + `classId` + `status = 'active'`. Mọi trường hợp khác trả 404 `{ error: "class not found" }`: lớp org khác, lớp không ghi danh, enrollment `invited`.
   - **Buổi học:** lọc theo `enrollmentId` của học viên, không lọc theo `classId`, để trạng thái riêng như "vắng" là của chính học viên. Sắp theo `date asc, day asc, time asc`. Không trả `zoom` (user không chọn mục link Zoom).
   - **Bài tập:** cùng shape và cùng thứ tự với nhánh `class_assignment` của overview, lọc thêm `classAssignment.classId = :classId`. Bài từ nguồn chấm (`assignment` grading) không gắn lớp nên không có ở đây.
4. **DRY server:** tách phần dùng chung giữa overview và detail thành helper trong `apps/server/src/routes/student.ts` (hoặc file `student-class.ts` cạnh đó nếu `student.ts` > 1400 dòng):
   - `loadOrgTeacher`
   - `loadNextSession`
   - `toStudentClass`
   - `loadClassAssignmentItems(…, classId?)`

   Overview gọi lại đúng các helper này nên response overview chỉ thêm field `teacher`, ngoài ra không đổi.
5. **Lớp `invited` không click được** (user chốt). Card invited giữ nguyên `div` và nút "Tham gia lớp". Card active được bọc toàn bộ trong `<Link to="/classes/$classId">`. Card active không có phần tử tương tác nào bên trong nên không bị lồng link/button. Email trên card là text thường, không phải `mailto:`, để không lồng link.
6. **Trang chi tiết** `apps/student/src/routes/_auth/classes/$classId.tsx`, bọc trong `StudentShell`, gồm:
   - Link "← Trang chủ".
   - Header lớp: badge band/hình thức, tên lớp, lịch, ngày khai giảng, thanh tiến độ "Buổi x/y".
   - Card giáo viên: avatar, tên, email dạng `mailto:` (ở trang chi tiết thì không bị lồng link).
   - Section "Buổi học": danh sách theo thứ tự. Mỗi dòng có ngày (hoặc "Buổi N" khi `date` null), giờ, thời lượng, chủ đề, badge trạng thái tiếng Việt. Buổi tới (upcoming đầu tiên có `date >= hôm nay`) được highlight.
   - Section "Bài tập": tái dùng `AssignmentList` và ẩn tên lớp trên từng row vì đã ở trong trang lớp.
7. **Avatar:** component `TeacherAvatar` dùng chung cho card và trang chi tiết. Có `image` thì render `<img referrerPolicy="no-referrer">`, vì ảnh Google hay trả 403 khi có referrer. `onError` hoặc không có ảnh thì fallback chữ cái đầu, cùng style với `AvatarMenu`. Student worker không đặt CSP `img-src` (`apps/student/src/worker.ts`) nên ảnh ngoài load được.
8. **Đổi org khi đang ở trang chi tiết:** query detail có key `["student", "class", classId]`, nằm dưới prefix `["student"]` nên org-switcher invalidate luôn. Lớp không thuộc org mới thì server trả 404 và trang hiện trạng thái "Không tìm thấy lớp" kèm link về trang chủ. Không thêm logic redirect.
9. **Sidebar "Trang chủ" đổi thành `<Link to="/">`.** Không đổi thì trang mới không có đường về qua sidebar. Style active giữ nguyên khi ở `/`. Ở `/classes/*` vẫn coi "Trang chủ" là mục cha nên giữ active.

## Phases

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 1 | [Contract + server: teacher trên overview, endpoint chi tiết lớp](phase-01-contract-server.md) | 3h | completed |
| 2 | [UI học viên: card giáo viên + link, trang chi tiết lớp](phase-02-student-ui.md) | 3.5h | completed |
| 3 | [E2E + gate cuối](phase-03-e2e-gates.md) | 1.5h | completed |

Phase 2 phụ thuộc contract của phase 1. Phase 3 phụ thuộc cả hai.

## Acceptance Criteria

- [x] Card lớp đã tham gia ở trang chủ hiển thị avatar (ảnh hoặc chữ cái đầu), tên và email giáo viên. Org không có giáo viên thì card không có dòng giáo viên và không vỡ layout.
- [x] Bấm vào bất kỳ đâu trên card lớp đã tham gia thì mở `/classes/<classId>`. Card focus được bằng Tab và mở được bằng Enter.
- [x] Card lớp "Chờ kích hoạt" không phải link. Nút "Tham gia lớp" vẫn hoạt động như cũ.
- [x] Trang chi tiết hiển thị header lớp, card giáo viên, danh sách buổi học của chính học viên (đúng trạng thái, highlight buổi tới) và bài tập của lớp có filter tab. Bấm bài tập vào được màn làm bài.
- [x] `GET /api/student/classes/:classId` trả 404 cho lớp của org khác, lớp học viên không ghi danh, và enrollment `invited`. Không có session thì trả 401.
- [x] Response `GET /api/student/overview` chỉ thêm field `teacher`, các field khác không đổi (test overview hiện có vẫn xanh).
- [x] Từ trang chi tiết quay về trang chủ được bằng link "← Trang chủ" và bằng mục sidebar "Trang chủ".
- [x] Các gate xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter student test`, e2e spec mới cùng `student-quiz-take-review.spec.ts`.

## Non-Goals

- Link Zoom / nút "Vào lớp" trên trang chi tiết (user không chọn).
- Danh sách bạn cùng lớp, syllabus, học phí, ghi chú lớp.
- Hồ sơ giáo viên mở rộng (bio, số điện thoại) và gán giáo viên theo từng lớp. Repo chưa có dữ liệu cho các mục này.
- Trang chi tiết cho lớp `invited`.

## Risks

- **Lộ email giáo viên cho học viên:** đây là email đăng nhập của giáo viên. User đã chốt hiển thị. Chỉ học viên có enrollment trong org mới thấy, vì overview và detail đều nằm sau `requireStudent` và lọc theo org.
- **Org nhiều giáo viên sau này:** helper chọn giáo viên sớm nhất. Khi có luồng mời giáo viên thì phải chuyển sang `class.teacherId`. Comment ở helper ghi rõ giả định này.
- **Lớp legacy (`date` null):** không có ngày cụ thể. UI hiện "Buổi N · <thứ> <giờ>" theo `day`/`time` và không highlight buổi tới.

## Validation Log

Câu hỏi đã chốt với user (2026-10-02):
- Thông tin giáo viên trên card: **avatar + tên + email**.
- Nội dung trang chi tiết: header + giáo viên (mặc định), **danh sách buổi học**, **bài tập của lớp**. Không có link Zoom.
- Lớp `invited`: **không click được**.

## Implementation Notes (2026-10-02)

Lệch so với plan, kèm lý do:
- Helper dùng chung nằm ở `apps/server/src/routes/student-class.ts` vì `student.ts` sẽ vượt ~1400 dòng (đúng nhánh plan cho phép).
- Không thêm `vietnamTodayISO` vào `apps/student/src/lib/vietnam-display-date.ts`: `@teacher-os/api/vietnam-date` đã export hàm này và student app đang dùng nó (`assignment-status.ts`).
- Student app test bằng `renderToStaticMarkup` (repo không có Testing Library/jsdom). Không thêm dependency mới, nên fallback `onError` của ảnh avatar không có unit test; test bao phủ fallback chữ cái đầu khi `image` null.
- Phần thân trang chi tiết tách thành `ClassDetailView` / `ClassNotFound` (`components/class/class-detail-view.tsx`) để test được không cần router. Badge và thanh tiến độ được export từ `class-card.tsx` (`ClassBadges`, `ClassProgress`) và dùng lại, thay vì copy markup.
- Card "Chờ kích hoạt" cũng hiện dòng giáo viên (thông tin của lớp, không phải tương tác). Card này vẫn không phải link.
- E2E: email giáo viên có `runToken` vì `user.email` unique và `local.db` giữ dữ liệu giữa các lần chạy.
- Sau code review: buổi học của lớp legacy (`date` null) được sắp lại ở server (`orderStudentLessons`), gồm hai bước: trong từng slot thứ+giờ thì buổi đã diễn ra đứng trước, rồi tới buổi huỷ, rồi buổi sắp tới; sau đó xen kẽ các slot. Mục đích là khớp heuristic prefix của app giáo viên. Có thêm tiebreak `lesson.id`.
- Sau code review: card active dùng stretched link (link quanh tên lớp, lớp phủ `after:` che cả card) thay cho bọc toàn card bằng `Link` + `aria-label`. Nhờ vậy trình đọc màn hình vẫn đọc được giáo viên, tiến độ và buổi tới.
- Ngày khai giảng hiện kèm năm. Tên thứ dùng chung `VI_DAY_NAMES`.
