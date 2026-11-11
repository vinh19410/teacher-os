---
title: "Plan #647: CSP media inline, trần 95 MB khớp Cloudflare edge & E2E upload/học sinh"
date: 2026-11-11
summary: "Hoàn tất nghiên cứu, kế hoạch TDD 2 phase, Red-Team 12 điểm & Kongming duyệt cho issue #647"
---

# Plan #647: CSP media inline, trần 95 MB khớp Cloudflare edge & E2E upload/học sinh

## What happened
- Tái hiện thực nghiệm lỗi nút «Phát» / «Mở» tài liệu audio/video không phát được trong tab mới do `materialFileResponse` trả cứng `Content-Security-Policy: default-src 'none'; sandbox` (chặn `media-src` và ép opaque origin `'null'` trượt CORS/CORP).
- Đối chiếu tài liệu Cloudflare Workers/Zone Limits xác nhận giới hạn request body trên gói Free/Pro là `100 MB` (`~100,000,000` bytes SI, trả 413 HTML thiếu CORS trước Worker), trong khi `MATERIAL_MEDIA_MAX_BYTES` đang là `100 * 1024 * 1024` (`104,857,600` bytes).
- Soạn kế hoạch bàn giao TDD 2 phase tại `plans/261111-0305-647-materials-upload-student-e2e/`, qua Red-Team 2 góc nhìn (Security Adversary + Assumption Destroyer: nhận 9 điểm, bác 3 điểm ngoài phạm vi), Fact Checker 15 claims và Kongming Checkpoint 1 & 2 (`GO`).

## Decision
- Tách `INLINE_MEDIA_CSP` (chỉ khi `!download && kind === "media"` và `normalizeMediaType` thuộc nhóm `media` trong `MATERIAL_MIME`, tuyệt đối không có `allow-scripts`) khỏi `STRICT_CSP`, ép `application/octet-stream` khi MIME hỏng và thêm `COOP: same-origin` + `Referrer-Policy: no-referrer`.
- Hạ `MATERIAL_MEDIA_MAX_BYTES` xuống `95 * 1024 * 1024` (`95 MB`), bổ sung fallback `413` ở `materialErrorMessage`.
- Viết `apps/e2e/specs/material-upload-student.spec.ts` phủ đủ 6 kịch bản E1–E6 (có negative control đa-org chứng minh `?org=` quyết định định tuyến).

## Next steps
- Cập nhật issue #647 với nhãn `ready to cook` → `in progress` và chạy `/ak-cook --tdd --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
