---
title: "Phase 3: Library API + Clone + Audio"
status: completed
priority: P1
effort: 10h
dependencies: ["phase-01"]
---

# Phase 3: Library API + Clone + Audio

## Overview

Sub-router library mới mount vào kernel (browse 3 endpoint đọc toàn cục + 1 endpoint clone org-scoped), nhánh proxy audio remote trong route audio student, và lan truyền `hasAudio` qua contract session card để minigame `listeningChoice` eligible cho từ clone. Sau phase này, teacher có thể clone bài từ thư viện về lớp và học sinh học được trọn vẹn flow SRS cũ kèm audio.

## Context Links

- Scout report mục 2 (API hiện trạng), mục 3 (precedent clone), mục 5 (quyết định 2/4/6).
- Mount precedent: `apps/server/src/routes/kernel.ts:2109` — `kernel.route("/kernel/vocab", vocabTeacherRoutes(deps))`; import :85.
- Clone precedent: `buildImportBatch` (`kernel.ts:236-300`) — sinh UUID trước, 1 `db.batch`; `MAX_IMPORT_NODES = 500` (`kernel.ts:227`) vì "would brick one D1 batch"; duplicate check 409 (`kernel.ts:787`); class org-guard `findClass(db, classId, ctx.orgId)` (`kernel.ts:782`).
- Org-scoping pattern: `kernelCtx = {orgId, userId}` từ `bootstrapMiddleware` (`apps/server/src/app.ts:83-141`); mọi query vocab filter `eq(vocabDeck.orgId, ctx.orgId)` (`vocab-teacher.ts:80`).
- Route audio student: `apps/server/src/routes/vocab.ts:625-676` (enrollment join :640-647, `audioKey` null → 404 :658-663, `mediaObjectResponse` :672-675). Helper stream: `apps/server/src/lib/media-response.ts:32` (headers nosniff + CSP sandbox + Cache-Control no-store cứng).
- Cards construction sites (phải set `hasAudio`): `vocab-provision.ts:138-151`, `vocab.ts:93-107` (loadOwnedSessionCard), `vocab.ts:492-506` (answer), `vocab.ts:608-622` (learn-commit).
- Eligibility engine: `packages/api/src/srs/quiz-generator.ts:192-196` (`audioKey !== null && trim > 0`), `toQuizCandidate` :55-73, `QuizCandidate` :19-31; Learn listen-step đọc qua `eligibleKinds` (`learn-session.ts:72-73`) nên chỉ sửa một chỗ.
- Client audio: `apps/student/src/lib/repos/vocab.ts:95-113` fetch bằng `wordId` (không dùng giá trị `audioKey`) → proxy server-side trong suốt với client; intro-audio gate `apps/student/src/components/vocab/vocab-session-view.tsx:575,595`.
- Giới hạn media: `QUIZ_MEDIA_MAX_BYTES = 50MB` (`contracts.ts:1686`).

## Key Insights

