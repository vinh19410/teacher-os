---
title: "Ship authoring quick wins (#271) phase1"
date: 2026-09-25
summary: "Ship PR #272 phase 1/4 authoring UX (issue #271) beta vào develop: answer-key grid + shortcuts, change guards confirm StrictMode-safe, autosave draft localStorage (TTL 7 ngày), bulk paste map theo số câu, validation caps + gate 40 câu. Review bắt 1 Critical (e2e dialog luôn dismiss — accept path chưa từng test) + 2 Important + 7 Minor, fix hết; reading-types e2e bắt regression FR5. Gate: vitest 812/812 forced, e2e create 12/12 + reading-types 2/2."
---

# Ship authoring quick wins (#271) phase1

Ship PR #272 "feat(web): authoring quick wins — answer-key grid, change guards and autosave draft" — phase 1/4 của authoring UX plan (issue #271, `plans/260925-0724-assignment-authoring-ui-ux/`), merge beta vào `develop`. Branch `vinh19410/feat/assignment-authoring-ui-ux`, 9 commits từ `31a2d20` đến `239ab9d`.

## What happened

- Answer-key grid với số câu hỏi thật + shortcuts; bulk paste key map theo số câu hỏi, lỗi hiển thị từng dòng.
- Change guards: confirm khi đổi skill/part/type, giữ transcript trong cùng skill (hoisted confirm, StrictMode-safe).
- Autosave draft localStorage: preview-draft precedence, TTL 7 ngày, clear theo outcome (không xoá mù quáng).
- Per-row validation: caps 500/200/500 + cap option mcq; gate 40 câu.

## Review bắt được (phần không đẹp)

Code-review: 1 Critical + 2 Important + 7 Minor — fix hết trước merge, nhưng đừng lãng quên chúng từng có mặt.

- Critical đáng xấu hổ nhất: dialog handler trong e2e luôn dismiss nên luồng **accept** của change guard chưa từng được test. Suite xanh, nhưng xanh nhầm nhánh — đúng kiểu fail nguy hiểm nhất vì nó trông như đã verify.
- Important 1: một cú click chip skill/part ngoài ý muốn có thể confirm-and-wipe toàn bộ input đang gõ.
- Important 2: blur flags đánh index theo row nên leak trạng thái sang row khác khi xoá row giữa — classical keyed-by-index bug, đáng ra thấy ngay từ lúc viết.
- Giữa lúc ship, e2e reading-types bắt 1 regression FR5 do đụng trúng authoring — phải fix xong thì reading-types mới về 2/2.

## Verify

web vitest 812/812 (forced), e2e create spec 12/12 + reading-types 2/2.

## Next steps

- Phase 2/4 của authoring UX plan.
- Follow-up nợ: các component mới (grid/guard/autosave) chưa có jsdom component tests — unit hiện chủ yếu ở tầng logic; bổ sung trước khi đóng plan, đừng lặp lại bài học "test xanh nhầm nhánh".

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
