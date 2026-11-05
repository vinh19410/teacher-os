---
title: "Ship #630: Khóa nội dung đề đã có bài làm + thông báo lỗi khóa + đối soát trung thực (beta)"
date: 2026-11-05
summary: "PATCH /prompts/:id trả 409 PROMPT_CONTENT_LOCKED khi đề có quiz_attempt, web hiện thông báo riêng cho 2 mã lỗi khóa ở composer + test builder, đối soát edit mode chỉ báo thành công khi snapshot khớp payload; composer bỏ trường không đổi khỏi payload tránh khóa nhầm đề cũ"
---

# Ship #630: Khóa nội dung đề đã có bài làm + thông báo lỗi khóa + đối soát trung thực (beta)

## Bối cảnh & Hiện tượng (#630)
- Review PR #629 (promote `develop` → `staging`) tìm thấy 3 lỗi Important của tính năng sửa đề (#614): (1) sửa đề đã có bài làm làm lệch nội dung học viên thấy, (2) đối soát edit mode báo thành công dù server chưa ghi, (3) lỗi 409 khóa đề không có thông báo riêng.
- Plan [`plans/261105-0750-fix-614-prompt-edit-gaps/plan.md`](../261105-0750-fix-614-prompt-edit-gaps/plan.md) chốt hướng "khóa khi đã có bài làm", 3 phase, không migration.

## Thay đổi kỹ thuật
1. `packages/api/src/contracts.ts`:
   - Thêm `ASSIGNMENT_PROMPT_ERROR_CODES` (`PROMPT_CONTENT_LOCKED`, `WRITING_SECTION_LOCKED`) theo pattern `STUDENT_INVITATION_ERROR_CODES` — server và web cùng tra một nguồn.
2. `apps/server/src/routes/assignments/index.ts` — PATCH `/api/assignments/prompts/:id`:
   - Widen row select đủ cột content; hoist `writingChanged`; sau khối `WRITING_SECTION_LOCKED` (giữ precedence), tính `contentChanged` theo từng field có trong payload: text so trim 2 phía (null↔""), `questions` chuẩn hóa 2 phía qua `promptQuestionsSchema` (hoist module-level) rồi so canonical JSON, `optionBank` qua `parseQuizOptionBank` + trim.
   - Chỉ khi `contentChanged` mới query attempt org-scoped (`quiz_attempt` ⋈ `class_assignment` qua `assignment_id`, ⋈ `assignment_test` → `assignment_test_part` qua `test_id`) — có attempt → 409 `PROMPT_CONTENT_LOCKED` trước mọi ghi.
   - Field content chỉ vào `updates` khi thực sự đổi — đề bị khóa không bị rewrite bản normalized.
3. `apps/web/src/lib/use-kernel-form-submit.ts`:
   - Nhánh definite-failure tra `HttpError.code` → message riêng cho 2 mã lỗi khóa; lỗi khác giữ message generic. Áp dụng cho cả composer lẫn test builder (và panel Apply qua footer alert `role=alert`).
4. `apps/web/src/routes/_auth/assignments/new.tsx`:
   - Baseline field-diff: capture giá trị normalized từ `existingPrompt` lúc mount; edit payload chỉ gửi field content khác baseline (text trim, JSON) — resave đề cũ (plain text `\n`→`<br>`, `type ?? genre`, drop `explanation` rỗng) không còn gửi lại bytes đã biến dạng → không khóa nhầm.
   - Đối soát trung thực: `lastSubmittedRef` capture payload (chuẩn hóa qua `assignmentPromptUpdateSchema` — cùng transform server) sau khi guard `submitBlocked`; `handleReconcile` đọc snapshot từ `getQueryData(kernelQueryKey)`, so canonical JSON (order-immune) + trim; khớp mới "Đã cập nhật", lệch thì giữ form + báo lưu lại.
5. `apps/web/src/components/assignment-tests/test-builder-shell.tsx`:
   - Tách `composerUpdatePromptPayload()` (PATCH partial) khỏi `composerToPromptPayload()` (create); baseline lúc mở composer; `writing` chỉ gửi khi thật sự đổi (trước đây luôn gửi `null`).

## Supervision `--advice` (kongming)
- Checkpoint sau plan gates: conditional GO — phát hiện amendment bắt buộc: composer gửi đủ mọi field mỗi lần lưu sẽ khóa nhầm đề cũ → thêm client-side field-diff (đã adopt, đưa vào phase 2).
- Checkpoint ship gate: GO — yêu cầu thêm test rename-only trên đề legacy (questions JSON lỗi schema) → đã thêm, 9/9 server lock test pass.

## Code review (fresh context)
- 0 Critical / 2 Important / 5 Minor. Fix trước ship: I-1 (payload normalize trước đối chiếu + comparator order-immune), I-2 (blocked save không clobber ref), M-1 (trim writing compare server), M-2 (hoist schema), M-3 (dọn debug leftover + 2 test regression).
- Follow-up ghi trong PR: M-4 (builder reconcile + create-mode stale closure), M-5 (xoá test mở khóa đề practice), gap attempt check ở `PUT /tests/:id/parts`.

## Kiểm chứng
- `pnpm test` full repo: 0 fail (turbo, các package green).
- `pnpm check-types`: 12/12.
- `pnpm exec biome check .`: các file đổi sạch (noise lint có sẵn trên develop thuộc file không đụng tới).
- Server lock suite: 9/9 (8 case plan + 1 case legacy kongming); hybrid/practice regression green.
- Web: 147/147 test các suite đụng tới; full web suite 1933 pass trước fix, các suite đụng fix chạy lại green.
- Browser smoke thật (boot:api + vite + Playwright, seed attempt qua libsql): đề có attempt đổi passage → 409 + message riêng hiển thị đủ 3 viewport 1440×900 / 768×1024 / 375×812; rename-only trên đề có attempt → thành công UI + DB; đề chưa có attempt vẫn sửa nội dung được.
