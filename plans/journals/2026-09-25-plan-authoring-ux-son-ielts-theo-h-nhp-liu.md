---
title: Plan authoring UX soạn đề IELTS theo họ nhập liệu
date: 2026-09-25
summary: "Hard-mode plan 260925-0724 với red-team 3 persona: 15 findings Accepted, phát hiện nặng nhất là skill-qualifier cho map và đường đọc snapshot strip im lặng field mới"
---

# Plan authoring UX soạn đề IELTS theo họ nhập liệu

## What happened
Lập kế hoạch triển khai từ research UI/UX authoring IELTS (plans/reports/research-2026-09-25-ielts-authoring-ui-ux.md): 37 loại đề quy về 4 họ nhập liệu + ảnh ghim nhãn. Plan tại plans/260925-0724-assignment-authoring-ui-ux (4 phase, 23h, issue #271, label ready to review).

Pipeline: scaffold qua `ak plan create` → verify claims trực tiếp contracts.ts/new.tsx/assignment-presets.ts → viết plan + 4 phase → red-team 3 reviewer song song (Security Adversary / Failure Mode Analyst / Assumption Destroyer, Standard tier) → adjudicate → consistency sweep → `ak plan validate` OK → GitHub issue #271.

## Decision
- Scope HOLD: đúng 4 nhóm ưu tiên của research (quick wins / option bank / cloze / pins); upload thật + AI draft để ngoài scope.
- 15/15 findings có bằng chứng được Accept. Ba lỗ hổng nặng nhất reviewer bắt được mà plan gốc sai:
  1. `map` là type-id dùng chung (writing task1 + listening s2) — mọi gate phải skill-qualified theo cặp (skill,type).
  2. Đường ĐỌC strip im lặng field mới: `parseQuestions` (snapshot.ts:76-110) chỉ giữ {stem,opts,answer,alts}; POST /prompts KHÔNG pass-through (insert map tường minh + returning id); inner zod question object không `.strict()` → `pin` bị strip thay vì 400.
  3. Autosave localStorage mới va chạm preview draft sessionStorage (`takePreviewDraft` destructive tại new.tsx:131).
- Sửa hành vi carry-over: chỉ giữ `transcript` trong cùng skill; giữ `intro` bị loại vì intro là câu lệnh theo-type (leak ngược guard #269).
- Bank cap 8 (nhãn A–H/i–viii chỉ có 8 giá trị), xóa dòng bank → reset key để tránh re-bind âm thầm.

## Next steps
- `/ak:cook plans/260925-0724-assignment-authoring-ui-ux/plan.md` (Phase 1 trước, 1 PR/phase vào develop, nhánh vinh19410/feat/assignment-authoring-ui-ux).
- Commit plan files cùng nhánh feature để link trong issue #271 sống.
- Phase 2 nhớ thứ tự deploy: migration `db:migrate:deploy` trước worker (insert cột mới vào DB cũ = 500).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
