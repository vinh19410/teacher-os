---
title: "Phase 7: Tests, e2e mới & gates local"
status: todo
---

# Phase 7: Tests, e2e mới & gates local

## Context Links

- E2e hiện có: `apps/e2e/specs/vocab-srs.spec.ts`, `vocab-library-clone.spec.ts` (pattern: boot stack wipe DB, ports 8100/8101/8103)
- Gates: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `--filter web test`, `--filter student test`, `pnpm --filter e2e e2e`
- Bài học e2e: baseline screenshot drift (#356) — regen xong phải restore baseline cũ của spec khác trước khi commit; boot e2e wipe DB + mail-log

## Overview

Spec e2e end-to-end cho luồng mới + chạy toàn bộ gates + chuẩn bị bằng chứng PR (screenshot 3 viewport).

## Key Insights

- 1 spec mới đủ phủ acceptance: `vocab-hub-suggestion.spec.ts`.
- E2e chạy stack riêng (E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103) — không đụng dev stack 8000/8001/8003.
- Sau e2e chạy toàn bộ specs: screenshot baseline của spec khác có thể drift — diff và restore trước commit (không commit baseline change ngoài scope).

## Requirements

- [ ] `vocab-hub-suggestion.spec.ts` pass kịch bản acceptance
- [ ] Toàn bộ e2e suite pass (không regression spec cũ, kể cả sidebar-collapse)
- [ ] Gates local pass đủ bộ
- [ ] Screenshot PR: hub tab Deck + tab Tiến độ + student "Gợi ý cho bạn" ở 1440/768/375

## Architecture

```
vocab-hub-suggestion.spec.ts
  1. teacher login (web :8101)
  2. vào /vocab → tạo deck riêng "TOEIC cơ bản" (không lớp) + thêm 3 từ
     (RT-F17: editor flow — theo vocab-srs.spec.ts:137-170, KHÔNG phải vocab-library-clone;
      2 spec vocab KHÔNG export helper chung — copy pattern login/seeding nội bộ của từng spec)
  3. gợi ý deck cho student S (note "Ôn trước thứ 7 nhé"); bấm Gợi ý 2 lần nhanh — phải idempotent (không lỗi)
  4. student login (student :8103) → /vocab → thấy "Gợi ý cho bạn" đúng title + note
  5. "Bắt đầu học" → vào deck, học 1 card TRỌN VẸN qua answer flow (grade good) — xác nhận predicate 5 sites (RT-F1)
  6. teacher → /vocab → tab Tiến độ → chọn S → thấy deck với byLevel[2]=1 + activity hôm nay ≥1 (ngày VN)
  7. (option trong cùng spec) dismiss gợi ý thứ 2 → ẩn khỏi /vocab; teacher thu hồi suggestion đã accepted → deck rời overview student
```

## Related Code Files

- Tạo: `apps/e2e/specs/vocab-hub-suggestion.spec.ts`
- Sửa (chỉ nếu selector cũ đổi): các spec vocab cũ

## Implementation Steps

1. Viết spec theo khung trên — copy pattern seeding/login nội bộ từ `vocab-srs.spec.ts` (editor flow dòng 137–170) và `vocab-library-clone.spec.ts`; KHÔNG import helper (2 spec không export helper chung — RT-F17).
2. Chạy local: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e --grep vocab` trước, sau đó full suite.
3. Nếu screenshot baseline spec khác drift: `git restore` các baseline ngoài scope (bài học #356), chỉ giữ baseline mới nếu spec mới yêu cầu.
4. Chạy gates: `pnpm check && pnpm check-types && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test`.
5. Thu screenshot 3 viewport cho PR body (tiếng Việt theo precedent PR #281/#284).

## Todo

- [ ] Spec e2e mới pass
- [ ] Full e2e suite pass (restore baseline drift ngoài scope)
- [ ] Gates pass
- [ ] Screenshot PR

## Success Criteria

- Tất cả acceptance criteria trong `plan.md` được chứng minh bằng spec/test xanh; không có baseline ngoài scope thay đổi trong diff cuối.

## Risk Assessment

- E2e flake selector tiếng Việt (dấu) — dùng `getByText` chuỗi exact như spec cũ vẫn dùng; strict-mode "Đã nhận" lesson (#356) không liên quan nhưng nhớ tránh matcher chuỗi xuất hiện 2 lần.
- Dev stack đang chiếm port 8000+ → luôn chạy e2e với override port chuẩn.

## Security Considerations

- Bước IDOR âm tính nằm ở server test (phase 3) — e2e giữ happy path + 1 dismiss path cho gọn.
