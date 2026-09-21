---
title: "Trình dựng lại trang tạo bài tập theo thiết kế v5 — 4 kỹ năng IELTS + đáp án chấm tự động"
description: "Dựng lại /assignments/new theo assignment-create-5.html: 4 kỹ năng Writing/Reading/Listening/Speaking (preset 3 cấp), q-editor + đáp án chấm tự động, audio metadata, preview/success card mở rộng, migration 0019 + contract v2 cho assignment_prompt."
status: pending
priority: P1
effort: 18h
issue: 211
branch: vinh19410/issue-211-assignment-create-redesign
tags: [feature, frontend, backend, database, api]
created: 2026-09-21
---

# Trình dựng lại trang tạo bài tập theo thiết kế v5 — 4 kỹ năng IELTS + đáp án chấm tự động

## Overview

Trang `/assignments/new` hiện chỉ soạn đề Writing (task1/task2 + genre, contract 8 field). Thiết kế v5 (`assignment-create-5.html`) mở thành đủ 4 kỹ năng IELTS: mỗi kỹ năng có parts và question types (catalog preset 3 cấp), Reading/Listening có **q-editor + answer key** để chấm tự động, Listening có **metadata file nghe** + transcript, Speaking có cue card; preview phía học viên, card ngân hàng và success card đều mở rộng theo. Plan này thay model dữ liệu (`assignment_prompt` + migration 0019), contract wire v2 (`.strict()` + superRefine theo skill), snapshot/mapper, catalog preset client, trang tạo + 5 component, và các surface tiêu thụ (`bank.tsx`, `class-assignments-tab.tsx`, `bank-preview-aside.tsx`).

## Design Source

- Chuẩn: `assignment-create-5.html` — "Tạo đề · đáp án chấm tự động" (cập nhật 2026-09-21 10:40) trong project Open Design `f2f4d498-7ea3-403c-89e9-6ac3099ac79b`, đường dẫn đầy đủ: `~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/f2f4d498-7ea3-403c-89e9-6ac3099ac79b/assignment-create-5.html`. v5 ≡ v4 về nội dung, thay cho v1–v3.
- Spec hiển thị (copy verbatim + state machine + KIND map): [research/design-spec.md](./research/design-spec.md).

## Key Decisions

1. **Mở rộng `assignment_prompt` bằng migration 0019 additive, giữ cột legacy `task`/`genre`** — 10 cột mới: `skill`, `part`, `type`, `intro`, `passage`, `transcript`, `cue_topic`, `cue_points`, `audio_name`, `questions` (JSON text). Migration kèm UPDATE backfill `skill='writing', part=task, type=genre` (mọi row hiện tại là Writing; id part/type map 1:1 preset cũ). Không destructive migration.
2. **Cột legacy vẫn được ghi bởi server như giá trị phái sinh compat** (writing: `task=part`, `genre=type`; skill khác: `'task2'`/`''`) vì SQLite bỏ NOT NULL phải rebuild bảng — không đáng. Consumer nào cũng đọc `skill`/`part`/`type` mới.
3. **Contract v2 thay `task`/`genre` bằng `skill`/`part`/`type` + bộ trường tường minh full-field** (`prompt`, `passage`, `intro`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `questions[]`, giữ `title/band/source/note/status`) — luôn gửi đủ trường, chuỗi rỗng khi không áp dụng (precedent `reportCreateSchema` gửi `content` cả draft). `superRefine` theo skill mirror đúng `canSave` của design: draft R/L cần ≥1 stem; **ready** R/L cần mọi stem + answer; listening ready cần `audioName`; writing cần `prompt`; speaking p2 cần `cueTopic`, p1/p3 cần `prompt`.
4. **`questions` lưu JSON text, `audioName` sentinel `""`** — snapshot parse JSON an toàn (try/catch → `[]`) đưa mảng object lên wire; `audioName` chuỗi rỗng = chưa đính (precedent `source`), không nullable.
5. **Phase 1 gộp cả DB + contract + server route + snapshot + server tests** (điều chỉnh so với gợi ý tách DB/contract riêng) vì route import trực tiếp schema và `db.insert(...).values(...)` type-buộc cột notNull legacy — tách riêng sẽ làm `pnpm check-types` đỏ giữa chừng. Theo đúng precedent phase 1 của #208.
6. **Catalog preset 3 cấp rewrite `assignment-presets.ts`** (SKILLS → parts với `qStart/spec/help/source` → types với template title/prompt/passage/intro/items/transcript/cue, port verbatim copy design; `KIND` map type→dạng đáp án). Giữ export compat (`TASK_PRESETS`, `taskOf`, `genreOf`) suy ra từ catalog mới cho tới phase 4 dọn consumer xong — mọi phase giữ compile xanh.
7. **Giữ useState + `useKernelFormSubmit`, không đưa react-form vào** (pattern mọi form của app). `new.tsx` orchestrates state; UI tách: rework `prompt-composer`, **mới** `question-key-editor`, extend `student-preview-paper` / `bank-context-card` / `create-success-card`; action bar state machine đúng thứ tự ưu tiên 6 bậc của design §5.
8. **Audio là metadata-only trong milestone này** — picker chỉ lấy tên file, "Dùng file mẫu Cambridge 10" set tên cứng; không upload/playback (chưa có hạ tầng R2/multipart, kernel JSON-only). Ghi Non-Goal.
9. **Bank card filter theo skill** (`Đề {Skill} đã có`), grade banner (X/Y đáp án) + key-scan chỉ hiện R/L; trang `/assignments/bank` đổi filter task→skill, `/classes` picker đổi theo — mọi consumer đọc `skill` mới.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Migration 0019 + contract v2 `.strict()`/superRefine + POST route + snapshot row mở rộng + server tests (201/400/401, org-scoped, ma trận theo skill) | P1 |
| 2 | Catalog preset 3 cấp (port verbatim design) + web data layer v2 (action payload, mapper, UI type) + unit tests | P1 |
| 3 | Trang `/assignments/new` đủ thiết kế v5: skill/part/type picker, fields theo skill, q-editor + answer key + key-scan, audio metadata + transcript, cue card, preview live không hiện đáp án, grade banner, bank card filter skill, action bar 6 bậc, success card meta mở rộng | P1 |
| 4 | Consumer: `/assignments/bank` filter skill + preview 4 kỹ năng, picker `/classes` filter skill; dọn compat exports | P1 |
| 5 | E2E: 2 test Writing hiện tại giữ xanh + Reading ready (khóa đáp án, sống qua reload, hiện ở bank) + Listening draft (chặn ready thiếu file/đáp án) | P1 |
| 6 | `pnpm check && pnpm check-types && pnpm test` xanh toàn repo | P1 |

