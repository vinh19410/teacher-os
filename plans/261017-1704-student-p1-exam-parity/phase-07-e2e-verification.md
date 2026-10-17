---
title: "Phase 7: E2E & Verification Gate"
status: todo
---

# Phase 7: E2E & Verification Gate

## Context Links

- [Scout §G](../reports/scout-report.md) · AGENTS.md (gate local, ports) · Red-team findings #12, #15, #17(FMA9), #2.

## Overview

Bộ e2e + unit phủ 6 tính năng P1 qua **flow thật** (POST start qua API — không chỉ seed DB attempts) và chạy gate local như PR ship thật.

## Key Insights

- **Seed audio qua API teacher upload** (red-team #15 — `MEDIA_DIR` là mkdtemp private trong process boot `boot.ts:98`, spec KHÔNG thể ghi đĩa trực tiếp): spec signup teacher → PUT `/api/assignments/prompts/:id/audio` với fixture WAV → test luôn pipeline upload thật.
- **Timer e2e tách seed**: auto-submit dùng timeLimit ngắn (8-10s + poll 30s); case "refresh giữa chừng" dùng seed DÀI riêng (30-60 phút) chỉ assert countdown giá trị sau refresh — KHÔNG dùng seed ngắn cho refresh (CI chậm ăn hết remaining → flake-by-design).
- **Explanation phải qua POST start thật** (parser layer!): seed prompt có explanation → student start attempt qua API → nộp → detail có explanation — bắt được regression strip parser mà seed-bypass sẽ bỏ sót.
- Guard dialog copy chốt: **"Bạn còn N câu đang đánh dấu xem lại"** (đồng bộ Phase 3).
- **Rate-limit boundary để server test** (`apps/server/src/*.test.ts` — gọi POST 6 lần bằng fetch, tuần tự); e2e chỉ happy path gửi 1 feedback + manifest + 0 SW — KHÔNG loop UI 6 lần (chậm, flake; PR vào develop không CI, `pnpm e2e` local là gate duy nhất).
- `no-service-worker.spec.ts` hiện chỉ chạy WEB_ORIGIN — **chắc chắn thêm student** (không "nếu").
- **Gate KHÔNG có `pnpm --filter ui run test`** (packages/ui không có script test — sẽ error Missing script; red-team #2). Test UI packages/ui component đặt ở `apps/student/test/`.
- E2e boot wipe DB/mail-log/MEDIA_DIR mỗi lần chạy; screenshot plan cũ bị regen (lesson #357) → `git status` + restore trước commit.
- Playwright autoplay: click Play thật (gesture) rồi dispatch `ended` để assert khóa nút.

## Requirements

- [ ] 5 spec e2e mới (timer, flag, listening+explanation, history, feedback+pwa) — qua flow thật.
- [ ] `no-service-worker.spec.ts` cover student port.
- [ ] Unit/server tests: exam-countdown, flags store, streak, feedback rate-limit + pageUrl.
- [ ] Gate local full pass + screenshots UI mới (3 viewport).

## Files to Create / Modify

- Modify: `apps/e2e/specs/helpers-quiz.ts` (seed timeLimitSeconds/explanation/transcript + helper teacher session upload audio)
- Create: `apps/e2e/specs/student-exam-timer.spec.ts` (2 seed: ngắn auto-submit, dài refresh)
- Create: `apps/e2e/specs/student-question-flag.spec.ts`
- Create: `apps/e2e/specs/student-listening-explanation.spec.ts`
- Create: `apps/e2e/specs/student-history-streak.spec.ts`
- Create: `apps/e2e/specs/student-feedback-pwa.spec.ts`
- Modify: `apps/e2e/specs/no-service-worker.spec.ts` (thêm student origin)
- Create: `apps/e2e/fixtures/audio/sample.wav` (sinh bằng script node — script commit)

## Implementation Steps

1. Helpers: seed field mới + `uploadPromptAudioViaApi(teacherCtx, promptId, filePath)`; fixture WAV ~1s sinh script.
2. `student-exam-timer.spec.ts`: (a) seed timeLimit 8s → vào take → countdown hiện → `expect.poll` auto-submit → summary; (b) seed 30 phút → vào take → F5 → countdown tiếp tục (giá trị ≈ trước refresh, KHÔNG reset 30:00); (c) đề không timeLimit → không countdown.
3. `student-question-flag.spec.ts`: flag 1 câu → navigator marker → nộp → dialog chứa "Bạn còn 1 câu đang đánh dấu xem lại" → nộp nốt.
4. `student-listening-explanation.spec.ts`: teacher tạo đề listening (upload audio + transcript + explanation qua UI/API thật) → student start (POST start) → player hiện → click Play → dispatch ended → nút disabled → F5 vẫn disabled (play-state) → nộp → summary Transcript + detail "Giải thích" per câu.
5. `student-history-streak.spec.ts`: seed attempts submittedAt hôm nay/hôm qua/3 ngày trước → /history đúng thứ tự + filter skill + streak 2 + count7d 3 + chip "Nộp trễ" cho bài seed submittedAt vượt deadline; empty state học viên mới.
6. `student-feedback-pwa.spec.ts`: gửi 1 feedback thành công (toast); manifest 200 + JSON parse; student `navigator.serviceWorker.getRegistrations()` rỗng; honeypot → không lưu (verify bằng GET list? — không có view; verify qua DB query trong test helper hoặc skip, server test đã cover).
7. Unit/server: countdown (đã có Phase 2), flags store (Phase 3), streak (Phase 5), feedback rate-limit + pageUrl + honeypot (Phase 6) — confirm tồn tại + chạy.
8. Gate: `pnpm check && pnpm check-types && pnpm --filter web run test && pnpm --filter student run test && pnpm --filter server run test && pnpm e2e` (E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103).
9. Screenshots màn mới 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo REVIEW.md; `git status` dọn screenshot plan cũ regen.

## Todo

- [ ] Helpers seed field mới + upload audio qua API teacher + fixture WAV
- [ ] 5 spec e2e (timer 2 seed, flag copy chốt, listening qua POST start thật, history + nộp trễ, feedback happy)
- [ ] no-service-worker thêm student
- [ ] Confirm unit/server tests 4 mảng
- [ ] Gate local full pass (KHÔNG có `--filter ui run test`)
- [ ] Screenshots 3 viewport + dọn regen

## Success Criteria

- E2e pass 2 lần liên tiếp không flake; gate local xanh; spec cũ không regression.
- Explanation hiện trong review qua flow start thật (chứng minh không bị parser strip).
- Màn mới có screenshot; UI pass 3 viewport + keyboard.

## Risk Assessment

- Autoplay headless: click Play + dispatch ended; nếu flake → chỉ assert trạng thái sau event.
- Timer ngắn CI chậm: poll timeout 30s; refresh case dùng seed dài.
- Screenshot regen cũ: git status + restore (lesson #357).

## Security Considerations

- E2e không seed secret; fixture tự sinh.

## Next Steps

Sau khi pass: PR vào `develop` (body tiếng Việt, Relates-to issue), deploy-runbook Phase 1 (migration 0036 trước worker; server + student cùng release; web teacher sau server).
