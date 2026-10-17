---
title: "Phase 2: Exam Timer — chế độ Thi thật"
status: todo
---

# Phase 2: Exam Timer — chế độ Thi thật

## Context Links

- [Research §1](../reports/researcher-report.md) · [Scout §D](../reports/scout-report.md)
- Phụ thuộc: Phase 1. Red-team findings #4, #10, #11, #12, #15 (nhãn trễ ở Phase 5).

## Overview

Assignment có `timeLimitSeconds` (skill reading/listening/writing — speaking bị chặn ở contract) → take screen "Thi thật": countdown trong runtime header, warn <5 phút, hết giờ tự nộp qua drain-before-submit, chặn input thêm sau khi drain. Teacher đặt thời lượng khi TẠO đề (apps/web không có route edit prompt lẻ — red-team #4; sửa timeLimit sau tạo = tạo lại đề hoặc test-builder Apply). Đề không timeLimit giữ nguyên (luyện tập) — KHÔNG làm đồng hồ đếm lên (ngoài scope).

## Key Insights

- Không đếm tick: mỗi giây tính `remaining = deadline − (Date.now() + clockOffset)`; tab background throttle không làm mốc sai.
- **clockOffset phải từ fetch TƯƠI** (red-team #11): loader dùng `ensureQueryData` với staleTime 60s (`quiz.ts:70-76`) — cache cũ làm `serverNow` stale → offset sai tới 60s. Dùng `query.dataUpdatedAt` làm mốc client cho offset, hoặc tách query serverNow `staleTime: 0`.
- **Trạng thái countdown phải nằm trong component lá** (ExamCountdown tự giữ interval + state; auto-submit qua callback prop/callback ref) — KHÔNG lift `remainingMs` lên route component 554 dòng: QuizPaper không có `React.memo` (`quiz-paper.tsx:52`), 40 câu reconcile mỗi giây (red-team #11).
- **Chặn input trong cửa sổ submit** (red-team #12): ngay khi auto-submit trigger → set `submitting` flag disable toàn bộ input + chặn `store.setAnswer`; keystroke sau drain nếu vẫn queue sẽ ăn 409 → mất đáp án vĩnh viễn (halt clears pending + mirror).
- **Auto-submit × resume dialog** (red-team #6/10 FMA): loader redirect/hiện `QuizResumeDialog` khi có attempt in_progress; expired-at-load phải xử lý: auto-confirm resume (tạo store) rồi mới drain→submit — nếu store null thì `mutationFn` throw "No active attempt".
- **Speaking đã chặn ở contract** (Phase 1) — nhưng auto-submit vẫn phải xử lý nhánh submit FAIL chung (lỗi mạng, 409 lạ): hiện toast lỗi + trạng thái "Hết giờ" trên header, KHÔNG lặp retry vô hạn; học viên bấm nộp tay lần nữa được.
- Server KHÔNG từ chối nộp trễ — ghi `submittedAt` thật; nhãn "Nộp trễ" cho teacher làm ở Phase 5 (derive server-side).
- Teacher editor: pattern "MM:SS" của `test-header-form.tsx` (parse :48, lỗi :70); KHÔNG áp cho đề Speaking (ẩn field).

## Requirements

- [ ] Teacher đặt thời lượng (MM:SS, 1 phút–3 giờ) khi soạn đề mới; bỏ trống = luyện tập; POST round-trip qua GET snapshot.
- [ ] Take screen hiển thị countdown mm:ss (DM Mono) khi đề có timeLimit; warn token <5 phút.
- [ ] Hết giờ: chặn input → drain → submit → thông báo "Hết giờ — bài đã tự động nộp"; nhánh submit fail hiện trạng thái + cho nộp tay.
- [ ] Refresh/tab background/mở lại tab: remaining đúng từ server (offset fetch tươi), không reset.
- [ ] Đề không timeLimit và đề Speaking: hành vi hiện tại giữ nguyên (không regression).

## Architecture

```
[GET quiz detail (fresh)] → { timeLimitSeconds, attempt.startedAt, serverNow }
client (loader/effect): clockOffset = serverNow − clientNowAt(dataUpdatedAt)
deadline = startedAt + timeLimitSeconds
ExamCountdown (leaf component, interval 1s internal):
  remaining = deadline − (Date.now() + clockOffset)
  isDanger < 5 phút; isExpired ≤ 0 → onExpired() (một lần)
onExpired (route): setSubmitting(true) → disable inputs → store.drain() → submitQuizAttempt
  → thành công: navigate summary + toast "Hết giờ — bài đã tự động nộp"
  → thất bại: header "Hết giờ", toast lỗi, vẫn cho bấm Nộp tay
expired-at-load + needsResumeDialog: auto-resume (tạo store) rồi onExpired
```

- `useExamCountdown` tách 2 lớp: pure `computeExamRemaining({startedAtISO, timeLimitSeconds, clockOffset, nowMs})` (test node) + hook giữ interval internal, callback `onExpired` ref mới nhất.

## Files to Create / Modify

- Create: `apps/student/src/lib/exam-countdown.ts` (pure + hook)
- Create: `apps/student/src/components/quiz/exam-countdown.tsx` (leaf, tự state)
- Create: `apps/student/test/exam-countdown.test.ts`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (offset từ dataUpdatedAt; render ExamCountdown vào children `QuizRuntimeHeader` (:65 slot); submitting flag disable input + chặn setAnswer; onExpired flow; expired-at-load × resume dialog :157-167/:508-516)
- Modify: `apps/web/src/components/assignments/prompt-composer.tsx` (ComposerValue :18-37 + field "Thời lượng làm bài" MM:SS; ẩn khi skill === speaking)
- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` (freshComposer mặc định — create-only, không có route edit)

## Implementation Steps

1. `exam-countdown.ts`: `computeExamRemaining` + `formatExamClock` + `useExamCountdown({deadlineMs, clockOffsetMs, onExpired})` — interval internal, cleanup unmount, onExpired bắn 1 lần.
2. `ExamCountdown`: DM Mono, warn khi danger, `role="timer"`.
3. Route wiring: offset = serverNow − dataUpdatedAt-moment; render countdown ở header; `submitting` state → disable mọi input câu + chặn `store.setAnswer`; onExpired gọi đúng submit mutation (skip guard dialog).
4. Expired-at-load: nếu `needsResumeDialog` → tự confirm resume → tạo store → onExpired; nếu đã submitted → redirect summary như hiện tại.
5. Nhánh submit fail (network/409 lạ): header hiện "Hết giờ", toast lỗi 1 lần, nút Nộp tay hoạt động; KHÔNG auto-retry loop.
6. Web editor field: parse "MM:SS" regex `^([0-9]{1,2}):([0-9]{2})$`, 60–10800s; trống = null; ẩn với speaking; help text "Bỏ trống để học viên luyện tập không giới hạn thời gian".
7. Test node: computeExamRemaining (boundary 0/danger/>1h/offset±), expired-at-load flow (mock store), "submitting chặn setAnswer" (store test).

## Todo

- [ ] Pure logic + hook countdown (offset từ dataUpdatedAt) + unit test
- [ ] ExamCountdown leaf component (state nội bộ, không lift)
- [ ] onExpired flow: chặn input → drain → submit; nhánh fail + expired-at-load × resume dialog
- [ ] Web editor field MM:SS (create-only, ẩn speaking) + round-trip
- [ ] Verify không regression đề không timeLimit

## Success Criteria

- Đề timeLimit 60s: countdown 01:00 đúng; F5 không reset; hết giờ tự nộp, keystroke trong 0.5s cuối KHÔNG mất (input đã disable trước drain); summary chứa giá trị answers cuối.
- Đồng hồ client lệch +2 phút → remaining đúng (offset tươi); SPA-nav quay lại trong 60s → remaining KHÔNG phình theo cache.
- Đề Speaking / đề không timeLimit: không countdown, nộp như cũ.
- `pnpm --filter student run test` + `pnpm check-types` pass.

## Risk Assessment

- Interval 1s chỉ re-render leaf ExamCountdown — route không giữ remainingMs state.
- Submit fail tại expired: bài kẹt in_progress — học viên vẫn nộp tay; server nhận mọi lúc (chấp nhận).
- Hai tab: CAS submit idempotent (:1576-1586).

## Security Considerations

- Wire đề sạch giữ nguyên; timeLimit validate 60–10800 input teacher, wire student không min (e2e seed ngắn).

## Next Steps

→ Phase 3 (Flag) độc lập sau Phase 1.
