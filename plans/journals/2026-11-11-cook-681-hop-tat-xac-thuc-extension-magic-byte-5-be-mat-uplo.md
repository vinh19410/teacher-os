---
title: cook-681-hop-tat-xac-thuc-extension-magic-byte-5-be-mat-upload
date: 2026-11-11
summary: "Triển khai #681: media-magic + quiz-media siết, peeked.abort(), CAS Vocab, bounded-read Exam Import, E2E âm mới — 5 bề mặt upload đã khóa 3 lớp."
---

# cook-681-hop-tat-xac-thuc-extension-magic-byte-5-be-mat-upload

## What happened
Thực thi plan `261111-1035-681-media-upload-magic-bytes` cho issue #681 qua 3 phase TDD: Phase 1 (module `packages/api/src/lib/media-magic.ts` + siết `quiz-media.ts`, đồng bộ 3 client uploader), Phase 2 (5 route server + `PeekedStream.abort()` + CAS Vocab + bounded-read Exam Import + fixture ffmpeg thật), Phase 3 (E2E âm `media-upload-magic-bytes.spec.ts` 5/5 pass, smoke specs, docs + changelog). Bắt thêm 6 lỗi fixture/test trong lúc Green: fixture WAV `riffSize > cap`, `Content-Length` lệch byte payload, mã lỗi thật `VOCAB_INVALID_AUDIO`/`E-selfomy-alignment-003`, admin E2E gọi nhầm cổng preview thay vì API.

## Decision
`matchesWav` chấp nhận `riffSize <= cap + 8` (đối chiếu vs declaredSize); client Vocab gửi `X-File-Name` + KHÔNG gửi `Content-Length` thủ công; exam-import đọc stream giới hạn `declaredSize` thay vì `arrayBuffer()` chống OOM.

## Next steps
Local code review (`ak-code-review --pending`), ship beta, PR review, merge develop.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
