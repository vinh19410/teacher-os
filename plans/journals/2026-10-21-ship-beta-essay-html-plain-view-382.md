---
title: "Ship beta #382: chuẩn hoá essay Writing chứa HTML sang plain view kèm bản đồ offset hai chiều"
date: 2026-10-21
summary: "Giải quyết lỗi màn kết quả học viên và màn chấm giáo viên hiện thẻ <p> nguyên chữ khi quiz_attempt.essay chứa HTML, đồng thời bảo toàn tuyệt đối hệ thống highlight offset (#332/#336) nhờ chuẩn hoá một lần ở server khi đọc (essayToPlain + toEssayView) và quy đổi offset hai chiều raw↔plain."
---

# Ship beta #382: chuẩn hoá essay Writing chứa HTML sang plain view

## What happened
Thực thi pipeline `ak-vibe --ship --beta --advice` cho issue #382 (`Student writing review renders raw HTML (<p> tags) instead of rich content`).

1. **Investigation & Debug:**
   - Xác minh `EssayWithHighlights` (`packages/ui/src/components/quiz/essay-with-highlights.tsx`) chủ đích render mỗi segment là một JSX text node kèm `data-start` để chống XSS và giữ bất biến ánh xạ vùng chọn DOM → offset ký tự cho `AnnotatableEssay`.
   - Kiểm chứng spec `apps/e2e/specs/teacher-essay-annotations.spec.ts` trên `develop` HEAD (`bafa6e2`) 2 lần liên tiếp (16.3s và 13.7s): cả 2/2 test hiện có đều PASS vì fixture `ESSAY` dùng plain text; lỗi thực tế xảy ra khi `quiz_attempt.essay` trong DB chứa HTML (`<p>…</p>`).
2. **Thiết kế dưới giám sát Kongming (`--advice`):**
   - Bác bỏ phương án dùng `htmlToPlainText` sẵn có trong `packages/api/src/rich-text.ts` (do khác biệt `DOMParser` vs regex giữa browser/workerd, `normalizeSpacing` làm trôi offset, không có map offset) và bác bỏ phương án render innerHTML trên `EssayWithHighlights` (phá vỡ DOM selection offset và tạo bề mặt XSS).
   - Chọn hướng A: thêm module thuần `packages/api/src/lib/essay-plain.ts` (`essayToPlain`, `plainToRaw`, `rawToPlain`) với cặp mảng `(rawStart[i], rawEnd[i])` cho từng UTF-16 code unit, heuristic chỉ kích hoạt khi gặp thẻ đóng thuộc whitelist hoặc `<br>`/`<hr>`, và tầng view `toEssayView` / `toPlainAnnotation` ở server (`apps/server/src/lib/quiz-annotation.ts`).
3. **Red-team & Verification:**
   - Kongming red-team plan phát hiện và sửa sớm các điểm biên: cặp mảng `rawStart`/`rawEnd` cho astral entity (`&#x1F600;` = 2 UTF-16 code units), luồng xoá `pendingBlockBreak` trên thẻ khối rỗng `<p></p><p>Bc</p>`, chuẩn hoá response 201 của `POST /annotations` qua `toPlainAnnotation`, và dùng prompt Writing thứ 2 trong `seedQuizFixture` cho e2e để không đụng unique index `(assignment_id, student_id)`.

## Decision
- Mọi đường trả `essay` hoặc `EssayAnnotation` ở server (`GET /api/grading/:id`, `POST`/`PATCH` annotations, `GET /api/student/assignments/:id/quiz`, `GET /api/student/attempts/:id`, `GET /api/student/attempts/:id/detail`) đều trả plain text và plain offsets; DB giữ nguyên offset raw nên không cần migration dữ liệu cũ.
- Chấp nhận mất định dạng inline (`<strong>`, `<em>`) trong bài viết Writing để giữ nguyên 100% bất biến text node của `EssayWithHighlights`.

## Next steps
- Merge PR vào `develop`, kiểm tra post-merge CI và đóng plan `teacher-os/261021-1140`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
