---
title: "Plan màn nộp bài Speaking upload audio/video (#305)"
date: 2026-10-02
summary: "Lập plan 4 phase cho màn nộp bài Speaking: R2 qua Worker cap 50MB, 1 file/attempt, chặn nộp rỗng, làm sau #304"
---

# Plan màn nộp bài Speaking upload audio/video (#305)

## What happened
- Lập plan `plans/261002-1247-student-speaking-media-upload/` (4 phase, 15h) và issue vinh19410/teacher-os#305.
- Trong lúc scout phát hiện `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx:178-195`) render cue card "Describe … You should say" cho mọi part Speaking, và không bao giờ render `prompt`. Hệ quả là Part 1/3 không hiện câu hỏi.
- Repo chưa có lưu trữ file nào: không có R2 binding, không có route upload.

## Decision
- R2 bucket private `MEDIA` khai báo qua `Cloudflare.R2.Bucket` (alchemy). Trình duyệt PUT raw body, Worker stream thẳng vào R2, cap 50MB (user chốt).
- Interface `MediaStore` inject qua deps: R2 ở production, adapter filesystem cho e2e dưới Node, Map cho unit test. Deps optional, thiếu store thì route trả 503.
- 1 file mỗi attempt, lưu 5 cột `media_*` trên `quiz_attempt`. Mỗi upload dùng key mới, ghi DB bằng CAS theo key cũ (D1 không có transaction).
- Chặn nộp khi chưa có file ở cả client lẫn server. Phía server thêm predicate `media_key IS NOT NULL` vào chính câu UPDATE submit nên atomic.
- Phát lại qua blob, vì thẻ `<audio src>` không gửi được header `x-student-org-id` và sẽ resolve sai org với học viên đa org.
- Làm sau #304 (Writing essay) để tái dùng join skill và nhánh summary non-auto.

## Next steps
- Chờ review issue #305. Implement sau khi #304 merge: `/ak:cook plans/261002-1247-student-speaking-media-upload/plan.md`.
- Phase 1 phải xác nhận `Cloudflare.R2` có ở `alchemy@2.0.0-beta.72` (chưa verify được vì bị chặn đọc node_modules).
- Bật R2 trên tài khoản Cloudflare trước khi deploy.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