- **Router riêng `vocab-library.ts` thay vì nhét vào `vocab-teacher.ts`**: concern khác (browse global + clone) so với CRUD org-scoped; tránh làm phình file 470 dòng đã có, và Phase 4 không đụng file server nào.
- **Per-route 401 là bắt buộc**: `bootstrapMiddleware` cho request chưa đăng nhập đi thẳng (`app.ts:97-99` — comment "unauthenticated: kernel routes answer 401"), tức mỗi handler tự guard `if (!ctx) return 401` (pattern `vocab-teacher.ts:80-83`). Mọi route library — kể cả 3 GET — mở đầu bằng guard này; thiếu một route = phơi 10.160 từ + câu của bên thứ ba ra không cần đăng nhập. <!-- Updated: Red Team Session 1 - per-route 401 -->
- **Snapshot KHÔNG chứa thư viện** (chỉ thêm `sourceLibraryDeckId` vào `vocabDecks` có sẵn, map tại `snapshot.ts:590-597`): catalog 968 deck là payload org-agnostic lớn; dialog browse fetch live mỗi lần mở — precedent "words per-deck, không vào snapshot" (`vocab-deck-editor.tsx:11-13`).
- **Cap clone = TỔNG statements ≤ 500 (decks + từ), kèm cap phụ 50 decks**: precedent `MAX_IMPORT_NODES = 500` đếm **tổng** node ("would brick one D1 batch", `kernel.ts:227`) — cap rời 50 decks + 500 từ cho phép 50+500 = 550 statements, tự vượt precedent mình dẫn; median 10 từ/deck nên 50 deck median đã ~550. Công thức chốt: `decks + words > 500` → 422 (vẫn giữ `decks > 50` → 422). `deckIds` dedupe bằng `new Set` trước select; payload có id trùng → 400 `LIBRARY_CLONE_DUPLICATE_DECK`. Course 130 decks → UI hướng dẫn clone theo lượt (Phase 4); server vẫn atomic per request. <!-- Updated: Red Team Session 1 - cap tổng statements -->
- **Clone dùng UUID mới, KHÔNG giữ id library**: deck/word clone là dữ liệu org, id phải không xung đột; tham chiếu ngược qua `sourceLibraryDeckId`. Re-clone cùng một bài là hành vi hợp lệ (tạo bản sao thứ hai) — nhưng server **trả `duplicates: string[]`** (select `vocab_deck` theo `classId + sourceLibraryDeckId inArray` trước batch, rẻ) để dialog cảnh báo hậu-hợp không phụ thuộc snapshot có thể stale khi 2 giáo viên cùng org mở dialog song song. <!-- Updated: Red Team Session 1 - duplicates server-side -->
- **Proxy remote audio, không cho client tải trực tiếp**: một origin (không CORS/mixed-content), kiểm soát enrollment check như audio R2, client đổi 0 dòng (`fetchVocabAudioObjectUrl` chỉ truyền `wordId`). **CDN mochidemy đang 301 redirect cross-host NGAY HÔM NAY** (verify curl 2026-10-18: `mochien3.1-api.mochidemy.com/...teacher.mp3` → 301 → `mochien-server.mochidemy.com/...` → 200 `audio/mpeg`; response đầu là `text/html`) — nên fetch PHẢI `redirect: "follow"` tường minh và content-type validate trên **response cuối**, kèm `AbortSignal.timeout(~10s)`, allowlist host cho URL gốc, cap byte riêng ~5MB, và `Cache-Control: private, max-age=86400` (không dùng `mediaObjectResponse` — helper đó hardcode `no-store` cho nội dung R2 org-private, không hợp audio tĩnh public). <!-- Updated: Red Team Session 1 - redirect/allowlist/cache -->
- **`hasAudio` do server tính** (`audioKey != null || audioUrl != null`): wire không thêm `audioUrl` vào session card (client không bao giờ dùng giá trị); eligibility sửa 1 điều kiện (`quiz-generator.ts:192-196`) là cả Learn lẫn Review hưởng.
- **Audio hỏng không được phạt SRS**: Learn ưu tiên `listeningChoice` trước `meaningChoice` (`learn-session.ts:70-77`) và 100% từ library có audio → CDN chết thì học sinh bị ép trả lời câu nghe không nghe được, bấm "không nhớ" = grade again → méo lapses/dueAt vì lỗi hạ tầng bên thứ ba. Mitigation client: khi `audioError`, `prompt-listening-choice.tsx` hiện nút "Bỏ qua" dispatch skip — KHÔNG commit answer, không đụng SRS state. <!-- Updated: Red Team Session 1 - skip không phạt -->

## Requirements

