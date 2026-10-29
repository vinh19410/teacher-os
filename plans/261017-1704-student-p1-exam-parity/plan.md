---
title: "P1 Student Exam Parity — thi thật, listening, giải thích, lịch sử, PWA"
description: "Triển khai gói P1 từ report phân tích Step IELTS (2026-10-17): timer thi thật, flag câu, listening audio + transcript, explanation từng câu, trang lịch sử + streak, PWA/feedback/guide cho student app."
status: pending
priority: P1
effort: 48h
issue: 358
branch: develop
tags: [feature, frontend, backend, database, api]
blockedBy: []
blocks: []
created: 2026-10-17
---

# P1 Student Exam Parity

> GitHub issue: [#358](https://github.com/vinh19410/teacher-os/issues/358) (label `ready to review`)

## Overview

Triển khai 6 hạng mục P1 của report [`plans/reports/2026-10-17-stepielts-competitor-analysis.md`](../reports/2026-10-17-stepielts-competitor-analysis.md) (mục "Đề xuất copy — P1") để thu hẹp gap lớn nhất với Step IELTS phía học viên: **(1)** timer chế độ Thi thật per assignment (đếm ngược, tự nộp), **(2)** flag 🚩 từng câu + cảnh báo khi nộp, **(3)** listening audio player (teacher upload MP3) + transcript hiện sau nộp, **(4)** explanation per question ở màn review, **(5)** trang Lịch sử làm bài + streak, **(6)** PWA installable + widget Báo lỗi/Góp ý + trang hướng dẫn.

Nguồn bằng chứng: [scout report](./reports/scout-report.md) (codebase touchpoints) và [research report](./reports/researcher-report.md) (best practices có citation).

## Key Decisions (từ scout + research + red-team 2026-10-17)

1. **Timer server-authoritative**: deadline = `startedAt + timeLimitSeconds` nằm DB; client chỉ render (anchor `Date.now()`, bù offset `serverNow` — offset tính từ fetch TƯƠI, mốc `dataUpdatedAt`, không dùng cache stale 60s); auto-submit client là tiện nghi, nộp trễ vẫn nhận và ghi `submittedAt` thật + nhãn "Nộp trễ" derive server-side cho teacher. Không đếm tick `setInterval` (tab background throttle). `timeLimitSeconds` KHÔNG áp dụng cho đề Speaking (contract superRefine chặn — submit Speaking cần media, auto-submit sẽ kẹt MEDIA_REQUIRED).
2. **`timeLimitSeconds` nhân bản từ full-test** (`assignment_test` đã có :29) xuống `assignment_prompt` — null = luyện tập như hiện tại; cap 3h khớp full-test. Editor teacher dùng pattern input "MM:SS" của `test-header-form.tsx`. Lưu ý: **không có route edit prompt lẻ** trong apps/web (create-only; sửa = tạo lại / test-builder Apply) — editor là `/assignments/new`.
3. **Listening audio tái dùng media-store** (raw PUT stream + GET qua worker, blob fetch kèm header org) — KHÔNG引入 presigned URL. "Phát 1 lần/chặn seek" là **honor-policy UI** chỉ ở chế độ thi (play-state mirror localStorage per attempt; chấp nhận người quyết心 vượt qua); khi đề có timeLimit, GET audio server gate theo attempt (in_progress nghe trong bài / submitted nghe lại) + log. Luyện tập nghe tự do; `play()` gọi trong user gesture (iOS).
4. **Flag là state riêng, không đụng map `answers`** (grader `grade-quiz` đọc answers): cột `quiz_attempt.flags` JSON, ghi bằng `UPDATE ... SET flags = ?` (whole-doc; last-write-wins chấp nhận); mirror localStorage mở rộng shape `{t, answers, flags}` + pagehide keepalive flush như answers.
5. **Explanation phải forward ở CẢ HAI parse layer** — `parseQuizQuestions` (student.ts:129-158, whitelist strip field lạ) và `parseQuestions` (snapshot.ts:107-150) + type `KernelAssignmentPromptRow.questions` + web `assignment-presets`/`assignment-draft-store`; KHÔNG phải "tự vào snapshot" (red-team Critical #1). Contract `.strict()` + explicit update map → **server + student deploy CÙNG release train** (precedent #304: `.strict()` parse client làm bundle cũ vỡ với payload server mới; web teacher có thể sau server).
6. **PWA không service worker** — issue #125 (SW làm vỡ SPA boot, đã tháo vite-plugin-pwa) + spec e2e `no-service-worker.spec.ts` (spec hiện chỉ cover web → chắc chắn thêm student). Chỉ manifest + icons maskable 192/512 + `apple-*` meta.
7. **Feedback auth student** (app auth-gated toàn bộ): rate limit = COUNT feedback của student trong 1 giờ ≤ 5 (best-effort — D1 không transaction, race chấp nhận, ghi rõ), honeypot + cap 2000 ký tự + `pageUrl` chỉ nhận relative path `/` (chặn `javascript:` stored-XSS); endpoint đăng ký `requireStudent` + `quizWriteGuard` (Origin check — cookie SameSite=None). KHÔNG bảng rate-limit riêng, KHÔNG anonymous. **Teacher /feedback view NGOÀI scope P1** (report chỉ yêu cầu endpoint) — follow-up, tạm xem bằng SQL.
8. **Skill không nằm trên attempt** — query lịch sử join `class_assignment → assignment_prompt` theo chuẩn `loadOwnedAttemptWithSkill`; thêm index `quiz_attempt(student_id, submitted_at)` trong migration 0036.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chế độ Thi thật per assignment: countdown, tự nộp hết giờ, bù clock drift, sống qua refresh | P1 |
| 2 | Flag 🚩 từng câu khi làm bài, persist + cảnh báo khi nộp còn câu flagged | P1 |
| 3 | Listening: teacher upload MP3 thật, student nghe được; transcript hiện sau nộp | P1 |
| 4 | Explanation per question: teacher soạn, student xem ở review sau nộp | P1 |
| 5 | Trang Lịch sử làm bài (skill/thời gian) + streak ngày học | P1 |
| 6 | PWA installable + widget Báo lỗi/Góp ý + trang Hướng dẫn | P1 |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & Contracts nền](./phase-01-schema-contracts.md) | Pending |
| 2 | [Exam Timer — chế độ Thi thật](./phase-02-exam-timer.md) | Pending |
| 3 | [Question Flag 🚩](./phase-03-question-flag.md) | Pending |
| 4 | [Listening Audio + Transcript + Explanation](./phase-04-listening-explanation.md) | Pending |
| 5 | [Lịch sử làm bài + Streak](./phase-05-history-streak.md) | Pending |
| 6 | [PWA + Feedback + Hướng dẫn](./phase-06-pwa-feedback-guide.md) | Pending |
| 7 | [E2E & Verification Gate](./phase-07-e2e-verification.md) | Pending |

## Dependencies

- Phase 1 chạy đầu tiên (migration 0036 + contracts) — mọi phase sau phụ thuộc field mới.
- Phase 2, 3 độc lập nhau sau Phase 1; Phase 4 phụ thuộc Phase 1 (audio_key, explanation, transcript contract); Phase 5, 6 gần như độc lập (Phase 6 chỉ cần migration 0036 từ Phase 1).
- Phase 7 tổng verification toàn bộ.
- **Deploy order**: migration 0036 prod TRƯỚC worker (lesson #319 — query select full row sẽ 500 khi thiếu cột, `/readyz` không phát hiện); server + student CÙNG release train (precedent #304 — `studentQuizDetailSchema.strict()` parse client-side làm bundle student cũ vỡ với payload server mới); apps/web (teacher) có thể deploy sau server.

## Success Criteria

- [ ] Assignment có timeLimit: take screen hiện countdown đúng (sống qua refresh, đúng sau tab background, offset từ fetch tươi), hết giờ tự nộp (drain answers trước, chặn input thêm sau khi drain), nộp trễ server vẫn nhận + `submittedAt` thật + nhãn "Nộp trễ".
- [ ] Flag: toggle từng câu, marker navigator + submit guard dialog ("Bạn còn N câu đang đánh dấu xem lại"), persist qua refresh kể cả đóng tab trong cửa sổ debounce (pagehide flush).
- [ ] Listening: teacher upload MP3 trong editor create (đúng MIME/size), student nghe được ở take screen; chế độ thi play-once theo honor-policy (gate attempt server-side khi timeLimit); transcript hiện ở summary/detail sau nộp.
- [ ] Explanation: teacher soạn từng câu, forward qua CẢ HAI parse layer (không bị strip), student thấy "Giải thích" per câu ở review (fallback note cũ khi không có; attempt start trước deploy có fallback đọc prompt).
- [ ] Trang Lịch sử: list attempts theo skill/thời gian (filter URL param), streak + số bài 7 ngày đúng dữ liệu seed, nhãn nộp trễ.
- [ ] PWA: manifest + icons + apple meta, KHÔNG service worker (spec mở rộng cover student); widget feedback gửi được (guard CSRF + rate limit 5/giờ best-effort); trang Hướng dẫn render đủ nội dung.
- [ ] Gate local pass: `pnpm check`, `pnpm check-types`, `pnpm --filter web run test`, `pnpm --filter student run test`, `pnpm --filter server run test` (packages/ui KHÔNG có script test — bỏ khỏi gate), `pnpm e2e` (ports 8100/8101/8103).

## Out of Scope (ghi rõ)

- Đồng hồ đếm lên chế độ luyện tập; heatmap/bảng tuần kiểu Step IELTS; teacher `/feedback` view (follow-up — tạm xem bằng SQL); route edit prompt lẻ cho web (create-only; sửa qua tạo lại); anti-cheat sâu (fullscreen lock, log tab-switch); thẻ Pro/quota AI (P2/P3 report).

## Red Team Review

### Session — 2026-10-17
**Reviewer:** 4 persona (Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Scope Auditor, Scope & Complexity Critic/Contract Verifier) — Full tier.
**Findings:** 27 thô → 15 sau dedup/cap (15 accepted, 0 rejected; 3 accepted-modified)
**Severity breakdown:** 2 Critical, 8 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `parseQuizQuestions` (student.ts:129-158) + `parseQuestions` (snapshot.ts:107-150) là whitelist parser — `explanation` bị strip ở ghi snapshot LẪN read path teacher; claim "tự vào snapshot" sai (3 reviewer độc lập) | Critical | Accept | Phase 1, 4, 7 |
| 2 | Gate `pnpm --filter ui run test` không tồn tại (packages/ui chỉ có `check-types`, 0 test file) — DoD không thể pass | Critical | Accept | Phase 3, 7, plan.md |
| 3 | Deploy order "server trước student" tự mâu thuẫn: `studentQuizDetailSchema.strict()` + client `.parse` (quiz.ts:66) làm bundle cũ vỡ với payload mới; precedent #304 (contracts.ts:1945-1951) kết luận cùng release | High | Accept | plan.md, Phase 1, 7 |
| 4 | KHÔNG có route edit prompt lẻ trong apps/web — `assignments/$assignmentId.tsx` là màn chấm; PATCH chỉ được gọi từ test-builder Apply (data-actions.ts:236-240) | High | Accept | Phase 2, 4 |
| 5 | Migration prod phải chạy TRƯỚC worker; `/readyz` không kiểm cột → blindspot (lesson #319, select full row 500) | High | Accept | Phase 1 |
| 6 | Endpoint student mới (audio/history/feedback/flags) phải đăng ký `requireStudent`/`quizWriteGuard` per-path trong studentRoutes closure; Hono use(path) chỉ khớp đúng path — đăng ký 2 dạng (#320); feedback cần Origin check (cookie SameSite=None) | High | Accept | Phase 3, 4, 5, 6 |
| 7 | Thiếu READ-path teacher cho `timeLimitSeconds`: snapshot.ts map prompt :513-543 + `KernelAssignmentPromptRow` + web mapper + `assignment-presets` (emptyItem/emptyComposer) + `assignment-draft-store` shape — không thêm thì round-trip xoá im lặng | High | Accept | Phase 1 |
| 8 | `page_url` feedback chỉ cap 500 — thiếu validate scheme → stored XSS `javascript:` khi render link | High | Accept | Phase 1, 6 |
| 9 | GET audio prompt không gate attempt (tải được pre-start/chia sẻ); play-once reset khi F5 (state in-memory) | High | Accept (modified: gate in_progress/submitted khi timeLimit + log GET + play-state localStorage + gọi đúng tên honor-policy) | Phase 4 |
| 10 | `timeLimitSeconds` cho phép gắn lên đề Speaking → auto-submit đụng MEDIA_REQUIRED (CAS flip có predicate mediaKey, student.ts:1576-1584), thi treo ở 00:00; cap 4h lệch full-test 3h | High | Accept | Phase 1, 2 |
| 11 | clockOffset tính từ cache staleTime 60s → remaining sai tới 60s; "chỉ ExamCountdown re-render" sai — QuizPaper không memo, 40 câu reconcile mỗi giây | Medium | Accept | Phase 2 |
| 12 | Cửa sổ keystroke sau drain-before-submit: input chưa disable, PATCH trễ ăn 409 → đáp án/flag cuối mất vĩnh viễn | Medium | Accept | Phase 2, 3 |
| 13 | Flags: spec `json_set(quiz_attempt, 'flags', ?)` sai cú pháp (cột riêng → `UPDATE SET flags = ?`); thiếu pagehide keepalive flush + mirror shape `{t, answers, flags}`; copy dialog lệch giữa Phase 3/7; component thật là `quiz-lifecycle-dialogs.tsx:149-172` | Medium | Accept | Phase 3, 7 |
| 14 | History: thiếu index `quiz_attempt(student_id, submitted_at)`; test path `apps/server/test/` ngoài vitest include `src/**/*.test.ts` (phantom test); chip-filter chưa tồn tại ở apps/student; mini-list home vượt "streak đơn giản" | Medium | Accept | Phase 1, 5 |
| 15 | Misc: late-submit không quan sát được (teacher không có phương tiện thấy trễ); seed audio e2e bất khả thi (MEDIA_DIR private mkdtemp trong boot.ts:98 — chuyển sang upload qua API teacher); e2e refresh cần seed dài riêng; rate-limit boundary chuyển sang server test; teacher `/feedback` view ngoài scope report P1 | Medium | Accept (modified: cắt teacher view → Out of Scope/follow-up) | Phase 2, 5, 6, 7 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-07
- Decision deltas checked: 15 (deploy order, parser layers, speaking gate, ui-test gate, teacher view cut, honor-policy audio, flags SQL, e2e seeding, index, test paths)
- Reconciled stale references: 9 (Key Decisions, Dependencies, Success Criteria, Out of Scope thêm mới; phase 1-7 cập nhật tại chỗ theo bảng trên)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-10-17 (auto, hard mode)

**Verification Results (Full tier, gộp từ 4 red-team reviewer):**
- Tier: Full (7 phases, 4 role)
- Claims checked: ~60 (Fact Checker 36 + Flow Tracer 10 path + Scope Auditor 11 + Contract Verifier các schema consumer)
- Verified: 54 | Failed: 6 (đều đã trở thành finding và ĐÃ ÁP: parse layers strip explanation; deploy-order strict; gate ui-test; read-path teacher timeLimit; seed audio MEDIA_DIR; test path ngoài include)
- Unresolved: 0

**Câu hỏi validation + quyết định (autonomous — chọn theo phương án recommended từ evidence):**
1. *Timer: server chặn nộp trễ hay nhận + ghi nhãn?* → Nhận + derive `late` hiển thị (matching research + KISS; anti-cheat sâu ngoài P1).
2. *Audio play-once: presigned URL hay stream hiện có?* → Stream media-store + honor-policy UI + gate attempt khi thi (matching kiến trúc Speaking hiện có, không surface mới).
3. *PWA: có service worker không?* → Không (issue #125 + spec e2e; Chrome không yêu cầu).
4. *Feedback: anonymous hay auth?* → Auth student + quota mềm best-effort (app auth-gated; D1 không transaction).
5. *Teacher /feedback view: trong P1?* → KHÔNG (ngoài report P1 — cắt vào Out of Scope, follow-up).
6. *Home mini-list 3 bài?* → Bỏ (vượt "streak đơn giản"; giữ streak mini + link).
7. *Cap timeLimit?* → 3h (10800) khớp full-test; chặn Speaking.
8. *Deploy order?* → Migration trước worker; server + student cùng release train; web teacher sau server (#304 + #319).

### Whole-Plan Consistency Sweep (post-apply)
- Files reread: plan.md + phase-01…07 (sau khi áp 15 findings)
- Decision deltas checked: 15
- Reconciled stale references: 9
- Unresolved contradictions: 0

<!-- slug: student-p1-exam-parity -->
