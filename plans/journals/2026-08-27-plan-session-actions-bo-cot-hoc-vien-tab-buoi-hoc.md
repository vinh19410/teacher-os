---
title: "Plan session actions + bỏ cột Học viên tab Buổi học (issue #93)"
date: 2026-08-27
summary: "Lập plan cho issue #93: bỏ cột Học viên (main 4→3 cột, legacy 5→4) + SessionActionsModal bulk hoàn thành/hủy buổi; red-team 15 findings (3 Critical) buộc redesign Phase 2; kongming ×2 GO-WITH-CHANGES"
---

# Plan session actions + bỏ cột Học viên tab Buổi học (issue #93)

## What happened
Lập plan `260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc` (mode auto→hard-lite: Explore scout + 3-reviewer red-team + kongming advisory ×2, `--github --advice`):

- P1: bỏ cột Học viên — main `[Ngày & Giờ | Chủ đề | Trạng thái]`, legacy `["Ngày","Giờ","Chủ đề","Trạng thái"]`, `colSpan 4→3`, negative assertion `>Học viên</th>` (cẩn thận roster tab label cùng chữ).
- P2 (redesigned): `sessionActionTargets` helper (gate `sidStateAt(slotIndex) === "upcoming"` + `firstUpcomingLessonId` + `targetSlotIndex`); route `runSessionBatch` xây trên **`dispatch`** (pattern grade-modal) KHÔNG qua `run` (`Promise<void>` nuốt kết quả); 4 bucket theo `KernelCommandResult.kind`; entry gate `targets.length > 0` (không `kind === "actionable"` — nhúng date gate, giết hủy buổi tương lai); confirm 2-bước nội bộ liệt kê tên + **ngày occurrence đích** (behind-head nhóm riêng); cờ batch-local, khóa modal khi chạy, MỘT toast.
- P3: 6 unit cases helper + bucket mapping test + e2e (hủy buổi **tương lai**, hoàn thành, 3 cột) + manual QA behind-head.

## Decision
- **Status-only interpretation**: "điều chỉnh buổi học" = hoàn thành/hủy. Occurrence-batch field edit NO-GO từ tab này — `sessionTopic()` phân phối edited topics theo first-appearance trên slot-bag (fan-out topic buổi k hiện lên buổi 1); `dur` hiển thị từ schedule; zoom không hiển thị trên tab này. Per-row edit giữ ở `/schedule`. Cần requester sign-off (OQ1 trong issue #93).
- **Behind-head semantics**: bulk áp lên occurrence đầu chưa đánh dấu của sid trễ tiến độ (paint prefix) — surfacing bằng confirm liệt kê ngày đích (kongming C3); flip condition → strict-head gate nếu requester từ chối.
- Supersede phase-03 của plan `260826-1611` (thiết kế cũ fan-out topic trên toàn slot-bag — ghi nhậm occurrence); ghi chú 2 chiều đã thêm.
- Không phân loại 409 theo nguyên nhân: `HttpError` vứt body (repos/kernel.ts:214–216) — dùng bucket `kind`; parse body 4xx = roadmap.

## Evidence
Red-team 3 reviewer (Security/FailureMode/Assumption): 15 findings, 15 accepted, 0 rejected — 3 Critical (helper thiếu sequential-head gate; `run()` không đếm được x/N; entry gate giết hủy buổi tương lai), 4 High. Kongming session 1 (scope fork) + session 2 (redesign C1–C5) đều GO-WITH-CHANGES. `ak plan validate` OK; 18 tasks indexed; issue #93 + label `ready to review`.

## Next steps
OQ1 **đã chốt ngay trong session (option 3 — full per-occurrence edit)**: plan thu hẹp còn Phase 1 (bỏ cột); phase 2–3 DEFERRED làm tư liệu cho **plan server-side occurrence-identity kế tiếp** (chưa lập — cần issue + plan mới). Cook Phase 1 qua `/ak:cook plans/260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc/plan.md --advice` (scope: chỉ phase 1) hoặc để dồn chung vào plan server-side. Quyết định ghi ở plan.md → Scope Decision + comment issue #93.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
