---
title: "Fix #395: dashboard không còn chỉ buổi hôm nay đã qua giờ làm Buổi tới (đồng bộ server với #393)"
date: 2026-10-22
---

# Fix #395: dashboard không còn chỉ buổi hôm nay đã qua giờ làm "Buổi tới"

Root cause: `loadNextSession` (server) chỉ lọc `gte(date, todayISO)` + `LIMIT 1` — không xét giờ kết thúc, nên buổi hôm nay đã qua giờ (kể cả đã check-in `completed`) vẫn bị trả làm `nextSession` cho dashboard học viên.
Fix: chữ ký mới `loadNextSession(db, orgId, classId, now: Date)` — fetch rows `date >= hôm nay (giờ VN)` rồi chọn buổi đầu tiên chưa qua end (helper thuần chung `vietnamSessionEndMs` trong `packages/api/vietnam-date.ts`, NaN→coi chưa kết thúc, nhất quán `isLessonEnded` client #393); không lọc `status` (predicate thuần thời gian — red-team bác bằng chứng "test pin absent" vì assertion ~741 khớp cả les-1/les-peer do tie-break rowid); 2 call sites truyền cùng một `now`/request, dọn biến chết; client delegate phần math về helper, giữ policy.
Tests (TDD): RED trước — T1/T2 fail đúng assertion (nhận buổi `00:00` dur 0 đã hết giờ); seed độc lập đồng hồ (dur 0 = end 00:00 VN hôm nay luôn đã hết; 23:00+90' = end mai 00:30 luôn chưa hết; KHÔNG fake timers với harness libsql — red-team loại); boundary `end == now` inject `now` trực tiếp. Server 721/721 (715 + 6 mới), student 351/351 (không đụng test client), api helper 4/4, check-types 7/7, `pnpm check` exit 0 (0 warning mới), full e2e 173 pass / 1 skipped (port override 8300/8301/8303 — 8100-8103 bị stack worktree #397 chiếm, không đụng stack agent khác).
Review: red-team 2 reviewer trước implement (9 findings, bỏ fake timers + đảo bằng chứng kongming); code review fresh-context sau implement 0 Critical / 0 Important / 4 Minor (bỏ LIMIT đổi profile hiệu năng nhẹ; tie-break tiền tồn tại; status-unpinned có chủ đích; comment seed overstated — đã sửa).
Bài học: worktree mới cần `pnpm install` trước khi chạy test; khi sibling worktree đang chiếm port e2e chuẩn thì đổi port override thay vì kill stack của agent khác; `Date.parse("…T24:00:00…")` trên V8 ra số (không NaN) — đừng assert null cho case đó; CI/E2E GitHub chỉ trigger `main`, develop push không có workflow nào (staging auto-deploy tắt từ 2026-09-22) — gate develop chính là bộ lệnh local.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