- [x] Mọi route library mở đầu `const ctx = c.get("kernelCtx"); if (!ctx) return 401` (pattern `vocab-teacher.ts:80-83`) — test unauthenticated → 401 cho cả 4 endpoint.
- [x] GET `/api/kernel/vocab-library/courses` trả đủ 20 courses + `deckCount` (aggregate), sort `sortOrder`.
- [x] GET `/api/kernel/vocab-library/courses/:courseId/decks` trả decks + `wordCount`, 404 khi course không tồn tại.
- [x] GET `/api/kernel/vocab-library/decks/:deckId/words?limit=&offset=` preview capped (default 20, max 50), 404 khi deck không tồn tại.
- [x] POST `/api/kernel/vocab-library/clone`: org-guard `classId`, dedupe `deckIds` (trùng → 400 `LIBRARY_CLONE_DUPLICATE_DECK`), cap **tổng `decks + words > 500` hoặc `decks > 50`** → 422 `LIBRARY_CLONE_TOO_LARGE`, 1 `db.batch` tạo `vocab_deck` (+`sourceLibraryDeckId`) + `vocab_word` (+`audioUrl`), trả `{ id: deckId đầu, updated: số deck, duplicates: string[] }` (các sourceLibraryDeckId đã có trong class) — envelope mở rộng additive, khớp pattern `repos/kernel.ts:391-397`.
- [x] Route audio student: **gate `if (!store) return 503` chỉ áp cho nhánh `audioKey`** (dời xuống trong nhánh đó — proxy không cần R2, phải chạy được khi store undefined); ưu tiên `audioKey`; rỗng thì proxy `audioUrl` (allowlist host `mochien3.1-api.mochidemy.com` cho URL gốc, https only, `redirect: "follow"`, content-type **response cuối** phải `audio/*`, `AbortSignal.timeout(10_000)`, cap `LIBRARY_AUDIO_MAX_BYTES` 5MB); trả `Cache-Control: private, max-age=86400` cho nhánh proxy (không dùng `mediaObjectResponse` no-store); cả hai rỗng → 404 `AUDIO_NOT_FOUND`.
- [x] `hasAudio` set đúng ở 4 construction sites; `quiz-generator.ts` eligibility OR `hasAudio`; client gate intro-audio cập nhật.
- [x] Student `prompt-listening-choice.tsx`: khi audio lỗi, nút "Bỏ qua" dispatch skip không commit answer (không phạt SRS vì CDN lỗi).
- [x] Teacher words route + `audioUrl` để word editor hiển thị đúng "Đã có audio" cho từ clone (`vocab-word-row.tsx:87` sẽ sửa ở Phase 4).

## Architecture

Endpoint table (sub-router `apps/server/src/routes/vocab-library.ts`, mount `kernel.route("/kernel/vocab-library", vocabLibraryRoutes(deps))` cạnh kernel.ts:2109):

| Method | Path | Auth/scope | Mục đích |
|---|---|---|---|
| GET | `/courses` | kernel (mọi org — chủ đích) | list course + deckCount |
| GET | `/courses/:courseId/decks` | kernel (mọi org) | list deck + wordCount |
| GET | `/decks/:deckId/words` | kernel (mọi org) | preview từ capped |
| POST | `/clone` | kernel + org-guard trên `classId` | clone decks vào lớp caller |

Clone transaction sketch (theo `buildImportBatch`):

```ts
// mỗi route: const ctx = c.get("kernelCtx"); if (!ctx) return c.json({error:"unauthenticated"},401);
const uniqueDeckIds = [...new Set(body.deckIds)];
if (uniqueDeckIds.length !== body.deckIds.length)
  return c.json({ error: "LIBRARY_CLONE_DUPLICATE_DECK" }, 400);
const [cls] = await db.select().from(classTable)
  .where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId))).limit(1);
if (!cls) return c.json({ error: "class not found" }, 404);
const libDecks = await db.select().from(vocabLibraryDeck)
  .where(inArray(vocabLibraryDeck.id, uniqueDeckIds));
if (libDecks.length !== uniqueDeckIds.length) return 404 LIBRARY_DECK_NOT_FOUND;
const libWords = await db.select().from(vocabLibraryWord)
  .where(inArray(vocabLibraryWord.deckId, uniqueDeckIds));
if (libDecks.length > 50 || libDecks.length + libWords.length > 500) return 422 LIBRARY_CLONE_TOO_LARGE;
const existing = await db.select({ id: vocabDeck.sourceLibraryDeckId }).from(vocabDeck)
  .where(and(eq(vocabDeck.classId, classId),
    inArray(vocabDeck.sourceLibraryDeckId, uniqueDeckIds))); // duplicates[] cho dialog
// pre-generate ids, rồi MỘT batch:
await db.batch([
  ...libDecks.map(d => db.insert(vocabDeck).values({ id: crypto.randomUUID(),
    orgId: ctx.orgId, classId, title: d.title, lang: "en",
    sourceLibraryDeckId: d.id })),
  ...libWords.map(w => db.insert(vocabWord).values({ id: crypto.randomUUID(),
    deckId: deckIdMap.get(w.deckId), word: w.word, ipa: w.ipa,
    translation: w.translation, audioUrl: w.audioUrl, sortOrder: w.sortOrder })),
]);
return c.json({ id: firstDeckId, updated: libDecks.length,
  duplicates: existing.map(e => e.id) }, 201);
```

