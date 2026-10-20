---
title: "Vocab pronunciation: thay audio player mặc định bằng 2 nút Nghe / Nghe chậm"
description: "Thay thanh <audio controls> mặc định của trình duyệt (thẻ Làm quen từ mới + câu hỏi Nghe và chọn từ) bằng component custom có 2 nút: phát tốc độ bình thường và phát tốc độ chậm."
status: pending
priority: P2
effort: 3h
issue: 371
branch: ai-handle-issue-371
tags: [feature, frontend, vocab, student-app, ui, a11y]
blockedBy: []
blocks: []
created: 2026-10-20
---

# Vocab pronunciation: 2 nút Nghe / Nghe chậm

## Overview

Màn học từ vựng của Student Portal đang dùng `<audio controls>` mặc định của trình duyệt để phát âm từ. Thanh này hiển thị `0:00 / 0:00`, thanh tua, nút volume và menu ⋮ — vô nghĩa với 1 file phát âm dài ~1 giây, lệch hẳn khỏi design dark/mono của app và mỗi trình duyệt render một kiểu.

Kế hoạch thay nó bằng một component custom `VocabPronunciationButtons` gồm **2 nút**:

1. **Nghe** — phát ở tốc độ bình thường (`playbackRate = 1`).
2. **Nghe chậm** — phát ở tốc độ chậm (`playbackRate = 0.6`, giữ nguyên cao độ qua `preservesPitch`).

Có 2 chỗ đang dùng `<audio controls>` cho phát âm từ vựng, cả 2 đều đổi sang component mới để nhất quán:

| Vị trí | File | testid cũ |
|---|---|---|
| Thẻ "Làm quen từ mới" (ảnh chụp trong issue) | `apps/student/src/components/vocab/vocab-session-view.tsx` (~dòng 635) | `vocab-intro-audio` |
| Câu hỏi "Nghe phát âm và chọn từ đúng" | `apps/student/src/components/vocab/prompt-listening-choice.tsx` (~dòng 63) | `vocab-audio-player` |

Luồng tải audio (`fetchVocabAudioObjectUrl` → object URL → revoke khi unmount), trạng thái loading/error và nút "Bỏ qua" khi CDN lỗi (#361) **giữ nguyên** — chỉ thay phần player.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Component `VocabPronunciationButtons({ src, testIdPrefix, disabled? })` dùng 1 `HTMLAudioElement` ẩn (không `controls`), 2 nút Nghe / Nghe chậm | P1 |
| 2 | Bấm nút: đặt `playbackRate` (1 hoặc 0.6), `currentTime = 0`, `play()`; bấm lại khi đang phát → phát lại từ đầu với tốc độ của nút vừa bấm; nút đang phát có trạng thái active (`aria-pressed`, màu `hot`) và reset khi `ended`/`pause` | P1 |
| 3 | Thay player ở thẻ intro và câu hỏi listeningChoice; giữ testid wrapper cũ (`vocab-intro-audio`, `vocab-audio-player`) cho wrapper, thêm `-normal` / `-slow` cho 2 nút | P1 |
| 4 | A11y: `aria-label` tiếng Việt rõ nghĩa, focus ring theo token DESIGN.md, phím Enter/Space; touch target ≥ 44px trên mobile | P1 |
| 5 | Unit test component + cập nhật test session view; pass `pnpm check`, `pnpm check-types`, `pnpm --filter student test`, e2e `vocab-srs.spec.ts`; screenshot 3 viewport | P1 |

## Non-goals

- **Không** tự động phát khi lật sang thẻ mới (autoplay) — giữ hành vi chủ động bấm như hiện tại.
- **Không** thêm thanh tua, hiển thị thời lượng, chỉnh volume.
- **Không** đổi player audio ở web giáo viên (`submission-media-player.tsx`) hay quiz media (`quiz-media-player.tsx`) — đó là file ghi âm/nghe dài, cần thanh tua.
- **Không** đổi API/luồng tải audio, không đổi engine SRS.
- **Không** thêm phím tắt bàn phím toàn cục (vd phím `R` để nghe lại).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Component VocabPronunciationButtons + thay 2 vị trí](./phase-01-pronunciation-buttons.md) | Pending |
| 2 | [Tests, gates & screenshot](./phase-02-tests-gates.md) | Pending |

## Acceptance criteria

- [ ] Thẻ "Làm quen từ mới" và câu hỏi "Nghe và chọn từ" không còn `<audio controls>`; hiện 2 nút **Nghe** và **Nghe chậm** cạnh nhau, căn giữa.
- [ ] Bấm **Nghe** phát ở `playbackRate === 1`; bấm **Nghe chậm** phát ở `playbackRate === 0.6`; mỗi lần bấm phát lại từ đầu.
- [ ] Nút đang phát có trạng thái active (`aria-pressed="true"`), trở về bình thường khi phát xong.
- [ ] Khi audio chưa tải xong: listeningChoice vẫn hiện "Đang tải âm thanh…"; khi lỗi: vẫn hiện thông báo lỗi + nút "Bỏ qua" (test #361 vẫn pass).
- [ ] Không có `<audio>` nào có `controls` trong `apps/student/src/components/vocab/`.
- [ ] Gates local pass; screenshot 1440×900, 768×1024, 375×812 đính kèm PR.

## Risks

| Rủi ro | Giảm thiểu |
|---|---|
| jsdom không implement `HTMLMediaElement.play()` | Stub `play`/`pause` trên prototype trong test |
| `preservesPitch` thiếu trên Safari cũ (`webkitPreservesPitch`) | Set cả 2 thuộc tính nếu có; mặc định trình duyệt đã giữ pitch nên không chặn |
| `play()` reject (file hỏng) | Bắt lỗi, reset trạng thái active, không crash; luồng lỗi tải vẫn do component cha xử lý |
