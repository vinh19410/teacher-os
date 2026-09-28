---
title: Bỏ hardcode nội dung mẫu ở /assignments/new — form khởi tạo trắng
date: 2026-09-25
summary: "assignment-presets giảm 522 dòng còn cấu trúc; form /assignments/new không còn tự điền đề mẫu, giáo viên nhập từ đầu"
---

# Bỏ hardcode nội dung mẫu ở /assignments/new — form khởi tạo trắng

## What happened
Yêu cầu: bỏ phần hardcode ở màn hình /assignments/new để giáo viên input từ đầu tất cả.

- `apps/web/src/components/assignments/assignment-presets.ts`: xóa toàn bộ nội dung mẫu (title/prompt/passage/intro/items/transcript/cueTopic/cuePoints của từng type, passage của part, source "Cambridge IELTS..." của skill) — file giảm từ 722 còn ~230 dòng, chỉ giữ cấu trúc UI (4 skills / 12 parts / 29 types, label/spec/help/qStart, KIND map). Bỏ `compositionDefaults`, `cloneItems`, helper `q()`; thêm `emptyComposer(skillId, typeId)` trả nội dung trắng (reading/listening có 1 dòng câu hỏi trống qua `emptyItem`), thêm `isAutoSkill()`.
- `new.tsx`: `freshComposer()` dùng `emptyComposer` — form mở ra trắng, nút Lưu disable cho tới khi nhập đủ. Bỏ state `dirtyTitle`/`dirtyMain` và machinery dirty-flag của `compositionDefaults`; đổi skill → reset trắng toàn bộ, đổi part/type → reset cấu trúc câu hỏi nhưng giữ prose giáo viên đã gõ. Copy bỏ cụm "dùng file mẫu".
- `prompt-composer.tsx`: bỏ nút "Dùng file mẫu Cambridge 10" (audioName hardcode).
- `prompt-preview-aside.tsx` + `student-preview-paper.tsx`: fallback tiêu đề "Chưa đặt tên đề" thay cho `type.title` đã xóa.
- Tests: bỏ 2 test assertion nội dung mẫu (compositionDefaults dirty-flags, verbatim TFNG); thêm test chặn hồi quy "catalog carries no hardcoded sample content" + test `emptyComposer` trắng cho cả 29 type; `new.test.tsx` đổi kỳ vọng form trắng + submit disable.

## Decision
- Giữ lại cấu trúc skill/part/type và text hướng dẫn (spec/help/qStart) — đó là khung UI, không phải nội dung đề; chỉ tẩy nội dung mẫu.
- Reading/Listening mở form với 1 dòng câu hỏi trống (empty row) thay vì 0 dòng — vẫn là "nhập từ đầu", tránh màn câu hỏi rỗng không có ô nhập.
- Đổi part/type giữ nguyên prose đã gõ (title/prompt/passage/note) — hành vi ít gây bất ngờ, đơn giản hơn logic dirty-flag cũ.
- Không đụng server: dữ liệu mẫu "Cambridge/Stepwells" trong `kernel.test.ts` chỉ là fixture test; `SAMPLE_ROWS` của syllabus-import là tính năng mẫu riêng của màn import, ngoài phạm vi.
- Lưu ý: working tree có sẵn thay đổi chưa commit khác (bỏ khung phải "Ngân hàng"+preview trong new.tsx/new.test.tsx) do phiên làm việc khác thực hiện song song — được giữ nguyên và test tương thích.

## Verification
- `vitest run` (apps/web): 728/728 pass (77 file).
- `check-types` (vite build + tsc --noEmit): sạch.
- `biome check apps/web/src`: sạch.

## Next steps
- Chưa commit (chờ người dùng duyệt working tree vì có thay đổi song song trộn lẫn).
- Nếu sau này muốn bộ đề mẫu quản lý được theo giáo viên, tách `SKILLS` thành tài nguyên server-side.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
