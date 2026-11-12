---
title: plan-681-xac-thuc-extension-magic-byte-cho-5-be-mat-upload
date: 2026-11-11
summary: "Hoàn tất kế hoạch TDD handover (#681) mở rộng xác thực đuôi file + magic-byte 64 byte sang Speaking, Library, Placement, Vocab và Exam-imports qua Red-Team 3 góc nhìn (11/12 accepted) và Validation 31 claims."
---

# plan-681-xac-thuc-extension-magic-byte-cho-5-be-mat-upload

## What happened
Lập kế hoạch TDD bàn giao (`--advice`) tại `plans/261111-1035-681-media-upload-magic-bytes` cho issue #681 mở rộng kiểm thực đuôi file + chữ ký nhị phân 64 byte đầu sang 5 bề mặt upload còn lại sau #676. Qua 3 reviewer Red-Team song song (`Security Adversary`, `Assumption Destroyer`, `Failure Mode Analyst`), đã bắt và vá ngay trên kế hoạch 11 lỗi thực chất: thứ tự `reason: "name"` trong `validateQuizMediaFiles`, sai tên workspace `--filter admin`, 6 vector polyglot HTML thế hệ 2 (`ID3\x04<html>`, `RIFF<a  WAVEfmt >`, `\x1a\x45\xdf\xa3<html><!--webm-->`, `OggS\x00\x02<html>`, `wide<!--mdat-->`, `\xff\xd8\xff<html>`), alias Windows/Linux cho `.aac`/`.opus`/`.webm`, thiếu `enforceDeclaredSize` ở `vocab-teacher.test.ts`, thiếu `PeekedStream.abort()` sau `pipeThrough`, thiếu CAS ở Vocab, đọc tràn `arrayBuffer()` ở Exam Import, và thiếu spec E2E âm thực tế.

## Decision
Chốt một nguồn sự thật duy nhất tại `packages/api/src/lib/media-magic.ts` + `packages/api/src/lib/quiz-media.ts`, mở rộng `PeekedStream.abort()`, thêm CAS cho `vocab-teacher.ts`, đọc body giới hạn cứng `declaredSize` trên `POST /api/exam-imports`, và bổ sung `apps/e2e/specs/media-upload-magic-bytes.spec.ts`.

## Next steps
Xin ý kiến cổng kế hoạch từ Kongming, commit/push kế hoạch qua `ak-git cp`, cập nhật issue #681 và thực thi `/ak-cook --tdd --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
