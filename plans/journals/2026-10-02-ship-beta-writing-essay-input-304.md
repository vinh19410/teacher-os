---
title: "Ship beta Writing essay input (#304)"
date: 2026-10-02
---

# Ship beta Writing essay input (#304)

---
title: Ship beta Writing essay input (#304)
date: 2026-10-02
summary: "Reuse plan đã red-team, implement 3 phase essay Writing (DB+endpoint, UI take, summary/e2e), fix findings code review, ship PR vào develop."
---

# Ship beta Writing essay input (#304)

## What happened
Plan `261002-1242` đã có sẵn trên develop từ phiên plan riêng — vibe reuse thay vì tạo mới. Trước khi cook, chạy thêm round red-team adversarial 3 reviewer song song (Security/Fact-Checker, Failure-Mode/Flow-Tracer, Assumption-Destroyer/Contract-Verifier) trên plan gốc: 17 findings thô → 12 sau dedupe, 7 accepted apply vào plan (nổi bật: route review-detail render textarea trống cho bài đã nộp — bị cả 3 reviewer chỉ; footer thiếu testid navigator-progress làm e2e helper timeout; join assignmentPrompt thiếu orgId; SPA-return trong staleTime 60s thấy textarea trống; aria-live spam mỗi keystroke).

Implement theo 3 phase: migration 0031 cột `essay` + PATCH `/attempts/:id/essay` (writing-only, owner-scoped, CAS in_progress, body cap 48KB riêng qua quizWriteGuard path suffix); UI take tái dùng nguyên `createQuizAttemptStore` với option `valueMax` mới (textarea tắt spellcheck + strip C0/U+2028/2029, footer đếm từ mục tiêu 150/250 chỉ cảnh báo, guard dialog copy riêng); summary + trang detail hiện lại bài đã nộp kèm số từ (`AttemptSummaryBody` extract để unit test). Kèm consolidation: `wordCount` của web thành re-export của `countWords` (@teacher-os/api) — single source.

Gates: pnpm check, check-types, server 451, student 170, web 1175, e2e full suite 119 passed (test Writing mới phủ reload + SPA-return resume + guard nộp thiếu từ). Code review local (fresh-context reviewer): 0 Critical / 2 Important / 3 Minor — fix F1 (bỏ role=status khỏi counter visible, announce chỉ ở sr-only milestone), F2 (claim deploy-window sai cho schema strict — sửa comment contract + plan Risks cho trung thực: bundle cũ + server mới vẫn throw trên summary/detail tới khi reload), F3 (strip thêm U+2028/2029); F4 (dispose flush race) accept theo precedent RT#14, F5 non-issue (modal overlay chặn interaction). Rerun các gate ảnh hưởng + e2e writing test — xanh.

## Decision
- `essay` optional-nullable trên summary schema: chỉ bảo vệ chiều client mới + server cũ; chiều ngược lại chấp nhận cửa sổ throw-until-reload (không thể vá từ server vì parser bundle cũ đã deploy) — ghi rõ trong PR + runbook deploy server trước student.
- Flake có sẵn trong e2e leak-check (assert tức thời trên capture async) sửa bằng expect.poll — không weaken assertion.
- 3/3 plan phase checked, plan status completed; issue #304 giữ OPEN chờ stable promotion (merge vào develop không tự đóng).

## Next steps
Follow-up issue: giáo viên đọc/chấm bài viết Writing đã nộp (non-goal của #304). Stable promotion theo quy trình riêng khi được yêu cầu.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
