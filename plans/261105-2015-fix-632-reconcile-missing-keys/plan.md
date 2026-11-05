---
title: "fix(assignments): đối soát edit mode báo nhầm chưa lưu với câu hỏi thiếu type hoặc pin"
description: "Chuẩn hóa canonicalJson để bỏ qua cả key null lẫn undefined khi so sánh cấu trúc câu hỏi, giúp đối soát edit mode và field-diff baseline hoạt động chính xác khi câu hỏi thiếu type hoặc pin."
status: ready
priority: P1
effort: 1h
issue: 632
branch: vinh19410/ai-handle-issue-632
tags: [bugfix, frontend, assignments, reconcile]
blockedBy: []
blocks: []
created: 2026-11-05
---

# fix(assignments): đối soát edit mode báo nhầm chưa lưu với câu hỏi thiếu type hoặc pin

## Overview

Sau khi lưu đề ở edit mode bị mất response (`outcome-unknown`), bấm đối soát có thể báo "thay đổi của bạn chưa được lưu" dù server đã ghi nhận thành công, nếu payload có câu hỏi thiếu key `type` hoặc `pin`.
Nguyên nhân: `canonicalJson` trong `apps/web/src/lib/canonical-json.ts` chỉ lọc bỏ `undefined` (`item !== undefined`), giữ lại `null`. Phía server, `parseQuestions` trong `apps/server/src/routes/snapshot.ts` luôn trả `type: null` và `pin: null`. Phía client, câu hỏi tạo từ form (như `pin-editor.tsx:62` hoặc `emptyItem`) không có key `type` (undefined), dẫn đến `canonicalJson(sent) !== canonicalJson(stored)` và `editSubmissionPersisted` trả về `false`.

## Quyết định đã chốt

- **Sửa `canonicalJson` (`apps/web/src/lib/canonical-json.ts`)**: Lọc bỏ mọi thuộc tính mang giá trị `undefined` hoặc `null` (`item != null` / `item !== undefined && item !== null`) khi duyệt object entries. Mọi thuộc tính có thể mang giá trị `null` trong câu hỏi đều là `.nullish()` trong schema, nên coi `null` và vắng mặt (undefined) là tương đương.
- **Giữ nguyên mảng và giá trị gốc**: `null` bên trong array vẫn được giữ nguyên (`[null]` ≠ `[]`), và `canonicalJson(null)` vẫn trả `"null"`.
- **Không sửa server snapshot**: Giữ nguyên `parseQuestions` trên server để tránh tác động lan tỏa ngoài ý muốn tới các consumer khác của snapshot.
- **Không thêm quy ước rải rác ở frontend**: Không thêm `type: null` vào `pin-editor.tsx` để tránh tạo tiền lệ yêu cầu client phải tự điền đủ key rỗng.
- **Tách riêng vấn đề `answerSet`**: Việc `parseQuestions` chưa đọc `answerSet` là lỗi mất dữ liệu độc lập, sẽ được theo dõi trong issue riêng thay vì gộp vào #632.

## Non-goals

- Không sửa schema backend hoặc cơ sở dữ liệu.
- Không thay đổi hành vi của server snapshot `parseQuestions`.
- Không gộp sửa lỗi `answerSet` vào issue này.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Chuẩn hóa canonicalJson và viết Unit Test](./phase-01-canonical-json-and-unit-tests.md) | Ready |
| 2 | [Bổ sung Integration Test cho đối soát edit mode](./phase-02-new-submit-reconcile-tests.md) | Ready |
| 3 | [Kiểm thử hồi quy toàn diện và Quality Gates](./phase-03-verify-quality-gates.md) | Ready |

Phase 2 phụ thuộc Phase 1. Phase 3 chạy sau khi hoàn thành Phase 1 & 2.

## Success Criteria

- [ ] Đối soát báo thành công ("Đã cập nhật bài tập") khi server đã lưu câu hỏi thiếu `type` hoặc `pin`.
- [ ] Đối soát vẫn báo chưa lưu và giữ form khi snapshot thực sự khác payload (khác stem, answer, opts, type, pin).
- [ ] Baseline diff trong edit mode không gửi thừa `questions` trong PATCH khi câu hỏi không đổi nội dung nhưng lệch null/undefined.
- [ ] Có bộ unit test đầy đủ cho `canonicalJson` bao phủ các trường hợp biên.
- [ ] Toàn bộ quality gates đạt: `pnpm check`, `pnpm check-types`, các test liên quan pass 100%.

## Risks

- **Rủi ro ảnh hưởng tới các nơi khác dùng `canonicalJson`**: Hiện chỉ có `new.tsx` (so baseline và đối soát) và `test-builder-shell.tsx` (`sameJson`). Cả hai đều dùng để so sánh nội dung đề/câu hỏi/optionBank với snapshot. Việc coi `null` và `undefined` là tương đương trong object entries hoàn toàn an toàn và còn ngăn ngừa việc PATCH thừa trên đề đã khóa ở test-builder.
- **Rủi ro bỏ sót sai khác thực sự**: Các thuộc tính khác biệt có giá trị chuỗi/mảng/object (như stem, answer, opts khác nhau, pin khác tọa độ) đều có giá trị khác null nên được giữ nguyên và so sánh chặt chẽ.

## Rollback

Revert các commit liên quan đến `apps/web/src/lib/canonical-json.ts` và các test tương ứng. Không có database migration hay ảnh hưởng dữ liệu bền vững.

## Red Team Review

### Session — 2026-11-05
**Findings:** 5 (4 accepted, 1 rejected)
**Severity breakdown:** 1 Critical (rejected - out of scope), 4 High (all 4 accepted)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `answerSet` missing from `parseQuestions` | Critical | Reject (out of scope for #632, track in separate issue) | Plan Non-goals |
| 2 | Task 2.1 prescribes invalid test fixture (`answer: "A"` on TFNG prompt) | High | Accept (use valid TFNG answer like `"FALSE"`) | Phase 2 Task 2.1 |
| 3 | Unexecutable Verify Command in Phase 1 Task 1.1 (Node cannot import `.ts`) | High | Accept (switch verify command to vitest) | Phase 1 Task 1.1 |
| 4 | Untestable Phantom Test Step in Phase 2 Task 2.3 | High | Accept (reframe to test legacy prompt with missing keys) | Phase 2 Task 2.3 |
| 5 | Missing Test Coverage for Full-Test Builder (`test-builder-shell.tsx`) | High | Accept (add Task 2.4 to verify `sameJson` in test builder) | Phase 2 Task 2.4 |

### Whole-Plan Consistency Sweep
- **Delta**: Đã chỉnh sửa lệnh verify của Task 1.1 để dùng vitest; sửa fixture `answer: "FALSE"` trong Task 2.1; làm rõ test legacy prompt cho Task 2.3; thêm Task 2.4 bổ sung test cho `test-builder-shell.test.tsx`.
- **Consistency**: Toàn bộ phase files và plan.md đã đồng bộ về file mục tiêu, các task ID, và tiêu chí verify so sánh cơ học. Không còn mâu thuẫn hay giả định chưa được kiểm chứng.

<!-- slug: fix-632-reconcile-missing-keys -->
