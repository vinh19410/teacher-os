---
title: "Phase 2: DB schema — classId nullable + bảng vocab_suggestion"
status: done
---

# Phase 2: DB schema — classId nullable + bảng vocab_suggestion

## Context Links

- `packages/db/src/schema/vocab.ts` (vocabDeck/vocabWord/vocabCard/vocabReviewLog)
- `packages/db/src/schema/vocab-library.ts` (#361)
- Migration cuối `0037_cheerful_gambit.sql`; kết luận D3 (migrate flow + precedent 0011) từ Phase 1

## Overview

Migration `0038`: `vocab_deck.class_id` thành nullable (SQLite → **recreate bảng**, không phải ALTER additive) + bảng mới `vocab_suggestion`. Không đổi gì các bảng SRS (`vocab_card`, `vocab_review_log`).

## Key Insights

- **RT-F2/RT-19 (red-team):** SQLite không ALTER NOT NULL→NULL được — drizzle-kit sinh chuỗi recreate `PRAGMA foreign_keys=OFF → CREATE __new → INSERT SELECT → DROP → RENAME`; repo đã có tiềnếc phải đè SQL generate (`0011_classy_clea.sql`). Migration phải được **audit từng statement + rehearse trên staging có data** trước promotion; window mất ghi ms-level trong lúc DROP/RENAME là chấp nhận được (deploy off-hours), ghi nhận trong runbook.
- **RT-F3 (doctrine F7):** repo KHÔNG dựa FK cascade (`PRAGMA foreign_keys` không bật per-connection — docblock `schema/vocab.ts:17-19`); mọi xoá là batch tường minh. `vocab_suggestion` đặt FK để ràng buộc logic, nhưng **code xoá deck bắt buộc xoá suggestion trong cùng batch** (phase 4). Không có flow xoá lớp nào tồn tại trong repo — không claim "hành vi cũ" về cascade lớp.
- **RT-F20:** `teacherId` đặt **FK `user.id` ON DELETE CASCADE** theo pattern chuẩn repo (`membership.ts:21`, `student-invitation.ts:21`) — precedent "no-FK như vocab_review_log" KHÔNG tồn tại (bảng đó không có teacherId).
- **RT-F19:** 1 row duy nhất per `(student, deck)` — `UNIQUE(student_id, deck_id)` thường + upsert flip-status; KHÔNG dùng partial unique index (không tiền lệ trong repo, mọi query sau phải nhớ `WHERE status='pending'`).
- Type contract phải nới cùng PR: `KernelVocabDeckRow.classId: string` → `string | null` (`packages/api/src/contracts.ts:2186`) + update assert shape trong `vocab-teacher.test.ts:247-254`, `vocab-library.test.ts:460-489`.

## Requirements

- [x] `vocabDeck.classId` nullable; index `vocab_deck_class_idx` giữ (SQLite index chấp nhận NULL)
- [x] Bảng `vocab_suggestion` theo Architecture dưới đây (UNIQUE thường, FK user)
- [x] Migration 0038: generate → audit từng statement theo precedent 0011 → rehearse staging → apply local, seed library #361 vẫn chạy
- [x] `KernelVocabDeckRow.classId` → `string | null` + tests assert shape cập nhật
- [x] Không data migration cần thiết (deck cũ giữ classId)

## Architecture

```
vocab_suggestion
  id            text PK
  org_id        text NOT NULL FK organization ON DELETE CASCADE
  teacher_id    text NOT NULL FK user ON DELETE CASCADE          -- pattern membership.ts:21
  student_id    text NOT NULL FK student ON DELETE CASCADE
  deck_id       text NOT NULL FK vocab_deck ON DELETE CASCADE    -- ràng buộc logic; xoá bằng batch tường minh (F7)
  note          text                                             -- hiển thị cho học viên; zod trim max 500 (phase 4)
  status        text NOT NULL DEFAULT 'pending'  -- 'pending' | 'accepted' | 'dismissed'
  created_at    tms NOT NULL default now
  responded_at  tms NULL                         -- thời điểm accept/dismiss (progress dùng làm acceptedAt)
  INDEX (org_id)
  INDEX (student_id, status)
  UNIQUE (student_id, deck_id)                   -- 1 row duy nhất; re-suggest = flip status về 'pending' (upsert)
```

Transition matrix (RT-F6, chốt ở phase 3/4):
- `pending → accepted` (student accept; idempotent nếu đã accepted)
- `pending → dismissed` (student "Ẩn"; teacher thu hồi = flip `dismissed` — KHÔNG hard-delete, giữ respondedAt)
- `accepted → dismissed` chỉ qua hành động teacher thu hồi; student KHÔNG dismiss được deck đã accept (409)
- `vocab_card` đã provision KHÔNG dọn khi thu hồi — deck rơi khỏi danh sách học (predicate phase 3), dữ liệu SRS giữ nguyên nếu teacher gợi ý lại

## Related Code Files

- Sửa: `packages/db/src/schema/vocab.ts` (vocabDeck.classId + export vocabSuggestion)
- Sửa: `packages/api/src/contracts.ts` (`KernelVocabDeckRow.classId` nullable)
- Tạo: `packages/db/src/migrations/0038_<tên drizzle-kit sinh>.sql` (generate + audit, có thể đè tay theo precedent 0011)
- Sửa (nếu cần): `packages/db/src/schema/index.ts` (re-export)

## Implementation Steps

1. Sửa `vocabDeck`: bỏ `.notNull()` trên classId, cập nhật docblock (#deck riêng, doctrine F7).
2. Thêm bảng `vocabSuggestion` theo Architecture.
3. `pnpm --filter @teacher-os/db exec drizzle-kit generate` → **audit từng statement của 0038**: recreate `vocab_deck` phải copy đủ cột trong INSERT SELECT, tạo lại đủ 3 index (`org_idx`, `class_idx`, `source_library_idx`); nếu generate sai → đè tay theo precedent `0011_classy_clea.sql`.
4. Test schema trong `packages/db` (vitest đã có — `package.json:13`): assert CREATE TABLE suggestion + UNIQUE(student_id, deck_id) + vocab_deck recreate giữ data.
5. Apply migration local (theo D3) + rehearse trên bản sao DB staging có data thật (#361 seed) trước khi tính deploy.
6. Nới `KernelVocabDeckRow.classId` + cập nhật asserts trong `vocab-teacher.test.ts`, `vocab-library.test.ts`.
7. Chạy seed library local để chắc không vỡ: flow #361 (clone-on-assign), verify bằng cách clone 1 deck vào 1 lớp trên dev stack.

## Todo

- [x] vocabDeck.classId nullable + KernelVocabDeckRow nullable + asserts
- [x] vocabSuggestion table (UNIQUE thường, FK user)
- [x] Migration 0038 generate + audit + rehearse staging
- [x] Test schema packages/db + apply local + smoke seed library

## Success Criteria

- Migration 0038 đã audit + rehearse; dev stack local boot với DB đã migrate; tạo deck có lớp (flow cũ) vẫn hoạt động; `pnpm --filter @teacher-os/db test` xanh.

## Risk Assessment

- Recreate bảng chạy trên production đang nhận ghi: window DROP→RENAME ms-level có thể mất INSERT của worker cũ → deploy trong giờ thấp điểm + rehearse staging; forward-only không rollback (`docs/production-release-runbook.md:206-208`) — chấp nhận và ghi runbook.
- Type `classId: string | null` làm vỡ TS ở server/web — xử lý dứt điểm trong cùng PR (grep mọi `.classId` của vocabDeck qua check-types).

## Security Considerations

- Không có secret; org-scoping mọi query mới (where orgId) — enforce ở phase 3/4.

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
