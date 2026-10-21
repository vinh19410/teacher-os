---
title: "Fix #397: design:compare seed fail do bootstrap race + port conflict"
date: 2026-10-21
summary: "Root cause bootstrap polling race và port conflict khi chạy song song; fix kernel observer, free ports, cleanup process-group"
---

# Fix #397: design:compare seed fail do bootstrap race + port conflict

# Journal — vibe run issue #397 (teacher-os)

## Task
Fix #397 — `pnpm design:compare` seed fail với lỗi "no org yet, waiting for bootstrap".

## Root cause 1 — seed blind-poll DB trong khi bootstrap chưa chạy
- Seed blind-poll DB 21.75s trong khi bootstrap chỉ chạy khi request GET /api/kernel đầu tiên đi qua bootstrapMiddleware.
- `AbortSignal.timeout(15000)` + `retry: false` biến kernel chậm thành abort không retry.
- Chứng minh: throttle probe fail đúng 21.8s y hệt pattern của seed.

## Root cause 2 — port conflict khi nhiều agent chạy song song (bắt live nhờ diagnostics)
- Worktree AI song song (`ai-handle-issue-394-3`) chiếm port 8100 → signup đi vào DB của worktree khác.
- Fix: free port mỗi run.

## Fix đã làm
- Kernel observer + rescue goto.
- Free ports cho mỗi run.
- Process-group cleanup + SIGTERM/SIGHUP.
- Redact token trong log.
- Dump log stack khi seed fail.
- t-attendance appSteps rỗng (stale sau #391; nút Điểm danh inline là commit thật).

## Verification
- `design:compare` exit 0 ×2 (418 ảnh, 0 lỗi).
- Proxy 3-mode pass.
- Negative control pass.
- Code review: 0 Critical / 1 Important / 5 Minor — đã xử lý hết.
- 4 kongming gate GO.

## Ship
- PR #404 vào develop (squash merge).
- Follow-up issue #403.

## Bài học
- Instrumentation-first fix (diagnostics nằm ngay trong error path) chính là thứ bắt được root cause thứ hai.
- Máy "sạch" không tồn tại khi nhiều agent chạy song song — harness phải tự bọc free port.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
