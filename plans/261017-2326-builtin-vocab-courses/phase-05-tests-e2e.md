---
title: "Phase 5: Tests & E2E"
status: todo
priority: P2
effort: 6h
dependencies: ["phase-02", "phase-03", "phase-04"]
---

# Phase 5: Tests & E2E

## Overview

Spec e2e mới `vocab-library-clone.spec.ts` đi trọn flow: boot seed thư viện (20/968/10160) → teacher mở tab Từ vựng → thêm 2 bài từ dialog → deck hiện badge → học sinh portal thấy deck và session có audio-fallback. Phase này cũng là cổng verification cuối: chạy đủ bộ gate local theo AGENTS.md.

## Context Links

- Scout report mục 2 (E2E harness), mục 3 (precedent seed direct-DB).
- Boot: `apps/e2e/src/boot.ts` — wipe `local.db` (:75-77), migrate thật (:82), seed library chèn ở Phase 2 bước 8; `playwright.config.ts` — `workers: 1`, webServer `boot:api` + 2 vite dev, port qua env `E2E_API_PORT/E2E_WEB_PORT/E2E_STUDENT_PORT` (override 8100/8101/8103 khi dev stack chiếm 8000/8001/8003 — AGENTS.md).
- Seed direct-DB precedent: `apps/e2e/src/account-seed.ts` (libsql connection thứ hai an toàn vì sequential), `apps/e2e/specs/vocab-srs.spec.ts:16-40` (`openDb()`, teacher signup qua UI, `test.describe.serial`).
- UI hooks cần data-testid: `vocab-add-from-library` (Phase 4), hàng deck `vocab-deck-row-${id}` (`vocab-deck-list.tsx:78`), submit `vocab-create-deck-submit` (:129).
- Student flow precedent: `vocab-srs.spec.ts` — signInStudent helper, overview deck list.
- Gate lệnh (AGENTS.md): `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter e2e e2e` (KHÔNG tồn tại script `pnpm e2e` ở root — lesson của plan #359).

## Key Insights

- **E2E không đụng CDN thật**: assert audio qua `hasAudio` trong session-data (server contract) và qua server unit test đã stub `fetch` (Phase 3); chạy phụ thuộc mạng ngoài trong CI là flake Machines. Nếu cần smoke network thật thì làm spec riêng mark skip-in-CI — không thuộc phase này.
- **Boot seed = deterministic fixture dùng chung**: mọi spec đều có thể đếm library qua direct-DB (`SELECT COUNT(*)`); spec **import `EXPECTED_COUNTS` từ seed core** (`@teacher-os/db/seed/vocab-library`) thay vì hard-code số — khi CSV đổi, chỉ một chỗ cập nhật và mọi spec theo. <!-- Updated: Red Team Session 1 - counts single-source -->
- **Boot seed fail-loud khiến CẢ suite đỏ**: seed throw → webServer không lên → mọi spec (kể cả không liên quan vocab) fail. Chấp nhận đánh đổi (một nguồn sự thật), nhưng log seed in message chỉ đường; runbook ghi "toàn suite đỏ bất thường → check seed trước tiên".
- **Teacher auth thật, data phụ direct-DB**: đúng mô hình `vocab-srs.spec.ts` — signup teacher qua UI (org bootstrap thật), class tạo qua UI luôn (rẻ), còn enroll học sinh seed thẳng DB để thu ngắn phiên.
- **Thứ tự spec serial**: workers=1 + `test.describe.serial` — clone ở test 1, student session ở test 2 dùng state đó.

## Requirements

- [ ] Spec `apps/e2e/specs/vocab-library-clone.spec.ts` phủ scenario chính (dưới đây), dùng port override trong lệnh chạy.
- [ ] Assert seed: counts library == `EXPECTED_COUNTS` (import từ seed core, không hard-code) qua direct-DB ngay đầu spec.
- [ ] Flow teacher: mở lớp → tab Từ vựng → "Thêm từ thư viện" → chọn course → tick 2 deck → clone → 2 hàng deck mới có badge "Thư viện".
- [ ] Flow student: enroll seed DB → portal overview thấy deck clone → mở deck → session-data có `hasAudio: true` (assert qua UI minigame list hoặc intercept network response của session-data).
- [ ] Re-clone cảnh báo: mở lại dialog, deck đã clone hiện chip "Đã có trong lớp" (không chặn).
- [ ] Chạy đủ gate local và ghi kết quả vào PR description.

## Architecture

Scenario `vocab-library-clone.spec.ts` (`test.describe.serial`):

1. **Seed check (direct-DB)**: mở `local.db`, `SELECT COUNT(*)` 3 bảng library == `EXPECTED_COUNTS` (import từ seed core); resolve `courseId` có ít deck (fast) và 2 `libdeck-*` đầu của course đó.
2. **Teacher signup qua UI** (pattern `vocab-srs.spec.ts:63-67`): tạo account, create class qua UI, lấy `classId` qua direct-DB.
3. **Clone qua UI**: vào lớp → tab "Từ vựng" → bấm `vocab-add-from-library` → chọn course → tick 2 hàng deck → footer hiện "2 bộ · N từ" → "Thêm vào lớp" → expect 2 hàng `vocab-deck-row-*` mới với badge text "Thư viện"; direct-DB assert `vocab_deck.source_library_deck_id` không null và `vocab_word.audio_url` có giá trị.
4. **Student**: seed enrollment trực tiếp (direct-DB, pattern `vocab-srs.spec.ts` bước 2) → signup student qua portal → verify email từ mail-log → overview có deck clone → mở deck: intercept `**/session-data` khi vào, assert JSON `cards[].hasAudio` chứa `true` cho ít nhất 1 card; minigame đầu render bình thường.
5. **Re-clone warning**: mở lại dialog → course đó → hàng deck ticked trước đó hiện chip "Đã có trong lớp".

## Related Code Files

- Create: `apps/e2e/specs/vocab-library-clone.spec.ts`.
- Đọc thôi: `apps/e2e/src/boot.ts` (đã có gọi seed từ Phase 2 bước 8 — Phase 5 không sửa), `apps/e2e/specs/helpers.ts`, `helpers-quiz.ts` (mail-log verify, org resolve), `apps/e2e/src/account-seed.ts`.

## Implementation Steps

1. Chạy bộ gate các phase trước lần cuối và sửa mọi residuals: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter @teacher-os/api test`, `pnpm --filter @teacher-os/db test`. <!-- Updated: Red Team Session 1 - thêm gate db -->
2. Viết spec theo Architecture trên, data-testid khớp Phase 4; interceptor session-data dùng `page.waitForResponse` khi bấm vào deck (pattern réseau của Playwright, không mock — request thật tới boot API).
3. Chạy: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- --grep "vocab library"`; sửa đến xanh (timeout sẵn 120s/spec, expect 15s — config :10-14).
4. Chạy full suite e2e không grep để chắc spec mới không xung đột state với `vocab-srs.spec.ts` (cùng dùng local.db nhưng serial).
5. Chạy `pnpm check` + `pnpm check-types` toàn repo lần cuối; tổng hợp kết quả 7 gate vào PR description.

## Todo

- [ ] Spec vocab-library-clone xanh (grep run)
- [ ] Full e2e suite xanh (ports 8100/8101/8103)
- [ ] 7 gate local pass, biên bản vào PR

## Success Criteria

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` xanh toàn bộ, trong đó spec mới assert được: counts khớp `EXPECTED_COUNTS` (import), 2 deck clone có badge, `source_library_deck_id` + `audio_url` trong DB, student session `hasAudio: true`.
- Gates: `pnpm check` (biome), `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter web test`, `pnpm --filter student test`, `pnpm --filter @teacher-os/api test`, `pnpm --filter @teacher-os/db test` — tất cả exit 0.
- Không thay đổi nào trong `packages/api/src/srs/vectors/` (`git diff --quiet -- packages/api/src/srs/vectors`).

## Risk Assessment

- **Boot chậm hơn do seed 10k rows** (likelihood trung, impact thấp): timeout webServer đã 120s (`playwright.config.ts:40`); nếu gần ngấp thì tối ưu seed (transaction bọc) — không giảm dữ liệu seed.
- **Flake do interceptor session-data bắn sớm** (likelihood trung, impact trung): dùng `waitForResponse` gắn với action bấm (không waitFor sau sự kiện), retry theo config CI (`retries: 1`).
- **Spec mới phá state spec vocab cũ** (likelihood thấp, impact trung): mọi ghi của spec mới nằm trong org/class riêng (runToken suffix như `vocab-srs.spec.ts:20-24`); library chỉ đọc.

## Security Considerations

- Spec dùng account/test password giả trong môi trường boot cục bộ — không secret thật; mail-log chứa link verify là dữ liệu test.
- Không backdoor seed qua server helper (khoá trực tiếp DB như `account-seed.ts:8-13` — lesson #359 validation).
- Assert IDOR org tại server test (Phase 3); e2e chỉ phủ happy path + UX warning, không nhân bản test bảo mật ở 2 tầng.

## Next Steps

- Gộp PR theo phase (mỗi phase một PR vào `develop` nếu reviewer muốn review nhỏ; hoặc 1 PR khi chạy solo). **Deploy order**: migration 0037 trước worker; **worker + student cùng release train** (session-data thêm `hasAudio` — student cũ parse `.strict()` sẽ vỡ toàn bộ vocab nếu lệch train; alchemy deploy chung một bước là đủ, đừng promote riêng lẻ; rollback cũng rollback cả hai); seed `--d1` staging → verify → **prod chỉ sau khi Open Question 1 (giấy phép) resolved**. <!-- Updated: Red Team Session 1 - deploy order + license gate -->
- Follow-up candidates (không thuộc scope): mirror audio R2 (Open Question 2), pos/sentence/picture đưa vào UI học từ khi có thiết kế, trang thư viện standalone ngoài dialog.