## Non-Goals

- Không upload/playback file nghe thật (chỉ lưu tên file — metadata); hạ tầng R2/multipart là plan riêng.
- Không làm phía học viên (nộp bài, chạy chấm tự động runtime) — chỉ khóa đáp án để chấm sau.
- Không edit/delete đề đã lưu (thiết kế không có).
- Không đính kèm ảnh biểu đồ Task 1 (giữ nguyên note_help design).
- Không seed dữ liệu BANK mẫu của mock vào production.
- Không đụng bảng `assignment` (grading) hay luồng giao bài #208 ngoài filter chip.

## Assumptions

- `assignment-create-5.html` là bản chuẩn (mới nhất; v5 ≡ v4). Issue GitHub kế tiếp là **#211** (#210 đã được chiếm bởi plan "Tạm ẩn cụm Phụ huynh Báo cáo") — branch `vinh19410/issue-211-assignment-create-redesign`.
- qStart theo part (R: 1/14/27, L: 1/11/21/31) và số câu hỏi chỉ là **hiển thị + resize danh sách** client-side; không lưu qStart.
- Words/minutes trong `spec` là display-only từ catalog, không lưu DB.
- "Dùng file mẫu Cambridge 10" set tên file cứng theo mock (vd `cam10-test2-s1.mp3`); không phát được — honest UI ghi rõ "Sẽ phát cho học viên khi được giao".
- Deploy: server (kèm migration 0019) trước web — additive nên rollback an toàn.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Kernel: schema 0019, contract v2 & POST API](./phase-01-kernel-schema-contract-api.md) | Pending |
| 2 | [Web data layer & catalog preset 3 cấp](./phase-02-web-data-layer-presets.md) | Pending |
| 3 | [Trang tạo đề 4 kỹ năng + components](./phase-03-create-page-components.md) | Pending |
| 4 | [Consumer surfaces: bank, class picker, preview](./phase-04-consumer-surfaces.md) | Pending |
| 5 | [E2E & verification sweep](./phase-05-e2e-verification.md) | Pending |

## Success Criteria

- [ ] Tạo được đề đủ 4 kỹ năng; Reading/Listening có answer key; listening draft lưu được không cần file, ready bị chặn client + server khi thiếu file hoặc thiếu đáp án
- [ ] Đề Reading ready lưu xong sống qua reload, hiện trong bank list với filter skill; org khác không thấy
- [ ] Preview phía học viên không bao giờ hiện đáp án/answer key; cue card + audio row + tags mới đúng design
- [ ] Success card đủ meta rows (Kỹ năng, Phần thi, Band, Chi tiết, Chấm điểm R/L, Nguồn, Trạng thái, Giao lớp)
- [ ] Migration 0019 apply sạch trên DB fresh (server test harness) và backfill đúng cho row Writing cũ
- [ ] `pnpm check && pnpm check-types && pnpm test` xanh; 4 spec E2E (2 cũ + 2 mới) xanh

## Verification Commands

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-prompt-create
pnpm check && pnpm check-types && pnpm test
```

## Dependencies

- Xây trên #202 (trang new + `assignment_prompt`) và #208 (bank list + class assign) đã merge. Không blocked-by plan nào đang mở. Blocks: upload audio thật + runtime chấm tự động phía học viên (tương lai).

## Red Team Review

Chưa chạy.

## Validation Log

_(placeholder — điền sau khi validate/red-team)_

<!-- slug: assignment-create-redesign -->
