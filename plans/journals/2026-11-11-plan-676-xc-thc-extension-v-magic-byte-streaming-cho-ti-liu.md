---
title: "Plan #676: xác thực extension và magic-byte streaming cho tài liệu"
date: 2026-11-11
summary: "Hoàn tất kế hoạch TDD --advice, Red-Team 8/9 findings và Validation cho issue #676."
---

# Plan #676: xác thực extension và magic-byte streaming cho tài liệu

## What happened
- Khởi tạo kế hoạch TDD handover (`--advice`) tại `plans/261111-0818-676-upload-extension-magic-bytes/` cho issue #676 (kiểm thực upload tài liệu theo đuôi file và chữ ký magic-byte đầu luồng trước `store.put`).
- Thực hiện Red-Team 2 góc nhìn đối kháng (Security Adversary & Assumption Destroyer) phát hiện 9 điểm (nhận 8, bác bỏ 1 ngoài phạm vi): vá các vector polyglot HTML/UTF-16LE BOM (`FF FE` trùng Layer I, `ID3<html>`, `<!--ftyp-->`, `RIFF<!--WEBP-->`, `%PDF-<html>`, `PK\x03\x04<html>`), khóa `noUncheckedIndexedAccess: true`, tách cờ `cancelled`/`releaseLock()` và chặn Slowloris `min(64, size + 1)` trong `peekStream`, bổ sung alias OS/trình duyệt + `sanitizeMediaFileName` đồng nhất client/server, phủ E2E âm cả ngân hàng lẫn buổi học và tạo task cơ học cho issue follow-up `ai-handle`.

## Decision
- Khóa phạm vi #676 vào hệ thống Tài liệu theo tư vấn của Kongming, tạo issue follow-up `ai-handle` riêng cho các route raw-PUT còn lại (Speaking, Library, Placement, Vocab, Exam-imports).

## Next steps
- Chốt cổng Kongming sau kế hoạch, commit & push plan/journal qua `ak-git cp`, đồng bộ issue #676 rồi thực thi `/ak-cook --tdd --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
