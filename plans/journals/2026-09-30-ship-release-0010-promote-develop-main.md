---
title: "Ship release v0.0.10 — promote develop → main"
date: 2026-09-30
summary: "Release promotion develop→main v0.0.7→v0.0.10: rich text Tiptap #280, IELTS full test builder, student quiz take/review #283, teacher preview sim #285, student-view preview #282, dashboard schedule #278, quiz take split-pane + per-question type #286 (merge #288 giữa ship). Two-pass review tìm 1 Critical (transcript listening lộ wire take) + 1 High (mất vĩnh viễn stamp submittedAt khi batch hỏng sau flip) + 1 Medium CSRF gap — cả 3 fixed kèm regression tests. Gates chạy 2 lần 0 fail: tại a119905 (1.763 unit + e2e 108) và sau rebase #288 (1.801 unit + e2e 111/1 skip); changelog bổ sung 2 dòng thiếu (#282, CI/Infra), docs sync 4 file."
---

# Ship release v0.0.10 — promote develop → main

Release promotion theo precedent #277 (`chore(release): vX.Y.Z`), không có plan riêng (mọi plan feature trong delta đã completed trên develop trước promotion; #286 pending — chỉ mới plan doc, không thuộc release này).

## What happened

- **Delta:** `origin/main...HEAD` = 24 commits, 202 files, +27.931/−676. Themes: rich text Tiptap v3 cho 7 field authoring (#280), IELTS Full Test Builder + Answers Checking (entity `assignment_test`/`assignment_test_part`, migration 0029), luồng học viên làm bài + xem lại (#283, migration 0030 `quiz_attempt`), tab "Làm thử & Soi bài" preview giáo viên (#285), trang preview đề đã lưu theo góc nhìn học viên (#282), dashboard schedule cards gọn (#278), rename dev scripts.
- **Skip merge origin/main:** merge-base = đúng develop-parent của PR #277 (`6ae0c1d`); 3 commit main-only chỉ là promotion merge commits (#226/#244/#277) — zero content delta, cùng lập luận đã ghi trong #277 và #244.
- **Gates (tester subagent, mirror ci.yml + e2e.yml tại a119905):** biome 571 files sạch (1 info), check-types 7/7, `turbo run test --force` **1.763 passed / 0 failed** (server 427, web 1.145, student 110, auth 59, infra 17, landing 5), ci-workflow 3/3, topology-drift 8/8, build 4/4 (1 warning chunk web 866 kB), e2e self-contained port 8100/8101/8103 **108 passed / 1 intentional skip (Google OAuth thật) / 0 failed**.
- **Version:** 0.0.9 → 0.0.10, standalone root-only commit theo precedent (apps giữ 0.0.0).
- **Changelog:** date-based, đã phủ đủ trừ 2 chỗ — bổ sung dòng #282 (student-view preview page, feat có user-facing) và mục CI/Infra 2026-09-28 (dev:bare rename).
- **Docs (docs-manager subagent):** 4 file +46/−2 — sửa link chết rich-text sink trong codebase-summary (sink đã dời sang `@teacher-os/ui` ở #285), thêm architectural rule single DOMPurify sink + durable decisions (`assignment_test` composition/numbering, `quiz_attempt` 1-lượt/snapshot/server-grade/no-key-on-wire) vào PDR, runbook thêm rollback-safety migrations 0026–0030 (trả nợ recorded debt từ ship v0.0.7) + sign-off rows (v0.0.7 hồi cứu truthful "not recorded" cho smoke; v0.0.10 pending chờ evidence deploy thật).
- **Vận hành subagent:** code-reviewer dính 429 usage-limit ngay trước lúc ghi báo cáo — resume từ transcript với lệnh "ghi ngay, không thu thập thêm" thành công; journal do lead viết inline (journal-writer cùng pool quota Claude).
- **Mid-ship merge #288 (#286):** giữa pipeline, PR #288 (reading split-pane + per-cluster instructions + per-question `type`) merge vào `origin/develop` (10 commits, 36 files) — push bị reject, rebase 2 promotion commits lên trên (git tự drop commit bump vì 0.0.10 đã có upstream), dời fixture heal test sang `ca-q11` tránh đụng fixture `prompt-mixed` mới của #286 trên ca-q10, rồi **chạy lại toàn bộ gate mirror tại HEAD mới**: biome 574 files sạch, check-types 7/7, unit uncached **1.801 passed / 0 failed** (server 445, web 1.150, student 125, auth 59), build 4/4, e2e **111 passed / 1 skip / 0 fail**. Review coverage phần #286: review riêng của PR #288 + ak:review-pr trên release PR (Step 13) + CI.

## Code review (two-pass toàn delta, report `plans/reports/code-reviewer-260930-2033-release-v0010-review.md`)

**1 Critical + 1 High + 1 Medium fixed trước merge, kèm regression tests:**

1. **Critical — transcript đề listening lộ xuống wire take payload:** handler GET `/api/student/assignments/:id/quiz` trả `prompt.transcript` (nguồn suy ra đáp án listening) trong khi student app không render ở đâu; trái bất biến "answer/alts/note không bao giờ xuống wire" mà chính comment contract tuyên bố; e2e leak-check thiếu ban-list này. Fix theo hướng **xóa field khỏi payload hoàn toàn** (không giữ `""`): bỏ `transcript` khỏi `studentQuizDetailSchema` + handler + `QuizPaperDetail` Pick + sim builder web, bỏ 2 fixture student, thêm `'"transcript"'` vào leak-list server test và `"transcript"` vào ban-list key của e2e layer (b). Chuỗi xóa an toàn vì grep chứng minh không consumer nào đọc field.
2. **High — mất vĩnh viễn stamp `class_assignment_target.submittedAt`:** submit flip-first thắng CAS nhưng `db.batch` (correctCount + stamp) throw → client refetch thấy submitted → redirect summary, không bao giờ retry → stamp null vĩnh viễn, overview học viên + view giáo viên hiển thị "chưa nộp" dù đã nộp. Fix: retry path (thua CAS) đọc stamp; nếu null → chạy lại batch idempotent (grade thuần từ data đã freeze nên ghi lặp vô hại). Test mới: giả lập batch-hỏng bằng null-out stamp trực tiếp DB → submit lại → stamp healed.
3. **Medium — kernel CSRF Origin guard bỏ qua PATCH/PUT:** middleware chỉ check POST/DELETE; delta thêm 3 endpoint thuộc khoảng trống (PATCH prompts/tests, PUT tests/parts). Hiện tại bị CORS preflight chặn (không khai thác được) nhưng trái chính policy fail-closed tự tuyên bố. Fix 1 dòng: mở rộng điều kiện cho cả 4 method + 2 test guard mới (PUT/PATCH no-origin 403; foreign-origin 403 vs allowed-origin tới zod 400).

**Re-verify sau fixes:** server 430/430 (26 file, +3 test mới), web sim 14/14, student 110/110, check-types 7/7, biome sạch, e2e spec bị ảnh hưởng 2/2. Full e2e làm gate CI trên PR (e2e.yml chạy cho target main).

**Follow-ups ghi nhận với owner (không chặn release):** M1 heuristic `isHtml` nuốt text legacy dạng `x<y` (web), M2 reconcile mirror-đè-server đa thiết bị (product call), I1 body cap PATCH/PUT/POST prompts, I2 `htmlToPlainText` 2 implementation DOM vs regex, I3 test-builder reconcile khớp title+skill, I4 double cast PinOverlay, I5 dispose clear mirror khi PATCH đang bay, I7 biome info migrate config, I9 test gap superRefine PATCH không kèm type, chunk web 866 kB → code-split (web).

## Decision

- **Xóa field transcript thay vì trả `""`:** giữ `""` vẫn còn key trên wire — e2e layer (b) check key names sẽ không chứng minh được gì; schema strict của client parse đồng bộ xóa nên contract sạch.
- **Heal-on-retry thay vì saga/queue:** xác suất lỗi thấp nhưng hậu quả vĩnh viễn; 1 SELECT + ghi lặp idempotent là chi phí nhỏ nhất đóng hoàn toàn cửa sổ trên D1 không-transaction.
- **Không edit CHANGELOG cho 3 fixes:** cả 3 lỗi đều nằm trong delta chưa từng lên main — người dùng main không từng gặp; dòng changelog 2026-09-30 về "payload take không chứa answer key" giờ đúng hơn trước.
- **#264 (onboarding wizard) không thuộc release này:** 0 commit/file onboarding trong delta dù issue label "ready to ship beta" — cần làm rõ label; #286 pending đúng (chỉ plan doc).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