Audio fallback (`vocab.ts:625-676`): select thêm `audioUrl`; **dòng `if (!store) return 503` (:628-631) dời vào nhánh `audioKey`** — thiếu R2 binding là trạng thái deploy hợp lệ (`index.ts:85-90`) và proxy không cần R2. Nhánh `audioUrl` (chỉ khi `audioKey` rỗng): allowlist host URL gốc = `mochien3.1-api.mochidemy.com` + scheme `https:`; `fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) })` (CDN đang 301 cross-host — response đầu là `text/html`, chỉ response cuối mới `audio/mpeg`); `!ok` hoặc timeout → 404; `arrayBuffer` byteLength > `LIBRARY_AUDIO_MAX_BYTES` (5MB, const riêng — KHÔNG dùng `QUIZ_MEDIA_MAX_BYTES` 50MB vốn dành cho upload bài nói) → 404; content-type **của response cuối** phải `audio/*` (fallback `audio/mpeg`); trả Response riêng với headers nosniff + CSP sandbox tương đương `mediaObjectResponse` nhưng `Cache-Control: private, max-age=86400` (audio library bất biến theo wordId — không kế thừa `no-store` của nội dung R2 org-private); `mediaName: ${word}.mp3` (encode RFC 8187 đã có sẵn `media-response.ts:8-11`). Redirect target do bên thứ ba quyết định — chấp nhận có kiểm soát: GET-only, không credential đi kèm, cap byte, timeout; ghi comment invariant trong schema: `vocab_word.audioUrl` chỉ được ghi bởi clone library, không bao giờ nhận input teacher. <!-- Updated: Red Team Session 1 - redirect/allowlist/gate 503/cache -->

## Related Code Files

- Create: `apps/server/src/routes/vocab-library.ts`, `apps/server/src/routes/vocab-library.test.ts`.
- Modify: `apps/server/src/routes/kernel.ts` (import + mount), `apps/server/src/routes/vocab.ts` (audio fallback + `hasAudio` 3 sites), `apps/server/src/lib/vocab-provision.ts` (select `audioUrl` + `hasAudio`), `apps/server/src/routes/vocab-teacher.ts` (words route + `audioUrl`), `apps/server/src/routes/snapshot.ts` (map `sourceLibraryDeckId` :590-597), `packages/api/src/srs/quiz-generator.ts` (`QuizCandidate.hasAudio` + eligibility), apps student: `vocab-session-view.tsx` (:575, :595), `prompt-listening-choice.tsx` (nút "Bỏ qua" khi audio lỗi). `packages/api/src/contracts.ts` + `LIBRARY_AUDIO_MAX_BYTES` + `LIBRARY_CLONE_DUPLICATE_DECK` (error code Phase 1).
- Test modify: fixture `audioKey` cần thêm `hasAudio` — thực tế grep 2026-10-18: **4 sites trong 2 file student** (`vocab-session-view.e2e-loop.test.tsx:25,47`, `vocab-session-view.test.tsx` ×2) và **3 fixture builder trong packages/api sẽ vỡ compile khi output type bắt buộc field** (`learn-session.test.ts:37` `makeCard`, `quiz-generator.test.ts:12`, `review-session.test.ts:8,15,45` `makeCards`) — sửa 3 builder là phủ hết test packages/api; `pnpm check-types` chỉ đích danh chỗ còn sót, đừng tin con số grep sẵn trong plan. Cùng: `packages/api/src/vocab-contracts.test.ts`, `apps/server/src/routes/vocab.test.ts`, `apps/server/src/routes/vocab-teacher.test.ts`. <!-- Updated: Red Team Session 1 - fixture counts đúng -->

