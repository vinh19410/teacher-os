---
title: "Plan TOS-24..27: Nhập đề thi từ PDF/Ảnh bằng AI (US-005)"
date: 2026-10-27
summary: "Lập 4 plan 261027-0434 (issue #470–#473) cho AC-001..004 của US-005; TOS-24 dựng lõi Ví Credit tối thiểu và extractor Cloudflare Workers AI"
---

# Plan TOS-24..27: Nhập đề thi từ PDF/Ảnh bằng AI

## What happened
Lập 4 plan qua `ak-plan --github` từ Jira TOS-24..27 (AC-001..004 của TOS-20 / US-005), mở
issue #470–#473 (`ai-handle`, `ready to review`); #471, #472, #473 blocked by #470.

Scout cho thấy repo chưa có Ví Credit (TOS-42 / US-009 chưa có GitHub issue) và chưa có SDK
hay binding AI nào trong `apps/server`. Ngân hàng đề của tổ chức là `assignment_prompt` +
`assignment_test`; R2 `MediaStore` và DI optional trong `AppDeps` dùng lại được.

## Decision
- Người dùng chốt: TOS-24 dựng lõi ví tối thiểu (`credit_wallet`, `credit_usage_log`
  append-only, reserve/settle/release idempotent, 30 Credit Dùng thử tạo lười). TOS-42 mở rộng
  gói tháng/Top-up sau; trần cá nhân (TOS-49) là hook no-op.
- Người dùng chốt AI = Cloudflare Workers AI: `toMarkdown` → `run` với JSON schema, model là hằng.
- Không có Queue/cron và `waitUntil` không đủ 120s → bóc tách đồng bộ trong 1 request; TOS-27
  thêm dọn lười job treo > 150s và settle/release có điều kiện `processing`.
- TOS-25: chống trùng bằng SHA-256 tính cả client lẫn server, chặn trước `reserveCredits`.
- TOS-26: cổng xác nhận câu "Cần rà soát lại" ở cả UI lẫn server (422), xuất bản idempotent.

## Next steps
- Review #470 trước, chạy `/ak:cook plans/261027-0434-tos-24-ai-exam-import-reserve-extract/plan.md`;
  sau đó TOS-25 → TOS-26 → TOS-27 tuần tự (cùng sửa `exam-imports.ts` và màn `[6]`).
- Người duyệt cần chốt: 30 Credit khởi tạo, model Workers AI mặc định, Listening chưa có audio khi xuất bản.
