---
title: "Plan hàng chờ chấm bài Writing/Speaking tự luyện (#383)"
date: 2026-10-21
summary: "Lập kế hoạch 3 phase cho hàng chờ chấm bài /grading hỗ trợ mode=practice và đồng bộ nhãn Chờ chấm (#383)"
---

# Plan hàng chờ chấm bài Writing/Speaking tự luyện (#383)

## What happened
Lập kế hoạch TDD + Handover (`--advice`) cho Issue #383: hàng chờ chấm bài Writing/Speaking tự luyện (`mode='practice'`) và lớp học (`mode='assignment'`) tại `/grading`.

Qua 2 vòng tham vấn Kongming và Red-Team Review, kế hoạch đã khóa 5 rủi ro quan trọng:
1. Chia chunk tối đa 50 `testId` khi truy vấn `assignmentPrompt.part` qua `assignmentTestPart` để không vượt trần bind parameter của Cloudflare D1.
2. Đăng ký `"/grading": true` vào `VALID_EXACT_ROUTES` trong `apps/web/src/routes-matcher.ts` để tránh lỗi 404 khi điều hướng/reload trực tiếp.
3. Sắp xếp ưu tiên bài chờ chấm (`grade === null`) trước bài đã chấm trong cả SQL và bộ nhớ để giới hạn 500 dòng không bao giờ cắt mất bài chờ chấm.
4. Gắn `aria-label` phân biệt theo tên học viên cho link hành động trên từng dòng và chuẩn hóa `validateSearch` trên URL.
5. Bỏ nhãn tạm `"Đã nộp — tự luyện"` ở Lịch sử học viên (`history-list.tsx`), đồng bộ về `"Chờ chấm"`.

## Decision
Chia thành 3 phase tuần tự tại `plans/261021-0508-383-grading-queue-practice/`:
- Phase 1: Contract & API `GET /api/grading` (`loadGradingQueue`).
- Phase 2: Giao diện `/grading`, nav `Chấm bài`, `routes-matcher.ts`, và cập nhật `/grading/$attemptId`.
- Phase 3: Nhãn `Chờ chấm` phía học viên, E2E test, kiểm chứng 3 viewport × 2 theme + 320px và cập nhật tài liệu.

## Next steps
Cập nhật GitHub Issue #383, commit/push plan và thực thi qua `ak-cook --tdd --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
