---
title: Plan trang tạo bài tập 4 kỹ năng IELTS (thiết kế v5)
date: 2026-09-21
summary: "ak-plan hard mode: scout + planner 5 phases + red-team 15 findings + validation chốt dirty-flag preserve, thứ tự #214 trước #213; plan validate OK, sẵn sàng cook"
---

# Plan trang tạo bài tập 4 kỹ năng IELTS (thiết kế v5)

## What happened
- Chạy `/ak:plan` hard mode cho "triển khai trang tạo bài tập mới theo thiết kế mới hôm nay" — thiết kế đích là `assignment-create-5.html` (Open Design project f2f4d498, "Tạo đề · đáp án chấm tự động", cập nhật 2026-09-21 10:40; v5 ≡ v4).
- Scope HOLD: dựng lại `/assignments/new` từ chỉ-Writing (task1/task2 + genre) thành 4 kỹ năng IELTS với catalog preset 3 cấp (4 skill · 12 part · 29 type), q-editor + answer key chấm tự động (R/L), audio metadata + transcript (L), cue card (S p2), preview/bank/success card mở rộng, action bar state machine 6 bậc.
- Plan: `plans/260921-0351-assignment-create-redesign/` (plan.md + phase-01..05: kernel schema/contract → web data layer/catalog → trang + components → consumer surfaces → e2e). Issue #214, branch `vinh19410/issue-214-assignment-create-redesign`.
- Bằng chứng: `research/design-spec.md` (trích mock verbatim), `reports/scout-report.md` (luồng hiện tại: kernel command bus, snapshot, contract `.strict()`, tests 3 lớp).

## Decision
- Red-team 3 reviewer (Security/Failure/Assumption) ra 15 findings sau dedup — 14 Accept đã áp: Critical "contract v2 là wire break POST, deploy web+server cùng release (bỏ claim rollback an toàn)"; migration 0019 cần `--> statement-breakpoint` trước backfill UPDATE + spec test existing-data migration theo pattern `comment-bank-existing-data-migration.test.ts`; whitelist part/type + answer theo alphabet kind trong superRefine; `parseQuestions` cần Array.isArray + sanitize + log; đếm type 26→29 + id MCQ lấy theo mock (`mcq`/`mcq1`); compat TASK_PRESETS phải có words/minutes; shim payload new.tsx ở phase 2 tránh vỡ check-types; phase 3+4 land cùng PR; citation giả "#208 F3" thay bằng spec reconcile-check tường minh; E2E không dùng "NOT GIVEN" làm sentinel chống leak (intro template chứa nó).
- Validation user chốt: (Q1) đổi part/type GIỮ nội dung đã sửa — deviation có chủ đích khỏi mock (mock reset dirty); đổi skill vẫn reset toàn bộ. (Q2) plan này (#214) trước, #213 single-column-preview rebase sau. (Q3) xác nhận adjudicate red-team.
- Audio là metadata-only (tên file) — upload/playback thật là plan sau (không có hạ tầng R2/multipart, kernel JSON-only).

## Next steps
- `/ak:cook plans/260921-0351-assignment-create-redesign/plan.md` để implement theo 5 phase.
- Tạo issue #214 + branch trước khi cook nếu cần theo dõi GitHub.
- Không cook #213 song song với plan này (cùng rewrite `/assignments/new`).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
