---
title: "Phase 5: Student Vocab UI"
status: todo
---

# Phase 5: Student Vocab UI

## Context Links

- Route pattern student: `apps/student/src/routes/_auth/` (file-based TanStack Router; guard ở `_auth/route.tsx`); route runtime gần nhất: `routes/_auth/learn/quizzes/attempt/$attemptId.tsx`.
- Repo pattern: `apps/student/src/lib/repos/student.ts:24-46` (fetch `credentials: "include"` + header `x-student-org-id` từ localStorage) — viết `repos/vocab.ts` theo đúng khuôn.
- Audio client precedent: `apps/student/src/components/quiz/quiz-media-player.tsx` (blob fetch kèm org header + revoke).
- DESIGN.md: accent cam `#ff5b1f` duy nhất; `--verdict-correct/wrong` chỉ cho đúng/sai + icon ✓/✗; Inter Tight + DM Mono; radius 4/6/8; motion 150ms `cubic-bezier(0.28,0,0.22,1)`; token nguồn `packages/ui/src/styles/globals.css` — không hard-code.

## Overview

Giao diện student cho vocab: trang tổng quan (due/streak/countdown/danh sách deck), trang deck (chọn học từ mới / ôn tập), màn session runtime chạy 5 minigame (meaningChoice, wordChoice, listeningChoice, typing, selfCheck) + feedback + Continue + wrong-streak overlay + summary. Wrap engine Phase 4 — UI chỉ render + đẩy first-result qua repos Phase 3.

## Key Insights

- **Session runtime là state in-memory React** — instance engine tạo **đúng 1 lần** trong `useRef`/`useState` initializer keyed theo `(deckId, sessionLoadNonce)` (red-team F14: cấm module-level store — singleton dính queue/firstResult-map xuyên session; cấm khởi tạo trong render body — mỗi re-render reset queue → double first-result). KHÔNG dựng autosave-mirror kiểu `quiz-attempt-store.ts`: mỗi first-result đã POST atomic ngay, refresh mất queue nhưng card đã persist → mở lại session build lại từ due mới.
- **Failure path bắt buộc** (red-team F9): POST answer/learn-commit fail → **giữ feedback, chặn Continue**, hiện banner lỗi + nút "Thử lại" (retry giữ nguyên `clientLogId`) + "Bỏ qua" (explicit discard). Engine chỉ advance queue sau POST 200 — không happy-path im lặng.
- **404 giữa phiên** (deck bị teacher xoá — `VOCAB_CARD_NOT_FOUND`): dialog "Deck đã bị xoá" + thoát an toàn về overview; gọi engine `removeCard(cardId)` trước khi thoát nếu còn card khác học tiếp được (red-team F14).
- **Engine chạy trong client** (`@teacher-os/api` import vào student): build queue, chọn kind, sinh options, chấm exact-match/typing — tất cả từ module Phase 4; UI không tự nghĩ rule nào.
- **Chọn loại phiên theo deck** (mapping Flinto): còn card `state=new` → Learn session; hết `new` → Review (due uncapped trong deck; rỗng → ôn lại toàn bộ deck). Toàn bộ logic chọn này nằm trong engine/UI helper, không phải server.
- **typing input**: hint hiển thị `typingHint(word, level)`; submit Enter; match dùng `matchTyping` engine; nút "Mình không nhớ" có mặt ở MỌI minigame (kể cả typing — lối thoát duy nhất khi không trả lời được).
- **Overlay wrong-streak 5**: chặn mọi input tới khi dismiss (pointer-events + focus trap); tự Continue 240ms sau dismiss nếu prompt là selfCheck (rule §3.4).

## Requirements

- [ ] Route `/vocab` (overview): đếm due + countdown `formatCountdown(nextDueAt − now)` + upcoming label (`upcomingCount` từ overview contract — render clamp `max(1, n)` khi nextDueAt != null, red-team F15), streak, learned/mature, danh sách deck theo lớp (mới/đến hạn mỗi deck) — link sang `/vocab/$deckId`.
- [ ] Route `/vocab/$deckId`: tiêu đề deck, số từ mới / due / đã thuộc, **hint next-review bằng `formatInterval`** (spec §6 — "sau 3d" theo dueAt gần nhất của deck; red-team F15: formatInterval không được dead code), nút hành động đúng loại phiên (Học từ mới / Ôn tập / Ôn lại).
- [ ] Route `/vocab/$deckId/session`: runtime — render prompt theo kind, progress `done/total`, feedback panel (đáp án đúng + word + IPA), Continue (chỉ hiệu lực khi feedback), overlay wrong-streak, summary cuối (recall %, learned, "Missed first try").
- [ ] 5 prompt components + shared option grid (4 options, exact string equality scoring), typing box + hint, selfCheck flip card (Remembered/Forgot).
- [ ] `repos/vocab.ts`: fetch + Zod `.strict()` parse (schema từ contracts Phase 2) + POST answer/learn-commit với `clientLogId = crypto.randomUUID()`.
- [ ] listeningChoice: audio blob fetch + `<audio>` controls, chỉ render khi `hasAudio`.
- [ ] Component tests + verify 3 viewport + keyboard focus.

