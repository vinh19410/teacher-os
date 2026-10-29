---
title: "Phase 4: Listening Audio + Transcript + Explanation"
status: todo
---

# Phase 4: Listening Audio + Transcript + Explanation

## Context Links

- [Research §2](../reports/researcher-report.md) · [Scout §B/§C/§D](../reports/scout-report.md)
- Phụ thuộc: Phase 1 (audio_key, explanation qua 2 parser, transcript wire). Red-team findings #4, #6, #9, #13(CAS).
- **Gap lớn nhất** theo report đối thủ (P1 item 3 + 4).

## Overview

(a) Teacher upload MP3 thật khi TẠO đề Listening (không có route edit — thay file = tạo lại đề; red-team #4); (b) student nghe được ở take screen — luyện tập tự do, chế độ thi play-once **honor-policy**; (c) transcript + explanation hiện sau nộp. Tái dùng media-store R2 (như Speaking), KHÔNG presign.

## Key Insights

- Media pipeline Speaking là mẫu: raw body PUT stream + GET stream (`media-store.ts`, `r2-media-store.ts:13`, e2e adapter đĩa). Student fetch blob kèm header org (`fetchQuizMediaObjectUrl` pattern `quiz.ts:303-333`) — `<audio src>` thẳng không gửi được header.
- **Play-once là honor-policy UI** (red-team #9 — ghi đúng tên trong plan + guide): người quyết tâm vượt qua luôn được (F5, DevTools). Giảm thiểu, không triệt tiêu: (a) GET audio **gate theo attempt khi đề có timeLimit** — pre-start 404; in_progress nghe trong bài; submitted mở lại (nghe lại sau nộp như Step IELTS); (b) **log mỗi GET** theo attemptId (audit); (c) play-state (playedAt/maxReached) **mirror localStorage per attempt** — F5 không reset one-shot trong cùng attempt.
- Upload teacher: **CAS theo key cũ** như Speaking (:1426 pattern — "upload sinh key mới rồi ghi CAS theo key cũ"): `UPDATE assignment_prompt SET audio_key = ? WHERE id = ? AND org_id = ? AND audio_key = <key đọc trước>`; thua CAS → re-read; delete key cũ best-effort sau DB. Note: audio là live-link vào prompt (KHÔNG snapshot như questions) — teacher thay audio giữa attempt in_progress làm học viên nghe file mới; chấp nhận, ghi risk.
- **XHR upload với progress**: apps/web KHÔNG có pattern XHR (0 hit — red-team #20) — port từ `apps/student/src/lib/repos/quiz.ts:216-260` (`uploadQuizMedia` + progress callback), thích nghi auth teacher; KHÔNG thay bằng fetch (mất progress).
- `transcript` lấy từ **prompt join** (`loadAttemptForReview` header :1666-1696), KHÔNG phải questionsSnapshot; `explanation` từ snapshot (đã forward ở Phase 1) + **fallback đọc prompt hiện hành cho attempt start trước deploy**.
- Play-once iOS: `play()` trực tiếp trong click handler (catch NotAllowedError → hiện lại nút); bắt `seeking` rollback `currentTime` về maxReached; `ended` → disable. Luyện tập: `<audio controls>`.
- Endpoint audio student: nằm trong studentRoutes closure + đăng ký `requireStudent` (red-team #6).
- Review fallback: đề không có explanation giữ hành vi cũ (note cho mọi câu) — không regress #305 speaking.

## Requirements

- [ ] Teacher upload MP3 khi tạo đề (MIME audio allowlist, ≤50MB, progress, CAS); đề listening không audio vẫn hợp lệ.
- [ ] Student nghe được khi làm bài (blob fetch org header); gate attempt khi timeLimit (pre-start 404, log GET).
- [ ] Chế độ thi: play-once honor-policy (1 lần/play state persist localStorage, chặn seek UI); luyện: tự do.
- [ ] Transcript ở summary/detail sau nộp (listening có transcript).
- [ ] Explanation per question ở review detail (snapshot + fallback prompt); fallback note cũ khi rỗng.

## Architecture

```
Teacher (create editor): chọn file → XHR PUT /api/assignments/prompts/:id/audio
  → media-store.put(prompt/{orgId}/{promptId}/{hash}) → CAS update audio_key (+audio_name) → delete key cũ
Student: GET /student/quizzes/:assignmentId/audio (requireStudent + enrollment + attempt-gate khi timeLimit + log)
  → stream media-store.get
Take: audioAvailable && skill=listening → <ListeningAudioPlayer examMode={timeLimit != null}/>
  play-state mirror: quiz-audio:{attemptId} {playedAt, maxReached}
Review: detail payload transcript (prompt join) + questions[].explanation (snapshot, fallback prompt)
```

## Files to Create / Modify

- Create: `apps/server/src/routes/assignments/audio.ts` (PUT + DELETE `/prompts/:id/audio`; mount `assignments/index.ts`)
- Modify: `apps/server/src/routes/student.ts` (GET `/quizzes/:assignmentId/audio` + đăng ký use()/requireStudent; detail transcript/explanation nếu Phase 1 chưa xong)
- Modify: `apps/web/src/components/assignments/prompt-composer.tsx` (:203-244 picker → upload thật port XHR từ student quiz.ts:216-260; :265-277 help text transcript "Hiện cho học viên sau khi nộp")
- Modify: `apps/web/src/components/assignments/question-key-editor.tsx` (textarea "Giải thích (hiện sau khi nộp)")
- Create: `apps/student/src/components/quiz/listening-audio-player.tsx` (+ pure logic one-shot tách test)
- Modify: `apps/student/src/lib/repos/quiz.ts` (`fetchQuizAudioObjectUrl` + revoke cleanup theo pattern quiz-media-player.tsx:40,57)
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx` (render player)
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` + `$attemptId.detail.tsx` (transcript block; detail truyền explanation per câu)
- Modify: `packages/ui/src/components/quiz/quiz-review-item.tsx` (prop `explanation`, disclosure "Giải thích")
- Test: `apps/student/test/listening-audio.test.ts` (one-shot pure), server test GET audio gate (pre-start 404, in_progress 200, submitted 200, log called).

## Implementation Steps

1. Server PUT/DELETE audio (teacher auth, MIME + `enforceDeclaredSize`, bodyLimit exempt pattern :600-633, CAS update, delete orphan best-effort).
2. Server GET audio student (requireStudent + enrollment như GET quiz :985; attempt-gate khi timeLimit; log {attemptId, ts}).
3. Web editor upload thật (port XHR progress; validate client MIME/size; nút xóa → DELETE; save audioName từ filename).
4. Student repo fetch blob + revoke; play-state mirror `quiz-audio:{attemptId}` (đọc khi mount player).
5. `ListeningAudioPlayer`: luyện = controls; thi = nút Play (gesture trực tiếp, catch NotAllowedError), seeking rollback maxReached, ended disable, label "Đã phát 1 lần".
6. Transcript render sau nộp (summary + detail, disclosure "Transcript").
7. Explanation: detail map từ snapshot; fallback prompt join cho attempt cũ; review-item ưu tiên explanation, fallback note cũ.
8. Tests + gate: `pnpm check`, `pnpm check-types`, `pnpm --filter student run test`, `pnpm --filter web run test`, `pnpm --filter server run test`.

## Todo

- [ ] Server PUT/DELETE audio CAS + GET student (gate attempt + log + requireStudent)
- [ ] Web editor upload XHR progress (port pattern student) + explanation textarea + help text
- [ ] ListeningAudioPlayer (play-state localStorage, one-shot thi / tự do luyện) + repo blob
- [ ] Transcript + explanation render sau nộp (fallback đúng thứ tự)
- [ ] Unit/server test + gate local

## Success Criteria

- Teacher upload MP3 1MB khi tạo đề → DB audio_key + blob trong store; GET quiz trả audioAvailable; xóa → null.
- GET audio: chưa start attempt (đề có timeLimit) → 404; in_progress → 200; sau nộp → 200; mỗi GET có log row.
- Chế độ thi: F5 giữ play-state (không phát lại lần 2), tua bị rollback, ended khóa nút; luyện: tua/phát lại tự do.
- Sau nộp: transcript hiện; "Giải thích" per câu đúng nội dung (đề mới qua POST start; attempt cũ có fallback prompt); đề cũ không explanation không đổi.
- Gate local pass.

## Risk Assessment

- iOS/Safari: play trong click handler bắt buộc — test tay iPhone nếu có, ghi PR.
- Teacher thay audio giữa attempt in_progress: học viên nghe file mới (live-link) — chấp nhận, ghi trong guide teacher không có (create-only đề).
- Upload fail giữa chừng: put xong mới CAS update DB — không bao giờ DB trỏ object chưa tồn tại; orphan blob nếu crash giữa put và update (dọn thủ công, log).
- Người dùng vượt honor-policy (DevTools/blob save): chấp nhận mức P1 — có log GET để audit.

## Security Considerations

- GET audio: enrollment + attempt-gate (đề thi) — không public; audio_key không xuống wire.
- MIME + size enforce server-side; log GET chặn lạm dụng audit.
- Transcript/explanation chỉ sau nộp.

## Next Steps

→ Phase 5 (History) độc lập; Phase 7 e2e cover (seed audio qua API teacher upload — không ghi đĩa).
