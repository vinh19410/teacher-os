---
title: "Ship #98: occurrence identity + SessionActionsModal (ak:vibe --ship --beta --advice)"
date: 2026-08-27
summary: "Full vibe pipeline cho issue #98: re-run red-team gate vòng 2 (3 reviewer, 15 findings → 14 accept/1 partial) kèm kongming GO-D1..D5 trước khi đụng code; implement 5 phase (skeleton twin D1-safe, occurrence endpoints move-wholly, envelope transport, dual-mode read-path any-NULL-only, modal dateISO-keyed); e2e hai flow mới chạy xanh cục bộ; local review PASS-BLOCKER → fix 3 blocker rồi rebase develop"
---

# Ship #98: Server-side occurrence identity + SessionActionsModal

Nhánh `feat/occurrence-identity-session-actions` kế thừa phần DEFERRED của #93 —
buổi học thành thực thể có `lesson.date`, mọi row cùng `(class_id,date)` là MỘT buổi vật lý.

## What happened

Pipeline ak:vibe đầy đủ. Phần đáng nhớ nhất không nằm ở code:

1. **Red-team round 2 bắt được critical mà cả issue lẫn checkpoint #1 đều lỡ**:
   gate v2 client mirror count-vector sẽ tự hủy feature ngay lần moveDate đầu tiên
   (một lớp → rớt vĩnh viễn về bảng phẳng mất toàn bộ UI action). Bỏ mirror, giữ
   conforms() ở backfill-time; read-gate còn đúng một điều kiện any-NULL.
2. **Kongming checkpoint #3 GO cả 5 fork**: move-wholly all-rows cho edit
   (settled rows dời theo — bucket mixed từ per-sid check-in là trạng thái liên tục,
   không phải edge case); envelope 2xx-only nối `{updated,skipped}` tới dispatch;
   chuỗi A/B/C shaped-theo-deploy thay "6 bước + flag" vì Alchemy auto-applies migrations;
   enrollment-sau-moveDate thành Known Limitation có detector.
3. **E2E thật bắt lỗi thiết kế UI**: strict-mode violation do modal tự in success copy
   trùng toast route — đúng cái contract "MỘT toast" mà plan pin. Modal giờ im lặng khi ok,
   chỉ nổi tiếng thế khi cần ngữ cảnh trong-modal (date-occupied).
4. **Local review PASS-BLOCKER**: ba blocker đều thật và nhỏ (edit trên bucket đã-empty
   trả false-success 200; dump query của chính runbook phá delta-loop của nó;
   criteria tick `[x]` cho test chưa tồn tại). Sửa xong mới rebase.

Số liệu cuối: server 166 tests, web 337, auth 35, infra 11, e2e 15 passed/1 skipped;
biome + check-types sạch; spec Playwright mới 2/2 pass cục bộ với dev servers thật.

## Decision worth remembering

"Bao nhiêu layer defense cũng đừng để status-guard trên identity-move": tách move
(all-rows) khỏi status-action (upcoming-only) giải quyết dứt điểm mixed-state thay vì
ván thêm 409 bucket-mixed khiến teacher dead-end.

## Evidence

- Plan: plans/260827-1340-server-side-occurrence-identity-session-actions/plan.md (bảng N1–N15)
- Review blockers fixed: commits sau 92425f0 trên nhánh feat
- Runbook A/B/C: docs/production-release-runbook.md § Release sequence: occurrence identity