## Architecture

```
apps/student/src/
├── lib/repos/vocab.ts                    # fetch + parse + POST (clientLogId gen)
├── routes/_auth/vocab/index.tsx          # overview (TanStack Query useQuery)
├── routes/_auth/vocab/$deckId.tsx        # deck detail + nút vào session
├── routes/_auth/vocab/$deckId.session.tsx (hoặc $deckId/session.tsx theo cấu trúc routeTree hiện có — verify lúc cook)
└── components/vocab/
    ├── vocab-session-view.tsx            # orchestrator: engine session + prompt dispatch + feedback + continue
    ├── prompt-meaning-choice.tsx
    ├── prompt-word-choice.tsx
    ├── prompt-listening-choice.tsx
    ├── prompt-typing.tsx
    ├── prompt-self-check.tsx
    ├── vocab-feedback-panel.tsx
    ├── wrong-streak-overlay.tsx
    ├── vocab-summary.tsx
    └── vocab-countdown.tsx               # formatCountdown tick 1s (cleanup interval)
```

## Related Code Files

- Create: cây trên.
- Modify: `apps/student/src/routes/_auth/index.tsx` (thêm entry point "Từ vựng" vào overview trang chủ — link + due badge); shell/nav của student app (tìm component shell tương đương `StudentShell` dùng trong routes hiện có — KHÔNG có file `student-nav.tsx` sẵn, red-team F15 citation fix).

## Implementation Steps

1. Viết `repos/vocab.ts` theo khuôn `repos/student.ts` (headers, error map `VOCAB_ERROR_CODES`, zod parse strict). Sinh `clientLogId` ngay lúc user respond — **retry giữ nguyên id đó** (store id trong state cho tới khi nhận 200).
2. Viết 3 routes + query hooks; overview dùng `formatCountdown` (tick 1s, chỉ re-render component countdown).
3. Viết `vocab-session-view.tsx`: khởi tạo engine session **đúng 1 lần** (`useRef(() => build(...))` keyed (deckId, nonce)); map engine state → UI; nối callbacks: `onFirstResult` → `repos.postAnswer` (review) / `onCommit` → `repos.postLearnCommit` (learn); **chỉ advance queue sau 200**; fail → banner retry (giữ clientLogId) + chặn Continue; 404 → dialog deck bị xoá + `engine.removeCard` + thoát an toàn.
4. Viết prompt components (props: prompt + onRespond; disable mọi input khi feedback/overlay); typing dùng input + hint; option grid theo DESIGN.md (chọn = nền chìm + chữ cam, không gradient).
5. Viết overlay + summary; motion 150ms; đúng/sai dùng `--verdict-correct/wrong` + icon ✓/✗.
6. Component tests: render từng prompt (options đúng số lượng, hint đúng level), respond flow (correct → feedback → Continue → next card), overlay chặn input (simulate streak 5), typing match NFC (gõ "café" cho "café" pass; "cafe" fail), **POST fail → Continue bị chặn + banner retry hiện** (mock reject), **re-render không reset session** (wrap state bump, assert prompt giữ nguyên — red-team F14), **404 giữa phiên → dialog**.
7. Verify 3 viewport (1440/768/375) + keyboard: tab qua options, Enter submit typing, Enter Continue, Esc không thoát session giữa chừng (confirm dialog). Chụp screenshot cho PR.

## Todo

- [ ] repos/vocab.ts + parse strict
- [ ] Overview + countdown
- [ ] Deck detail + loại phiên
- [ ] Session runtime + 5 prompts + feedback + overlay + summary
- [ ] Audio listeningChoice
- [ ] Component tests + 3 viewport + screenshots

## Success Criteria

- `pnpm --filter student run test` pass; `pnpm check-types` sạch.
- Flow tay trên dev stack (ports 8003): teacher seed deck → student học Learn hết → overview hiện countdown 1d; review trả lời đúng/sai → level + queue hành xử đúng (kiểm bằng UI).
- Không hard-code màu/khoảng cách lệch DESIGN.md (review token).

## Risk Assessment

- **Pool lớn render options trễ**: generator chạy O(n) trên pool mỗi prompt — với vài nghìn từ vẫn nhanh (<5ms); không cần virtual hóa.
- **Route file naming `$deckId.session.tsx` vs folder**: theo cấu trúc routeTree sinh bởi router-plugin — verify bằng file routes hiện có lúc cook, tránh 404 kiểu routes-matcher prefix (lesson #345).
- **jsdom không có `<audio>`**: component test listeningChoice mock blob fetch + play() stub; e2e thật chạy được audio (Playwright).

## Security Considerations

- Parse `.strict()` mọi payload (chống field lạ vỡ bundle — precedent #304 cùng release train).
- Không render word/translation bằng `dangerouslySetInnerHTML`; text thuần (word chứa ký tự lạ chỉ là text node).
- `clientLogId` UUID tại client — không nhận từ URL/query (không inject được log id người khác vì PK độc lập + ownership check server).
