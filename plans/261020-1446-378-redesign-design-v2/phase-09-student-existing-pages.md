---
phase: 9
title: "Học viên: màn hiện có + Classmates (mới)"
status: completed
priority: P1
effort: "8h"
dependencies: [4]
---

# Phase 9: Học viên — màn hiện có + Classmates

## Goal

Khoác bố cục `design-v2/src/pages/Student.tsx` + `StudentClass.tsx` cho mọi màn `apps/student`
hiện có, và thêm tab **Bạn cùng lớp** (tên + avatar chữ tắt).

## Files to Create / Modify

| Màn | Route | File chính | Design tham chiếu |
|---|---|---|---|
| s-dashboard | `_auth/index.tsx` | `overview/*` (`greeting-header`, `class-card`, `assignment-list`, `tuition-list`, `empty-state`) | `Dashboard()`: PageHead + StudentSpot, stat 4 cột (band hiện tại, mục tiêu, chuyên cần, việc cần làm), "Sắp tới", "Bài tập cần làm", panel Học phí + QR |
| s-classes | `_auth/classes/index.tsx` | `overview/class-card.tsx` | `ClassPage()`: card lớp + tag đếm buổi + progress + bảng bài tập |
| s-class-detail | `_auth/classes/$classId.tsx` | `class/class-detail-view.tsx`, `class-lesson-list.tsx`, `teacher-avatar.tsx` | `StudentClassDetail`: Ring stat + Tabs "Hành trình học / Bài tập / Giáo trình / Bạn cùng lớp" |
| (pattern) | `_auth/assignments/index.tsx` | `overview/assignment-row.tsx` | bảng "Assignments to do" |
| s-quiz-* | `_auth/learn/quizzes/*` | `components/quiz/*`, `packages/ui/.../quiz/*` | `ReadingExam`/`ListeningExam`/`WritingExam`/`SpeakingUpload` + `ExamFrame`/`AudioBar` |
| (pattern) | `_auth/tuition/index.tsx`, `$invoiceId.tsx` | `overview/tuition-list.tsx`, `payment-qr-panel` | panel Tuition |
| s-vocab | `_auth/vocab/*` | `components/vocab/*` | `Vocabulary()` + `VocabCatalog` |
| (pattern) | `_auth/onboarding.tsx` | `onboarding/*` | khung `Login` form + Card |

Classmates (mới):

- Modify: `packages/api/src/contracts.ts` — schema `ClassmatesResponse = { id, name, initials, isMe }[]`.
- Modify/Create: server route học viên lấy roster lớp (cùng chỗ với route lớp của student hiện
  có — xác định khi scout file route student trong `apps/server/src/routes`), chỉ trả lớp mà
  học viên đang ghi danh, chỉ field `name` (không email/band/học phí); test quyền: học viên
  lớp khác → 403/404.
- Modify: `apps/student/src/lib/repos/student.ts` — `useClassmates(classId)`.
- Create: `apps/student/src/components/class/classmates-tab.tsx` (+ test) — lưới card avatar
  chữ tắt + tên, "(bạn)" cho chính mình.

## Tasks & Steps

1. Dashboard: số liệu stat lấy từ dữ liệu thật đã có (band mục tiêu/hiện tại nếu có trong
   student profile; thiếu thì ẩn stat đó thay vì bịa — ghi ngoại lệ vào `verdict.md`).
2. Class detail: tab "Hành trình học" từ lesson list + trạng thái buổi (đã học/vắng/hủy/sắp tới)
   đã có trong `class-lesson-list`; Ring = tỷ lệ chuyên cần + tiến độ giáo trình.
3. Quiz runtime: chỉ khung `ExamFrame` (thanh trên có nhãn + timer), không đổi logic chấm/lưu.
4. Classmates: route + repo + tab + test quyền.

## Verification

- `pnpm --filter student test && pnpm --filter server test -- classmates student`
- e2e student hiện có (overview, class, quiz, tuition, vocab) + spec mới
  `student-classmates.spec.ts` (thấy bạn cùng lớp, không thấy email).
- `pnpm design:compare --screens s-dashboard,s-classes,s-class-detail,s-quiz-reading,s-quiz-listening,s-quiz-writing,s-quiz-speaking,s-vocab --side app --label new` → PASS.
