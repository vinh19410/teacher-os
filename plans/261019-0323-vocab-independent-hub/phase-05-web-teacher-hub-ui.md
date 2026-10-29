---
title: "Phase 5: Web teacher — sidebar + hub UI (Deck / Tiến độ / Gợi ý)"
status: done
---

# Phase 5: Web teacher — sidebar + hub UI (Deck / Tiến độ / Gợi ý)

## Context Links

- `apps/web/src/components/layout/sidebar.tsx` (sections: chính + "Giảng dạy")
- `apps/web/src/components/vocab/{vocab-deck-list,vocab-deck-editor,vocab-library-dialog}.tsx`
- `apps/web/src/lib/data-store*` (`useData()`, `dispatch`, snapshot `data.vocabDecks`)
- Tab lớp cũ: `apps/web/src/routes/_auth/classes/$classId.tsx:282-289`
- Chuẩn UI: `DESIGN.md` (token màu/type/motion, chip/card rules), verify 3 viewport 1440×900 / 768×1024 / 375×812 + keyboard focus theo `REVIEW.md`

## Overview

Trang `/vocab` mới cho teacher (hub) với 2 tab: "Bộ từ vựng" (toàn org, gồm deck riêng + deck lớp, gợi ý) và "Tiến độ" (per-student). Sidebar thêm mục "Từ vựng". Tab vocab trong trang lớp GIỮ NGUYÊN (đọc cùng snapshot).

## Key Insights

