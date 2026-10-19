---
title: "Phase 4: Server teacher hub — kernel commands + progress endpoints"
status: done
---

# Phase 4: Server teacher hub — kernel commands + progress endpoints

## Context Links

- `apps/server/src/routes/vocab-teacher.ts` (CRUD hiện có, mount `/kernel/vocab` tại `kernel.ts:2110`)
- `apps/server/src/routes/kernel.ts` (command bus); `apps/server/src/routes/snapshot.ts` (build snapshot — `loadSnapshot` dòng 185–201, vocabDecks 309–314, map 590–598)
- `apps/web/src/lib/repos/kernel.ts` (`SNAPSHOT_COLLECTION_KEYS` 477–505, `isSnapshotShape` 512–518, `mapKernelSnapshot` 338)
- `apps/server/src/routes/vocab-teacher.test.ts`

## Overview

Mở teacher API: tạo deck không lớp, suggestion lifecycle (gợi ý idempotent / thu hồi soft), 1 endpoint progress per-student. Commands đi qua kernel command bus; progress là GET thuần.

## Key Insights

- Kernel routes đã có guard Origin + CSRF + teacher role (`kernel.ts:116-134`, `app.ts:100-106`) — mọi route mới đặt trong `vocabTeacherRoutes`.
- **RT-F9/RT-F23 — snapshot thêm field là blast radius lớn:** `vocabSuggestions` phải là **field optional** (`vocabSuggestions?: ...`) trong `KernelSnapshot` contract; `mapKernelSnapshot` default `[]` khi vắng. Chuỗi file web phải cập nhật cùng (compile guard `SNAPSHOT_COLLECTION_KEYS`, `emptyKernelData` `kernel-state.ts:4-19`, `mock-data.ts:247-256`, `test/kernel-harness.tsx:36`, nhóm fixtures `repos/*.test.ts` dựng literal `KernelSnapshot` đầy đủ ~12 file). **Deploy order bắt buộc: server trả field TRƯỚC, web tiêu thụ SAU** — nếu web mới chạy với server cũ, `isSnapshotShape` fail làm workspace teacher trắng toàn app (không chỉ vocab).
- **RT-F8 — snapshot chỉ chứa `status='pending'`** ( dismissed/accepted history không đưa vào — tránh phình snapshot-once refetch sau mỗi dispatch); badge số pending của hub tính từ danh sách pending này.
- **RT-F10 — aggregate hoạt động 7 ngày bằng JS theo `vietnamTodayISO`** (pull `reviewedAt` raw về rồi group) — KHÔNG dùng SQL `date(reviewedAt)` (epoch-ms → NULL) và không quên +7h; nhất quán precedent forecast/streak `vocab.ts:404-431`.
- **RT-F12 — suggest idempotent:** pre-check pending tồn tại (hoặc `onConflictDoNothing` theo UNIQUE(student,deck)) → trả 200 row hiện có; KHÔNG để constraint violation thành 500 (web bus map 5xx → "outcome-unknown" gây hoảng teacher).
- **RT-F3/RT-F6 — xoá deck phải xoá suggestion trong cùng `db.batch`** (doctrine F7 — không dựa FK cascade); thu hồi suggestion = **flip status `dismissed`** (soft, giữ `respondedAt` cho progress), không hard-delete; `vocab_card` đã provision giữ nguyên (deck rơi khỏi accessible → biến mất khỏi progress/overview; gợi ý lại thì dữ liệu SRS còn nguyên).
- **RT-F14 — clone library dedupe:** `classId == null ? isNull(vocabDeck.classId) : eq(vocabDeck.classId, classId)` — `eq(x, null)` sinh SQL luôn FALSE, mất cảnh báo trùng #361.
- Progress per-deck (roster deck) **CẮT khỏi plan** (RT-F18 — dead code, request chỉ cần per-student); ghi vào non-goals plan.md.

## Requirements

- [x] `POST /kernel/vocab/decks` + clone library chấp nhận `classId: null` (zod nới; validate org ownership khi có classId; dedupe `isNull` cho deck riêng)
- [x] Snapshot thêm `vocabSuggestions` (optional, chỉ pending: id, deckId, studentId, note, createdAt) — server trả trước web dùng; update đủ chuỗi file web guard/fixtures
- [x] Command `suggest-vocab-deck` (deckId, studentId, note `z.string().trim().max(500).optional()`) — idempotent khi pending tồn tại (200 row cũ); re-suggest sau dismissed = flip pending (upsert theo UNIQUE)
- [x] Command `revoke-vocab-suggestion` (id) — flip status `dismissed` (soft), KHÔNG hard-delete
- [x] `delete-vocab-deck` batch thêm `db.delete(vocabSuggestion).where(eq(vocabSuggestion.deckId, deck.id))`
- [x] `GET /kernel/vocab/progress?studentId=` → per-student: mỗi deck accessible {deckId, title, classId|null, total, byLevel[1..5], dueToday, stateNew, stateReview, lastActivityAt} + activity 7 ngày {dateISO, sessions, correct} (group JS theo `vietnamTodayISO`)
- [x] Mọi query lọc `orgId` từ kernel ctx; studentId/deckId phải thuộc org → sai 404

