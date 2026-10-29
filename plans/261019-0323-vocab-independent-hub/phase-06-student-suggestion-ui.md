---
title: "Phase 6: Student — mục Gợi ý cho bạn trong /vocab"
status: done
---

# Phase 6: Student — mục "Gợi ý cho bạn" trong /vocab

## Context Links

- `apps/student/src/routes/_auth/vocab/index.tsx` (overview "Từ vựng của tôi")
- `apps/student/src/lib/repos/vocab.ts` (fetch + zod, pattern hiện có)
- `apps/student/src/components/vocab/*` (countdown, session-view, summary)

## Overview

Hiện section "Gợi ý cho bạn" trong `/vocab` khi có suggestion pending; deck list chính thêm badge nguồn (Lớp / Gợi ý); accept → vào thẳng màn session của deck; dismiss → ẩn.

## Key Insights

- Repos student fetch trực tiếp + zod parse (`fetchVocabOverview`) — chỉ thêm hàm `acceptVocabSuggestion(id)` / `dismissVocabSuggestion(id)` theo cùng pattern (POST, credentials include, parse error như `parseErrorAndThrow`).
- Sau accept: invalidate overview query (react-query key hiện có) rồi navigate `to="/vocab/$deckId"` (flow session cũ) — provision card diễn ra lazy ở session-data (phase 3), không đổi.
- Badge nguồn dùng chip pattern chuẩn repo (DESIGN.md — không tự chế màu).
- Gợi ý KHÔNG bắt buộc: không deadline, không đếm vào stats tổng (stats chỉ tính deck đang học — accepted mới vào).
- **RT-F6 (fate khi thu hồi):** nếu teacher thu hồi suggestion ĐÃ accepted (flip dismissed ở phase 4), deck biến mất khỏi overview/session của học viên ngay lần refresh kế tiếp; `vocab_card` giữ nguyên phía server (gợi ý lại → tiếp tục mức nhớ cũ). UI không cần xử lý đặc biệt ngoài việc deck rơi khỏi list; session đang mở nếu bị 404 card theo flow "card đã bị giáo viên xoá" hiện có (`vocab-session-view.tsx:78-85`).
- **RT-F6 (transition):** nút "Ẩn" chỉ hiển thị trên gợi ý pending (deck đã accept không có nút ẩn phía student — server trả 409).

## Requirements

- [x] Overview schema client cập nhật (suggestions[] + source, `.catch` compat — phase 3)
- [x] Section "Gợi ý cho bạn": card mỗi gợi ý (title, số từ, note teacher, ngày) + 2 hành động "Bắt đầu học" / "Ẩn"; ẩn hoàn toàn khi rỗng
- [x] Deck list: badge "Lớp {name}" hoặc "Gợi ý" theo `source`
- [x] Accept → refresh overview + điều hướng sang deck; Dismiss → biến mất (không confirm — hành động nhẹ, teacher gợi ý lại được)
- [x] Empty state + error state xử lý theo pattern trang hiện có
- [x] Tests component: render suggestion, accept gọi repo + navigate, dismiss gọi repo + remove khỏi list

## Related Code Files

- Sửa: `apps/student/src/lib/repos/vocab.ts` (2 hàm POST + type)
- Tạo: `apps/student/src/components/vocab/vocab-suggestion-list.tsx` (+ test colocated)
- Sửa: `apps/student/src/routes/_auth/vocab/index.tsx` (chèn section + badge nguồn)

## Implementation Steps

1. Repos: `acceptVocabSuggestion`, `dismissVocabSuggestion` (POST `/api/student/vocab/suggestions/:id/...`), thêm vào query invalidate theo key overview.
2. `VocabSuggestionList` component: props suggestions[] + callbacks; card theo DESIGN.md; aria-label tiếng Việt; nút primary "Bắt đầu học".
3. Route index: chèn section trên stats row khi `suggestions.length > 0`; deck item thêm chip nguồn.
4. Accept flow: await repo → `queryClient.invalidateQueries(overview)` → điều hướng `/vocab/$deckId` (pattern router file hiện dùng).
5. Tests: mock repo; assert gọi đúng endpoint payload rỗng; assert ẩn section khi rỗng; assert badge nguồn 2 nhánh.
6. `pnpm --filter student test` xanh.

## Todo

- [x] Repos accept/dismiss
- [x] VocabSuggestionList + tests
- [x] Section + badge nguồn trong overview
- [x] Flow accept → session

## Success Criteria

- Test student pass; chạy dev stack: teacher gợi ý (phase 4/5) → student thấy ngay sau refresh; accept vào học được (answer/learn-commit hoạt động — thanks phase 3 predicate 5 sites); dismiss ẩn và stats không đổi.

## Risk Assessment

- jsdom không expose localStorage (bài học vitest) — nếu test cần storage, dùng pattern defineProperty memory storage đã có trong repo.
- OXC parse: JSX inline phức tạp trong `.map` có thể fail parse (bài học #351) — tách row component nếu gặp.

## Security Considerations

- Không tin gì từ client ngoài id suggestion; server đã ownership-check (phase 3).

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
