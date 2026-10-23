---
title: "Ship quiz-builder-page-refactor: PR2 #420 + #424 hai cột Quiz Builder"
date: 2026-10-23
summary: "Ship feat/424-quiz-builder-page-refactor vào develop (beta): schema groups + migration 0044 + route, trang soạn đề admin hai cột Quiz Builder, e2e/viewport/docs; gates xanh."
---

# Ship quiz-builder-page-refactor: PR2 #420 + #424 hai cột Quiz Builder

## Kết quả
- 10 commits trên feat/424-quiz-builder-page-refactor (schema/contracts → ui primitives → models fold → thẻ Part/Nhóm → trang hai cột → e2e/docs → review fixes).
- Gates: admin 153, ui 164, web 1430, server 819, student 351, api 238 vitest; e2e hồi quy 10/10 passed; pnpm check/check-types/test exit 0; 3 viewport scrollWidth pass (đo sau mở panel).
- Code review 3 reviewer: 0 Critical / 2 High / 12 Medium — fix 8 (focusRow scope theo grid, badge tab đếm nhóm, message superRefine không bị đè, panel tabpanel a11y, view-state remove→0, dọn viewStateBySlot khi xóa part, flat jump q0, savePart listening đồng bộ); defer có chủ đích theo kongming — 2 issue follow-up, RB-F3+RB-F2 chặn PR3.
- kongming GO trước ship; RB-F1 Reject giữ full-replace PUT (preserve groups sẽ tạo nhóm trỏ vào mảng câu đã thay — inconsistent).

## Bài học
- Edit tool của subagent giải path tương đối về main repo — các wave sau phải ép absolute path tuyệt đối.
- E2e viết theo hành vi thật (nút "Chia thành nhiều nhóm câu" tự addGroup) bền hơn viết theo mô tả plan.
- Fold numbering (computeLibraryTestRanges) bắt đúng 1 bug thật: editor phẳng quên qStartOverride hiển thị "Câu 14" thay vì "Câu 6".

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