## Architecture

```
progress per-student:
  vocab_card ⨝ vocab_word ⨝ vocab_deck (deck ∈ accessible(student) — predicate phase 3)
    SQL: SELECT deckId, level, state, MIN/COUNT, dueAt GROUP BY deckId, level/state
    dueToday = COUNT(dueAt <= endOfTodayVN)   -- vietnamTodayISO +7h, KHÔNG dùng SQL date()
  activity: SELECT reviewedAt, grade FROM vocab_review_log WHERE studentId AND reviewedAt >= now-7d
    → group bằng JS theo ngày VN (vietnamTodayISO), trả [{dateISO, sessions, correct}]
```

## Related Code Files

- Sửa: `apps/server/src/routes/vocab-teacher.ts`, `vocab-library.ts` (dedupe isNull), `apps/server/src/routes/kernel.ts` (dispatch cases), `apps/server/src/routes/snapshot.ts` (vocabSuggestions pending)
- Sửa: `packages/api/src/contracts.ts` (`KernelSnapshot.vocabSuggestions?` optional + schemas progress/suggestion)
- Sửa web (cùng PR, chuỗi guard): `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/kernel-state.ts`, `apps/web/src/lib/mock-data.ts`, `apps/web/src/test/kernel-harness.tsx`, fixtures `repos/*.test.ts` dựng literal snapshot
- Sửa tests: `apps/server/src/routes/vocab-teacher.test.ts` (+ `vocab-library.test.ts` dedupe deck riêng)

## Implementation Steps

1. Nới zod create deck (`classId` nullable optional) + clone library nhận classId null + dedupe `isNull`.
2. Thêm `vocabSuggestions` (optional, pending-only) vào snapshot build trong `snapshot.ts`; cập nhật contract + chuỗi file web guard/fixtures (list ở Related Code Files); giữ `isSnapshotShape` không fail khi field vắng (optional).
3. Commands `suggest-vocab-deck` (idempotent + upsert flip) + `revoke-vocab-suggestion` (soft flip); update batch `delete-vocab-deck` thêm xoá suggestion.
4. Progress per-student theo Architecture (SQL aggregate + JS group ngày VN).
5. Tests: suggest idempotent (double-suggest → 200 cùng row); suggest sau dismissed → pending mới (flip); revoke → student mất quyền (deck rời accessible); xoá deck → suggestion biến mất + overview student không còn gợi ý mồ côi; progress sau seed cards + review logs mẫu assert byLevel/dueToday/7-day đúng (kèm case review lúc 00:30 VN không lệch ngày); 404 studentId/deckId ngoài org; clone trùng deck riêng có cảnh báo dedupe.
6. `pnpm --filter server test && pnpm --filter web test` xanh.

## Todo

- [x] Create deck + clone library classId null + dedupe isNull
- [x] Snapshot vocabSuggestions optional pending-only + chuỗi file web
- [x] Commands suggest (idempotent) / revoke (soft) + delete batch cleanup
- [x] Progress per-student (SQL agg + JS ngày VN) + tests
- [x] Test double-suggest / xoá deck / revoke

## Success Criteria

- Từ dev stack: teacher tạo deck riêng, gợi ý cho học viên (double-click an toàn), thu hồi, xoá deck không để mồ côi; endpoint progress trả số liệu khớp DB; snapshot teacher boot không đổi kích thước theo dismissed history.

## Risk Assessment

- Snapshot stale sau khi student accept/dismiss (hai actor) → phase 5 xử lý bằng fetch fresh pending khi mở modal gợi ý; KHÔNG poll.
- Deploy skew web-mới/server-cũ làm workspace trắng nếu field là required — đã chốt optional + default [] + order server-trước (Key Insights); ghi rõ vào PR description.

## Security Considerations

- Teacher role + org scope trên mọi route mới (tự động trong vocabTeacherRoutes — verify bằng test 403 với student token nếu có pattern).
- Note là input hiển thị cho student: zod trim max 500; render text node (student side), không dangerouslySetInnerHTML.

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
