---
title: Plan P1 Student Exam Parity
date: 2026-10-17
summary: "ak:plan hard mode cho P1 Step IELTS parity: 7 phases, red-team 4 personas bắt 2 Critical (parser whitelist strip explanation; gate ui-test không tồn tại), 15 findings áp hết"
---

# Plan P1 Student Exam Parity

# Plan P1 Student Exam Parity (issue #358)

## Bối cảnh
User yêu cầu ak:plan --github triển khai 6 hạng mục P1 từ report đối thủ Step IELTS (plans/reports/2026-10-17-stepielts-competitor-analysis.md): timer thi thật, flag câu, listening audio + transcript, explanation per question, lịch sử + streak, PWA/feedback/guide.

## Đã làm
- Hard mode: scout Explore (codebase touchpoints, ~75 tool calls) + researcher (best practices có citation: server-authoritative timer, play-once là policy UI, PWA không cần SW, feedback quota mềm).
- Plan `plans/261017-1704-student-p1-exam-parity/` — 7 phases, 73 tasks, effort 48h, scaffold + status qua ak CLI.
- Red-team 4 personas (Full tier): 27 findings thô → 15 sau dedup, chấp nhận + áp hết (3 accepted-modified), 0 unresolved contradiction.

## Bài học quan trọng (red-team bắt được)
1. **CRITICAL — parse layer whitelist**: `parseQuizQuestions` (student.ts:129-158) và `parseQuestions` (snapshot.ts:107-150) strip field lạ — claim "explanation tự vào questionsSnapshot" sai; phải forward thủ công ở cả 2 layer + KernelAssignmentPromptRow (đúng regression class type/pin đã từng xảy ra). 3/4 reviewer bắt độc lập.
2. **CRITICAL — gate ảo**: `pnpm --filter ui run test` không tồn tại (packages/ui chỉ có check-types) — DoD phải bỏ ui khỏi gate.
3. Deploy order: `.strict()` parse client-side (quiz.ts:66) nghĩa là server-mới + student-bundle-cũ vỡ — precedent #304 là server + student CÙNG release train, KHÔNG phải server-trước; migration vẫn trước worker (#319, /readyz blindspot).
4. apps/web KHÔNG có route edit prompt lẻ — `$assignmentId.tsx` là màn chấm; editor create-only.
5. timeLimit trên Speaking đụng MEDIA_REQUIRED ở CAS submit → contract superRefine chặn speaking, cap 3h khớp full-test.
6. E2e seed audio bất khả thi qua đĩa (MEDIA_DIR mkdtemp private trong boot.ts:98) — seed qua API teacher upload.
7. Hono use(path) khớp đúng path (#320) — endpoint student mới phải đăng ký requireStudent/quizWriteGuard 2 dạng path.

## Hạ tầng quyết định
Timer server-authoritative + offset từ fetch tươi (dataUpdatedAt, không cache stale 60s); play-once honor-policy + gate attempt + log GET; flags whole-doc UPDATE SET + keepalive flush; feedback auth student + pageUrl chỉ relative path (chống stored-XSS); teacher /feedback view cắt khỏi scope (follow-up).

## Next
`/ak:cook plans/261017-1704-student-p1-exam-parity/plan.md` — Phase 1 (schema + parser layers) chạy đầu.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