## Implementation Steps

1. Viết `vocab-library.ts` theo Endpoint table: mở đầu mỗi route bằng `if (!ctx) return 401`; `readBody` + error helpers copy pattern `vocab-teacher.ts:52-69`; 3 GET dùng aggregate `deckCount`/`wordCount` (join + group hoặc 2 query rồi map — chọn 2 query cho D1 rẻ); POST clone đúng sketch trên (dedupe → guard → cap tổng → duplicates → batch).
2. Mount trong `kernel.ts`: import cạnh :85, `kernel.route("/kernel/vocab-library", ...)` cạnh :2109 kèm comment giải thích read-global là chủ đích (và vẫn 401 khi không đăng nhập).
3. Sửa `vocab-provision.ts`: select thêm `audioUrl`, map `hasAudio: (row.audioKey ?? row.audioUrl) != null`; sửa 3 construction sites trong `vocab.ts` tương tự (loadOwnedSessionCard, answer, learn-commit).
4. Sửa nhánh audio `vocab.ts:625-676` theo Architecture: dời gate 503 vào nhánh `audioKey`, tách hàm `proxyRemoteAudio(c, word, audioUrl)` để test riêng (allowlist host, redirect follow, timeout, cap 5MB, content-type response cuối, Cache-Control max-age).
5. Sửa `quiz-generator.ts`: `QuizCandidate` + `hasAudio: boolean`, `toQuizCandidate` map `card.hasAudio === true`, điều kiện :192-196 thành `(card.audioKey !== null && card.audioKey.trim().length > 0) || card.hasAudio`; cập nhật docstring :168.
6. Sửa student `vocab-session-view.tsx`: :575 thành `if (!card.audioKey && !card.hasAudio)`, deps :595 thêm `card.hasAudio`; thêm nút "Bỏ qua" vào `prompt-listening-choice.tsx` khi `audioError` (dispatch skip, không commit answer).
7. Cập nhật `vocab-teacher.ts` words route + `audioUrl` (select :90-106 + map :108-118); `snapshot.ts` map :590-597 + `sourceLibraryDeckId: row.sourceLibraryDeckId ?? null`.
8. Viết `vocab-library.test.ts` (pattern `vocab-teacher.test.ts:1-24`): seed 2 org + library row nhỏ, cover từng requirement + unauthenticated 401 cho cả 4 route + dedupe 400 + cap tổng (50 deck 451 từ → 422) + `duplicates` trả đúng; mở rộng `vocab.test.ts` cho audio fallback: stub `fetch` global trả Response bytes; **case redirect** (fetch nhận URL gốc, stub trả `Response.redirect` tới URL khác rồi 200 audio/mpeg — assert content-type lấy từ response cuối); **case store undefined + audioUrl** (getMediaStore: () => undefined) → 200.
9. Cập nhật fixture theo danh sách Related Code Files (4 sites student + 3 builder packages/api; tin `pnpm check-types`), thêm unit case mới: `hasAudio=true, audioKey=null` → `listeningChoice` eligible; `hasAudio=false, audioKey=null` → không.
10. Chạy `pnpm --filter server test`, `pnpm --filter @teacher-os/api test`, `pnpm --filter student test`, `pnpm check-types`.

## Todo

- [x] Router library + mount + test (browse 3 + clone guard/cap/batch)
- [x] Audio fallback + proxy test với fetch stub
- [x] `hasAudio` end-to-end (contracts → server → engine → client gate)
- [x] Teacher words + snapshot thêm field mới

## Success Criteria

