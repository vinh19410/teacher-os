---
title: "Phase 3: Question Flag — đánh dấu câu xem lại"
status: todo
---

# Phase 3: Question Flag — đánh dấu câu xem lại

## Context Links

- [Scout §D](../reports/scout-report.md) · Report P1 item 2
- Phụ thuộc: Phase 1 (cột flags + wire). Red-team findings #2, #6, #12, #13.

## Overview

Học viên đánh dấu câu cần xem lại khi làm bài: nút flag mỗi câu, marker navigator, cảnh báo trong submit guard khi còn câu flagged. Flag persist như answers (mirror localStorage + PATCH server + **pagehide keepalive flush**) nên sống qua refresh kể cả đóng tab trong cửa sổ debounce.

## Key Insights

- Flag là state riêng, **KHÔNG nhét map `answers`** (grader `grade-quiz` đọc answers).
- Persist 3 lớp như answers (red-team #13): mirror localStorage **mở rộng shape** `{t, answers, flags}`; PATCH `UPDATE quiz_attempt SET flags = ? WHERE ...` (**whole-doc SET, KHÔNG phải `json_set(quiz_attempt,...)`** — flags là cột riêng, json_set chỉ dùng cho cột JSON answers); **pagehide/beforeunload keepalive flush** ($assignmentId.tsx:306-331) phải gọi thêm sender flags — mirror bị `finalize()/dispose()` xoá (:398-411) nên keepalive là lớp bền thật.
- **Drain trước submit**: flags PATCH không được "động cơ riêng không chặn drain" — trong cửa sổ submit (red-team #12), flag toggle cuối phải được drain (hoặc bị chặn cùng input khi `submitting`); chọn: chặn toggle khi submitting + drain pending flags trước POST submit (cùng wave với answers).
- Whole-doc flags = last-write-wins giữa 2 tab (khác per-key json_set của answers) — chấp nhận, ghi rõ: flag là bookmark tiện nghi, mất merge 2 tab không phá tính năng.
- **Guard dialog component thật** ở `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx:149-172` (`:527-551` trong route chỉ là usage site); copy chốt MỘT chuỗi dùng chung phase 7: **"Bạn còn N câu đang đánh dấu xem lại"**.
- Endpoint PATCH flags nằm trong studentRoutes closure + đăng ký `router.use("/attempts/:id/flags", quizWriteGuard)` (red-team #6 — pattern guard `:643-644` mới chỉ cover `/assignments/:id/quiz/*` + `/attempts/*`; path `/attempts/:id/flags` CẦN kiểm tra khớp pattern `/attempts/*` hiện có — nếu khớp thì guard tự phủ, verify khi làm).
- Test UI đặt ở `apps/student/test/` (pattern renderToStaticMarkup như `quiz-navigator.test.tsx`) — packages/ui KHÔNG có runner test (red-team #2).

## Requirements

- [ ] Nút toggle flag mỗi câu (aria-pressed "Đánh dấu xem lại"), chặn khi submitting.
- [ ] Navigator marker ô câu flagged (không đè verdict colors).
- [ ] Guard dialog: "Bạn còn N câu đang đánh dấu xem lại" (song song cảnh báo câu trống hiện có; sync copy với Phase 7).
- [ ] Flag persist: mirror `{t, answers, flags}` + PATCH server + pagehide keepalive; resume reconcile như answers.
- [ ] Flag không đổi kết quả chấm.

## Architecture

```
UI toggle → store.setFlag(key, bool) → debounce 600ms → PATCH /student/attempts/:id/flags {flags}
                                 ↘ mirror localStorage (shape mở rộng {t, answers, flags})
pagehide/beforeunload → flush keepalive: drain answers + drain flags
submit flow: submitting chặn toggle → drain answers + flags → POST submit
```

Server PATCH flags: auth student + ownership + status `in_progress`; body `Record<string, boolean>`, key ∈ questionsSnapshot keys, ≤ số câu; `UPDATE quiz_attempt SET flags = ? WHERE id = ? AND org_id = ? AND student_id = ? AND status = 'in_progress'` (0 rows → 404/409 phân biệt như PATCH answer).

## Files to Create / Modify

- Modify: `apps/student/src/lib/quiz-attempt-store.ts` (state flags + mirror shape + drain + resume + setFlag chặn khi halted)
- Modify: `apps/server/src/routes/student.ts` (PATCH `/attempts/:id/flags` cạnh :1192; verify guard pattern)
- Modify: `packages/api/src/contracts.ts` (request schema flags nếu Phase 1 chưa thêm)
- Modify: `packages/ui/src/components/quiz/quiz-navigator.tsx` (props `flags?`; marker)
- Modify: `packages/ui/src/components/quiz/quiz-question-item.tsx` (nút toggle; icon lucide-react `Flag` — dependency có sẵn cả 3 app)
- Modify: `apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx` (:149-172 section câu flagged)
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (wire + keepalive flush flags + submitting chặn toggle)
- Modify: `apps/student/test/quiz-attempt-store.test.ts` (flags: persist/drain/resume/keepalive payload) + test dialog copy.

## Implementation Steps

1. Store: thêm `flags` state + `setFlag` (chặn khi halted/submitting); mirror shape mở rộng; drain flags cùng hàng đợi; pagehide flush gửi cả flags (keepalive).
2. Server: PATCH flags endpoint (§ Architecture); test server: ownership + status + key lạ bị bỏ (không 500).
3. UI: nút flag (lucide `Flag`, aria-pressed, focus ring cam); navigator marker (ring/góc, không đổi màu verdict).
4. Dialog: thêm dòng "Bạn còn N câu đang đánh dấu xem lại" (chỉ khi N > 0); đồng bộ chuỗi assert phase 7.
5. Tests: store node + dialog renderToStaticMarkup (nhánh có/không có flagged).

## Todo

- [ ] Store flags (mirror shape mở rộng + drain + keepalive + submitting chặn) + unit test
- [ ] Server PATCH /attempts/:id/flags (UPDATE SET, validate key, status in_progress) + guard verify
- [ ] UI: nút flag + navigator marker
- [ ] Guard dialog copy "Bạn còn N câu đang đánh dấu xem lại"
- [ ] A11y: aria-pressed, focus ring

## Success Criteria

- Flag câu 3 → F5 → vẫn flagged; đóng tab trong <600ms sau toggle → mở lại vẫn flagged (keepalive); nộp → guard đếm đúng; chấm điểm không đổi.
- Không flag: dialog không thêm dòng (không regression câu trống).
- `pnpm --filter student run test`, `pnpm --filter server run test`, `pnpm check-types` pass (KHÔNG có `--filter ui run test` — package không có runner).

## Risk Assessment

- 2 tab concurrently: last-write-wins cả record flags — chấp nhận (bookmark); mirror reconcile sau reload.
- Guard pattern Hono use(path) khớp đúng path (#320) — verify `/attempts/:id/flags` khớp `/attempts/*`; nếu không khớp, đăng ký thêm.

## Security Considerations

- Endpoint scoped ownership + status; key validate ∈ snapshot; không xuống review/detail wire.

## Next Steps

→ Phase 4 (Listening + Explanation) cùng take screen.