- **RT-F16 — nới `VocabDeckList` là 4 điểm, không phải 1:** (a) filter `deck.classId === classId` (`vocab-deck-list.tsx:20`) với prop `undefined` match 0 deck → hub **trống lặng lẽ**; semantics phải là branch riêng: prop `null`/vắng = TOÀN BỘ deck org, có classId = filter cũ, so sánh dùng `deck.classId != null && deck.classId === classId`; (b) payload create `{ classId, title }` + action type `data-actions.ts:242` + HTTP translation `repos/kernel.ts:278-286` phải nới nullable (server schema `contracts.ts:2197` đã nới ở phase 4); (c) badge "Lớp {name}" cần TÊN lớp — snapshot vocabDecks không có className → lookup `data.classes` theo classId; deck riêng badge "Riêng"; (d) copy modal "Học sinh trong lớp sẽ thấy bộ từ này" (`vocab-deck-list.tsx:160-162`) sai ngữ cảnh deck riêng → đổi theo ngữ cảnh.
- `VocabLibraryDialog` cũng có filter `deck.classId === classId` (`vocab-library-dialog.tsx:37-43`) — clone hub cần `== null` matching + chip/nút/toast đổi ngữ cảnh ("Đã có trong lớp" → "Đã có trong hub").
- **RT-F21 — stale snapshot sau student accept/dismiss:** modal Gợi ý **fetch fresh GET pending-of-deck khi mở** (endpoint phase 4), không chỉ đọc snapshot; hiển thị "đã chấp nhận/đã ẩn (lúc T)" để teacher không hành động trên trạng thái chết.
- Progress tab fetch GET khi mở (KHÔNG vào kernel snapshot — bài học #343).
- Hub 2 tab dùng `useState` (precedent tab hồ sơ #340).
- Screenshot 3 viewport kèm PR (AGENTS.md).

## Requirements

- [x] Sidebar mục "Từ vựng" (icon Lucide theo DESIGN.md, section "Giảng dạy" trên "Lớp học"), test sidebar hiện có cập nhật
- [x] `/vocab` hub: tab "Bộ từ vựng" — grid deck org-wide (deck riêng + deck lớp), badge nguồn (Lớp {name} lookup từ `data.classes` / Riêng), nút: Tạo deck (không lớp), Thêm từ thư viện (clone không lớp), Gợi ý (per deck), mở editor như cũ
- [x] `VocabDeckList`/`VocabLibraryDialog` nới đủ 4 điểm ở Key Insights; test "hub hiện deck classId=null" + "tab lớp không hiện deck riêng"
- [x] Tab "Tiến độ": chọn học viên (combobox/search từ snapshot) → per-student decks với byLevel bar 1–5, dueToday, hoạt động 7 ngày; empty state khi chưa học gì
- [x] Modal Gợi ý: chọn student + note (maxLength 500 khớp server), fetch fresh pending khi mở, nút thu hồi (revoke) + nhãn trạng thái đã chấp nhận/đã ẩn
- [x] Tab vocab trong class detail hoạt động như cũ (regression test)

## Architecture

```
routes/_auth/vocab/index.tsx         # hub — 2 tab (useState)
components/vocab/vocab-hub-decks.tsx # wrap VocabDeckList(org-wide mode) + suggest modal
components/vocab/vocab-progress-tab.tsx
components/vocab/vocab-suggest-dialog.tsx  # fetch fresh pending khi mở
sidebar.tsx                          # + item /vocab
```

## Related Code Files

- Tạo: `apps/web/src/routes/_auth/vocab/index.tsx`, `apps/web/src/components/vocab/{vocab-hub-decks,vocab-progress-tab,vocab-suggest-dialog}.tsx` (+ tests colocated)
- Sửa: `sidebar.tsx`, `vocab-deck-list.tsx` (4 điểm + badge nguồn + nút Gợi ý), `vocab-library-dialog.tsx` (clone không lớp + dedupe/copy), `vocab-deck-editor.tsx` (mở từ deck không lớp), `apps/web/src/lib/data-actions.ts:242` (payload classId nullable), `apps/web/src/lib/repos/kernel.ts` (HTTP translation create deck)
- Sửa tests: `sidebar.test.tsx`, `vocab-deck-list`/`vocab-library-dialog` tests + fixtures dùng `KernelSnapshot` (phase 4 đã liệt kê)

## Implementation Steps

1. Sidebar item + test (label "Từ vựng", route `/vocab`; assert thứ tự trong section).
2. Nới `VocabDeckList` + `VocabLibraryDialog` đủ 4 điểm (Key Insights) + `data-actions.ts` payload; test cũ giữ nguyên pass khi có classId; test mới: hub org-wide hiện deck `classId=null`, tab lớp KHÔNG hiện deck riêng.
3. Route hub + 2 tab; tab Deck đọc snapshot `data.vocabDecks` (+ `data.vocabSuggestions` pending cho badge).
4. `VocabSuggestDialog`: fetch fresh pending-of-deck khi mở; chọn student; note; dispatch suggest (idempotent — disable khi submitting); nhãn trạng thái + nút thu hồi (revoke).
5. `VocabProgressTab`: fetch progress per-student; bar 1–5 theo token DESIGN.md (không hard-code lệch scale — bài học #349); empty/loading/error states.
6. Tests web: render hub 2 tab; suggest dialog payload đúng + hiển thị trạng thái fetched; progress tab dữ liệu mẫu; regression tab lớp + create deck có lớp.
7. Screenshot 3 viewport (deck tab + progress tab) lưu vào PR.

## Todo

- [x] Sidebar + test
- [x] VocabDeckList/LibraryDialog 4 điểm + data-actions + regression tests
- [x] Route hub + tab Deck + badge nguồn (lookup classes)
- [x] Suggest dialog (fetch fresh) + thu hồi
- [x] Progress tab + tests
- [x] Screenshot 3 viewport

## Success Criteria

- `pnpm --filter web test` xanh; hub hiện deck riêng ("Riêng") và deck lớp ("Lớp {name}") đúng nguồn; e2e sidebar spec pass (phase 7); tab vocab trong lớp không đổi hành vi.

## Risk Assessment

- Deploy skew: web mới + server cũ → `vocabSuggestions` optional (phase 4) nên `isSnapshotShape` không trắng workspace; vẫn deploy server trước.
- Bar 1–5 level bằng div theo token màu (không thêm thư viện; recharts chỉ dùng ở tuition — không kéo vào).

## Security Considerations

- Toàn bộ qua kernel dispatch (CSRF đã guard); không gọi fetch trực tiếp bỏ qua command bus cho mutation.

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