- `pnpm --filter server test` pass: clone org khác → 404; 51 decks HOẶC decks+từ > 500 → 422; deckIds trùng → 400; request không đăng nhập → 401 cho cả 4 route; clone xong `vocab_word.audio_url` có giá trị; deck clone xuất hiện trong snapshot với `sourceLibraryDeckId`; re-clone trả `duplicates` chứa id cũ.
- `pnpm --filter @teacher-os/api test` pass kèm case eligibility mới; vectors cũ không đổi (`git diff packages/api/src/srs/vectors/` rỗng).
- Student enroll mở deck clone: session-data trả `hasAudio: true` cho từ có audio; audio route trả 200 `audio/*` (fetch stub gồm case redirect 301 + case store undefined), 404 khi upstream 500; nhánh proxy có `Cache-Control: private, max-age=86400`.
- `pnpm --filter student test` pass với fixture đã cập nhật; case "Bỏ qua" khi audio lỗi không phát action answer.
- `pnpm check-types` sạch (fixture builder `makeCard*` đủ field).

## Risk Assessment

- **CDN mochidemy chậm/chặn request từ Worker prod** (likelihood trung, impact cao): nhánh nghe hiển thị "Không tải được âm thanh" + nút "Bỏ qua" (không commit answer) nên sự cố hạ tầng không méo SRS; timeout 10s + 404 sạch; `max-age=86400` giảm số lần đập CDN khi replay; phương án dài hạn mirror R2 ghi Open Questions plan.md. <!-- Updated: Red Team Session 1 - skip không phạt -->
- **Cap tổng 500 gây khó chịu với course 130 decks** (likelihood chắc chắn, impact thấp): accepted — atomicity per request quan trọng hơn; UI Phase 4 hướng dẫn chia lượt; nếu phản hồi xấu thì nâng qua tham số hằng số server, không đổi kiến trúc.
- **Buffer audio trong Worker vượt memory** (likelihood thấp, impact trung): cap riêng `LIBRARY_AUDIO_MAX_BYTES` 5MB (mp3 từ vựng thực tế ~100KB) + cache browser 24h giảm replay fetch; test case vượt cap → 404.
- **Sơ suất quên 1 trong 4 construction sites `hasAudio`** (likelihood trung, impact trung): type `VocabSessionCard` bắt buộc field (output type sau `.default()`) → `pnpm check-types` bắt hết tại compile time.

## Security Considerations

- **IDOR trên clone**: `classId` phải thuộc `ctx.orgId` (guard đầu tiên, trước mọi query library) — test riêng org B gởi class của org A. Endpoint đọc library toàn cục là chủ đích (nội dung công khai, không PII) nhưng **vẫn 401 khi không đăng nhập** — guard per-route bắt buộc (bootstrapMiddleware thả unauthenticated đi qua).
- **SSRF trên proxy audio**: `audioUrl` sống trong bảng org-owned `vocab_word` chứ không chỉ library — "server-controlled" chỉ đúng bắc cầu qua clone hôm nay. Controls: allowlist host cho URL gốc (100% CSV cùng một host — đã verify), scheme https, `redirect: "follow"` với target do CDN quyết định (chấp nhận có kiểm soát: GET-only, không credential, cap 5MB, timeout), comment invariant schema "audioUrl chỉ ghi bởi clone library — không bao giờ nhận input teacher/URL từ request"; nếu sau này mở teacher tự dán URL thì bắt buộc thêm allowlist/policy lại. <!-- Updated: Red Team Session 1 - SSRF controls -->
- Enrollment check của route audio giữ nguyên cho cả nhánh proxy (join :640-647 không bỏ).
- Không thêm secret; log không in URL audio đầy đủ nếu có query string (thực tế CDN URL không có credential nhưng phòng hưu).

## Next Steps

Phase 4 dùng các endpoint này cho dialog "Thêm từ thư viện"; Phase 5 viết e2e trên flow clone + audio fallback (e2e không đụng CDN thật — assert qua session-data/hasAudio, audio proxy đã có unit test stub).
