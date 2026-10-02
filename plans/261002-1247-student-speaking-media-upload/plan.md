---
title: "Quiz take: màn nộp bài Speaking — upload file audio/video (drag & drop)"
description: "Đề Speaking ở trang làm bài học viên hiển thị đúng câu hỏi/cue card và hướng dẫn, có vùng upload kéo-thả để nộp một file audio/video lưu trên R2, và màn kết quả phát lại bài đã nộp."
status: completed
priority: P1
effort: "15h"
issue: 305
branch: develop
tags: [feature, frontend, backend, database, infra, quiz]
blockedBy: [261002-1242-student-writing-essay-input]
blocks: []
created: 2026-10-02
---

# Quiz take: màn nộp bài Speaking — upload file audio/video

## Overview

Học viên mở một đề Speaking hiện chỉ thấy eyebrow "Speaking · Band X" và một cue card "Describe … You should say:". Part 1/Part 3 cũng thấy cue card này, trống, vì `QuizPaper` render cue card cho mọi part và không bao giờ render `prompt` của Speaking (`packages/ui/src/components/quiz/quiz-paper.tsx:178-195`). Cuối trang ghi "Đề này không có câu hỏi tự chấm…". Học viên không có cách nào nộp bài nói: bấm "Nộp bài" chỉ nộp một attempt rỗng.

Repo hiện chưa có chỗ lưu file. Chưa có R2 binding trong `packages/infra/alchemy.run.ts` và chưa có route upload nào.

Plan này làm màn nộp bài Speaking đầy đủ cho học viên:
- Đề hiển thị đúng theo part: câu hỏi Part 1/3 và cue card Part 2.
- Có hướng dẫn của giáo viên, hướng dẫn chuẩn theo part và hướng dẫn nộp file.
- Có vùng upload kéo-thả (hoặc bấm để chọn file) cho 1 file audio/video, tối đa 50MB, kèm thanh tiến trình, nghe/xem lại, thay file và xoá file.
- Nộp bị chặn khi chưa có file.
- Màn kết quả phát lại được bài đã nộp.

**Nền tảng:** plan này build trên plan Writing [`261002-1242-student-writing-essay-input`](../261002-1242-student-writing-essay-input/plan.md) (#304). Phải làm sau #304 (user chốt 2026-10-02) vì tái dùng các phần sau của #304:
- Header select `skill` trong `loadAttemptForReview`.
- Join `classAssignment → assignmentPrompt` để kiểm tra skill.
- Nhánh summary cho đề không tự chấm.
- Migration chạy sau 0031.

## Key Decisions

1. **Lưu file trên R2, upload stream qua Worker** (user chốt mức 50MB). Bucket mới `Cloudflare.R2.Bucket("media")` bind vào Worker server dưới tên `MEDIA`. Đã xác minh API qua `examples/cloudflare-worker-async/alchemy.run.ts` của alchemy và `BucketLocal` cho `alchemy dev`. Trình duyệt `PUT` raw body (không multipart). Worker kiểm `Content-Length` trước rồi chuyển thẳng `request.body` vào `bucket.put`, nên không buffer file trong RAM của Worker. 50MB nằm thoải mái dưới trần 100MB request body của Cloudflare (gói Free/Pro), và không cần R2 API token hay CORS cho bucket như cách presigned URL.
2. **Lớp `MediaStore` inject qua deps**, đúng precedent "every collaborator that touches Cloudflare bindings is injected" của `AppDeps` (`apps/server/src/app.ts:25-34`):
   - Interface gồm `put` / `get` / `delete`.
   - Production dùng `createR2MediaStore(env.MEDIA)`.
   - E2E boot dưới Node dùng `createFsMediaStore(dir)` lưu file thật xuống đĩa, giống cách e2e dùng libsql thay D1.
   - Unit test dùng store Map.
   - `getMediaStore` là optional trong deps và trả `MediaStore | undefined`. Thiếu dep hoặc thiếu binding `env.MEDIA` thì các route media trả 503, nên không phải sửa khoảng 15 file test đang gọi `buildApp`.
   - Interface `MediaStore` nằm trong `apps/server/src/lib/media-store.ts`, không tham chiếu type Cloudflare, và được re-export type từ `app.ts`. Adapter `createR2MediaStore` nằm riêng ở `r2-media-store.ts` và chỉ `index.ts` import, vì e2e (`types: ["node"]`) type-check `server/app` và không có `R2Bucket`. <!-- Updated: Red Team 2026-10-02 -->
   - Thêm dep optional `runInBackground?(p: Promise<unknown>)`. Production truyền `waitUntil`, theo precedent `index.ts` của auth. Các lệnh xoá object bù trừ chạy qua hook này để không bị huỷ khi client ngắt kết nối.
3. **1 file mỗi attempt** (user chốt). Lưu 5 cột nullable trên `quiz_attempt`: `media_key`, `media_name`, `media_type`, `media_size`, `media_uploaded_at`. Không tạo bảng mới. Mỗi lần upload sinh object key mới `quiz-media/{orgId}/{attemptId}/{uuid}`, nên thay file không bao giờ ghi đè object đang được DB trỏ tới.
4. **Ghi DB bằng CAS, không cần transaction** (D1 không có transaction, cùng precedent PATCH answer):
   - Upload object trước.
   - Sau đó `UPDATE … WHERE owner AND status='in_progress' AND media_key IS <key cũ>`.
   - 0 row thì xoá object vừa upload rồi trả 404 hoặc 409. 409 có `code` để client phân biệt "đã nộp" với "file vừa bị thay ở tab khác".
   - Thành công thì xoá object cũ (best-effort, chỉ log khi lỗi).
   - `store.put` hoặc CAS ném lỗi thì xoá object mới qua `runInBackground`. Byte thật lệch `Content-Length` thì 400: adapter R2 pipe qua `FixedLengthStream(size)`, store fs/memory tự đếm byte. <!-- Updated: Red Team 2026-10-02 -->
5. **Endpoints** (cùng router `/api/student`, ownership org + student là IDOR guard):
   - `PUT /attempts/:attemptId/media`: headers `Content-Type` thuộc allowlist, `Content-Length` ≤ 50MB, `X-File-Name` (đã encodeURIComponent). Trả `{ media }`. Chỉ đề `skill === "speaking"`. Attempt đã nộp thì 409.
   - `DELETE /attempts/:attemptId/media`: idempotent, chỉ khi `in_progress`.
   - `GET /attempts/:attemptId/media`: stream file cho chủ attempt ở mọi trạng thái, kèm `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-site` (ghi đè giá trị `cross-origin` global; có test khẳng định header cuối cùng). <!-- Updated: Red Team 2026-10-02 -->
6. **CSRF/guard:** `quizWriteGuard` hiện chỉ xử lý POST/PATCH và bắt JSON + bodyLimit 4096.
   - Mở rộng Origin check cho PUT/DELETE.
   - Chỉ `PUT`/`DELETE` khớp đúng path `/attempts/:id/media` mới bỏ qua bước JSON + bodyLimit; handler tự kiểm content-type và độ dài. POST/PATCH tới path nào kết thúc bằng `/media` vẫn bị guard JSON + bodyLimit. <!-- Updated: Red Team 2026-10-02 -->
   - Thêm `X-File-Name` vào `allowHeaders` của CORS.
   - Content-type audio/video vẫn kích hoạt preflight, nên không có lối form cross-site.
7. **Allowlist định dạng:** MP3, M4A/AAC, WAV, WEBM, OGG (audio), MP4, MOV, WEBM (video). Client chuẩn hoá MIME theo đuôi file khi `File.type` rỗng hoặc lạ (Windows hay báo `.m4a` là `audio/x-m4a` hoặc rỗng). Không sniff magic bytes: file chỉ phát lại cho chính học viên (và sau này giáo viên), luôn phục vụ với `nosniff` + CSP sandbox, nên file giả MIME không chạy được như HTML.
8. **Chặn nộp khi chưa có file** (user chốt), cả hai phía:
   - Client disable nút "Nộp bài" và ghi rõ lý do trong panel.
   - Server thêm predicate `media_key IS NOT NULL` vào chính câu UPDATE flip `submitted` khi đề là Speaking (atomic với DELETE song song). Thiếu file thì trả 400 `media required`.
   - Flip trượt thì re-read có `status`. Nhánh self-heal (stamp `submittedAt`) chỉ chạy khi `status === "submitted"`. Còn `in_progress` thì luôn trả lỗi: 400 `MEDIA_REQUIRED` khi chưa có key, 409 `MEDIA_CONFLICT` khi vừa có file ở tab khác (thử lại). <!-- Updated: Red Team 2026-10-02 -->
9. **Phát lại bằng blob, không dùng `<audio src>` trỏ thẳng API.** Học viên đa org cần header `x-student-org-id` (`apps/student/src/lib/repos/student.ts:29-41`) mà thẻ media không gửi được header. Thiếu header thì `requireStudent` rơi về org đầu tiên (`student.ts:522-530`), dẫn đến 404 sai. Vì vậy:
   - File vừa chọn: preview bằng `URL.createObjectURL(file)`, không tốn mạng.
   - File đã có trên server (resume, summary): bấm "Nghe lại" mới fetch blob, có revoke khi unmount.
   - Client chỉ nhận response có `content-type` thuộc `QUIZ_MEDIA_TYPES` và dựng `Blob` với đúng type đó. Không sniff magic bytes (KD7 giữ nguyên). <!-- Updated: Red Team 2026-10-02 -->
10. **Upload bằng `XMLHttpRequest`** để có `upload.onprogress` (fetch không có progress khi upload), hủy được giữa chừng, và có guard `beforeunload` khi đang upload.
11. **Màn hiển thị** (theo yêu cầu "câu hỏi, hướng dẫn, …"):
    - `QuizPaper` render theo dữ liệu, không đổi API: có `cueTopic` thì hiện cue card, có `prompt` thì hiện câu hỏi Part 1/3, có `intro` thì hiện hướng dẫn của giáo viên. Ẩn empty-state với Speaking.
    - Route take thêm card "Hướng dẫn làm bài": hướng dẫn chuẩn theo part, cách ghi âm, định dạng và dung lượng.
    - Bên dưới là panel nộp bài: dropzone, sau đó tiến trình, sau đó file đã tải lên kèm player, nút Thay file và nút Xoá.
    - Đề Speaking không render `QuizNavigator` (0 câu).
12. **Summary:** `quizAttemptSummarySchema` thêm `skill: z.string().optional()` và `media: quizAttemptMediaSchema.nullable().optional()`. Cả hai optional theo precedent `essay` của #304, để client mới vẫn parse được response của server cũ. Client rẽ nhánh Speaking khi `summary.skill === "speaking"`. <!-- Updated: Red Team 2026-10-02 --> Với Speaking, summary ẩn score card, link chi tiết và bảng đáp án, thay bằng "Bài nói của bạn" (tên file, dung lượng, nút "Nghe lại") và dòng "Giáo viên sẽ chấm bài nói của bạn." Attempt Speaking cũ đã nộp rỗng (trước feature này) thì hiện "Bài này được nộp khi chưa có file bài nói."

## Non-Goals

- Ghi âm trực tiếp trên trình duyệt (MediaRecorder). User chỉ yêu cầu upload; có thể làm follow-up.
- Giáo viên nghe/chấm bài nói đã nộp: phía teacher chưa có màn đọc `quiz_attempt`. Gộp vào issue follow-up "giáo viên chấm bài Writing/Speaking" của #304.
- Nhiều file mỗi bài, file > 50MB, presigned upload, transcode/nén video, giới hạn thời lượng.
- Dọn object R2 mồ côi khi `class_assignment` bị xoá (cascade DB không chạm R2). Ghi ở Risks, làm follow-up.
- Không đổi luồng Reading/Listening/Writing.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [R2 + MediaStore + contract + DB](./phase-01-storage-contract-db.md) | Done |
| 2 | [Endpoints media: upload / xoá / phát + chặn nộp rỗng](./phase-02-media-endpoints.md) | Done |
| 3 | [UI màn nộp bài Speaking: đề, hướng dẫn, dropzone, player](./phase-03-speaking-take-ui.md) | Done |
| 4 | [Màn kết quả Speaking + e2e + gate cuối](./phase-04-summary-e2e-gates.md) | Done |

Chạy tuần tự 1 → 2 → 3 → 4, sau khi #304 đã merge vào `develop`.

## Success Criteria

- [ ] Đề Speaking Part 1/3 hiện câu hỏi (`prompt`), Part 2 hiện cue card. Hướng dẫn của giáo viên (`intro`) và card "Hướng dẫn làm bài" đều hiện. Không còn dòng "không có câu hỏi tự chấm".
- [ ] Vùng upload nhận cả kéo-thả lẫn bấm chọn (bàn phím Enter/Space mở hộp chọn file). File sai định dạng hoặc > 50MB bị từ chối ngay ở client với thông báo rõ, không gửi request.
- [ ] Đang upload thì có thanh tiến trình % và nút Hủy. Xong thì hiện tên file, dung lượng và player audio/video. Thay file và Xoá đều hoạt động. Reload trang thì file đã tải lên vẫn hiện.
- [ ] Nút "Nộp bài" bị disable khi chưa có file hoặc đang upload. Server trả 400 `media required` nếu bị gọi thẳng.
- [ ] Sau khi nộp, summary hiện "Bài nói của bạn" và "Nghe lại" phát đúng file. Không còn score card 0/0.
- [ ] PUT media: 200 với chủ attempt; 404 với học viên/org khác; 409 khi đã nộp; 400 khi đề không phải Speaking, thiếu/sai tên file hoặc file rỗng; 411 khi thiếu Content-Length; 413 khi > 50MB; 415 khi sai MIME; 403 khi Origin lạ. GET media có `nosniff` + CSP sandbox.
- [ ] Reading/Listening/Writing không hồi quy. Các route quiz JSON vẫn giữ cap 4096 (hoặc 48KB cho `/essay` theo #304).
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter student test`, `pnpm --filter web test`, `pnpm --filter @teacher-os/infra check-types`, e2e `student-quiz-take-review` (ports 8100/8101/8103) đều xanh.

## Risks

- **Bật R2 trên tài khoản Cloudflare:** account phải kích hoạt R2 (free tier) trước khi `alchemy deploy` tạo bucket. Nếu chưa bật, deploy staging sẽ fail ở bước tạo bucket. Phải kiểm tra trước khi ship beta và ghi vào `docs/production-release-runbook.md`.
- **Cửa sổ deploy:** field mới của summary là optional, nên client mới + server cũ an toàn. Chiều bundle cũ + server mới vẫn throw "Unrecognized key" vì schema `.strict()`, cùng cửa sổ đã chấp nhận ở #304; reload là hết. Field `attempt.media` ở GET quiz nằm trong object con không strict nên an toàn. <!-- Updated: Red Team 2026-10-02 -->
- **Object mồ côi:** các nguồn còn lại là:
  - Worker bị huỷ giữa `put` và CAS, hoặc giữa CAS và lệnh xoá object cũ.
  - Lệnh xoá best-effort bị lỗi.
  - Cascade DB khi xoá lớp/lượt giao/học viên (hiện chưa có API hard-delete nào, nhưng FK cascade có sẵn).

  Lệnh xoá bù chạy qua `waitUntil` nên giảm mạnh ca client ngắt kết nối, nhưng không loại hết. Follow-up là **job đối chiếu**: list prefix `quiz-media/`, so với `quiz_attempt.media_key`, chỉ xoá key không được tham chiếu và cũ hơn N giờ. Không dùng lifecycle rule theo prefix vì nó sẽ xoá cả bài đã nộp. Không làm pending-key/rate-limit ở v1: chỉ học viên đã đăng nhập mới upload được, mỗi request tối đa 50MB. <!-- Updated: Red Team 2026-10-02 -->
- **Mạng yếu / file lớn:** 50MB trên 3G mất vài phút. Có progress, nút hủy và guard `beforeunload`, nhưng không resume upload dở. Chấp nhận ở v1.
- **Phát lại bằng blob:** "Nghe lại" phải tải hết file (tối đa 50MB) rồi mới phát, không seek trước khi tải xong. Chấp nhận ở v1, vì stream + Range đòi `requireStudent` nhận org qua query, tức là nới bề mặt auth (red-team #14, đã từ chối).
- **MOV/HEVC:** iPhone quay HEVC `.mov` mà Chrome/Firefox trên Windows có thể không phát được. Player bắt sự kiện `error`, hiện "Trình duyệt không phát được định dạng này" kèm link tải file; copy hướng dẫn gợi ý chọn "Tương thích nhất" trong Cài đặt Camera.
- **Deploy R2:** token `CLOUDFLARE_API_TOKEN` của CI (prod + staging) phải có quyền "Workers R2 Storage: Edit". `alchemy dev` cần tạo bucket local; Phase 1 phải chứng minh `pnpm dev` vẫn boot. <!-- Updated: Red Team 2026-10-02 -->
- **Migration:** chỉ `ALTER TABLE ADD COLUMN` nullable. Vẫn backup D1 trước khi apply ở môi trường thật (rule dự án).
- **Phiên bản alchemy:** repo dùng `alchemy@2.0.0-beta.72`, còn example được xác minh là `main` (beta.79). Phase 1 phải chạy `pnpm --filter @teacher-os/infra check-types` để xác nhận `Cloudflare.R2.Bucket` có sẵn ở beta.72. Nếu thiếu thì dừng lại hỏi user có nâng alchemy không.

## Dependencies

- Blocked by plan [`261002-1242-student-writing-essay-input`](../261002-1242-student-writing-essay-input/plan.md) ([vinh19410/teacher-os#304](https://github.com/vinh19410/teacher-os/issues/304)).
- Xây trên quiz take/review (#283), split-pane (#286), intro theo cụm (#301).
- Issue theo dõi: [vinh19410/teacher-os#305](https://github.com/vinh19410/teacher-os/issues/305).
- PR đích: `develop`. CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 4.

## Validation Log

### Session 1 — 2026-10-02 (trước khi soạn plan)
- Dung lượng tối đa: **50MB, stream qua Worker** (bỏ phương án 95MB và presigned 500MB).
- Số file: **1 file mỗi bài**, thay hoặc xoá được trước khi nộp.
- Nộp khi chưa có file: **chặn** ở cả client lẫn server.
- Thứ tự: **làm sau #304**, tái dùng các phần của #304.

### Verification Results
- Claims checked: 34
- Verified: 33 | Failed: 0 | Unverified: 1
- Tier: Standard (4 phases)
- Đã xác minh: các vị trí `quiz-paper.tsx:178-195,255`; `quizWriteGuard` (`student.ts:565-588`) chỉ áp POST/PATCH; `requireStudent` fallback org (`student.ts:519-527`); CORS `allowHeaders` (`app.ts:151`); `AppDeps` inject binding (`app.ts:25-34`); e2e boot `buildApp` + libsql (`apps/e2e/src/boot.ts`); `attachment.tsx` có các state; token shadcn đã map (`globals.css:166-178`); `formatVietnamSubmittedAt` (`attempt-format.ts:31`); `QuizDialog` đã export; `ASSIGNMENT_TEST_PRESETS.speaking`; script `db:generate` và `@teacher-os/infra check-types`; có `ffmpeg`; `Cloudflare.R2.Bucket` + bind qua `env` (alchemy `main`).
- Unverified: `Cloudflare.R2` có tồn tại ở `alchemy@2.0.0-beta.72` (repo pin) hay không. Hook chặn đọc `node_modules`, nên Phase 1 bước 1.1 sẽ kiểm bằng `check-types`; nếu thiếu thì dừng lại hỏi user.
- Đã sửa trong lúc verify: helper giờ upload, precedent log `console.error`, mục CHANGELOG `## 2026-10-02` chưa tồn tại (#304 hoặc plan này sẽ tạo).

### Session 2 — 2026-10-02 (sau red-team, trước implement)
- Đã verify lại bởi 3 reviewer red-team: tổng 101 claim, các claim FAILED đã sửa trong plan (anchor dòng sau #304, `openPaper` nằm ở spec, `getStudentHeaders` ở `repos/student.ts`, CHANGELOG `## 2026-10-02` đã có, helper #304 không tồn tại).
- Claim còn để ngỏ ở Session 1 đã xác minh: `Cloudflare.R2.Bucket` có ở `alchemy@2.0.0-beta.72` (`pnpm --filter @teacher-os/infra check-types` xanh với bucket `media` + binding `MEDIA`).
- Không có quyết định mới cần user: các thay đổi red-team đều nằm trong phạm vi đã chốt (50MB, 1 file, chặn nộp rỗng, định dạng giữ nguyên).
- Verification: Failed 0 sau khi sửa. Đủ điều kiện implement.

### Whole-Plan Consistency Sweep
- `plan.md` và 4 phase thống nhất ở các điểm: 50MB / `QUIZ_MEDIA_MAX_BYTES`; 1 file và 5 cột `media_*`; mã lỗi `ATTEMPT_SUBMITTED` / `MEDIA_CONFLICT` / `MEDIA_REQUIRED`; summary thêm `skill` + `media`; migration `0032`; phát lại bằng blob. Không còn mâu thuẫn.

## Implementation Notes (2026-10-02)

Lệch so với phase file, kèm lý do:
- **Test media server** đặt ở file riêng `apps/server/src/routes/student-quiz-media.test.ts` (seed + store Map riêng) thay vì mở rộng `student-quiz.test.ts` (đã hơn 1.000 dòng). Ca 401 cho PUT/DELETE/GET media cũng nằm ở file mới.
- **Test UI** không mock tương tác DOM: app student chạy vitest môi trường `node` với `renderToStaticMarkup`, không có testing-library, và repo không thêm dependency. Logic thuần (trạng thái tiến trình, ánh xạ lỗi, validate) có unit test; markup từng trạng thái panel có test tĩnh; tương tác thật (kéo-thả, Thay file, Xoá, Hủy) phủ bằng e2e.
- **Đếm byte thật** dùng chung `enforceDeclaredSize` (TransformStream) cho cả adapter R2, fs (e2e) và Map (test); adapter R2 nối thêm `FixedLengthStream`. Không map lỗi theo message của runtime.
- **CORP `same-site`** set bằng middleware riêng cho path media, đăng ký trước `secureHeaders` trong `app.ts`: test xác nhận `secureHeaders` ghi đè header set trong handler.
- **Lý do từ chối file rỗng** tách thành `empty` (thông điệp "File rỗng") thay vì gộp vào `size`.
- **PUT/DELETE** trên `/attempts/*` chỉ kiểm Origin (route media là route duy nhất dùng hai method này); POST/PATCH giữ guard JSON + bodyLimit, có test.
- **Chưa xác minh `alchemy dev` local**: port 8000/8001/8003 đang bị dev stack của phiên khác chiếm (`strictPort`). Ghi vào bước kiểm tra của người review.
- `ak plan update --issue` lỗi (CLI index của `ak` không chạy); liên kết plan ↔ issue nằm ở comment issue #305.

### Code review (2026-10-02)
- Hai reviewer độc lập (server, client): 0 Critical, 5 Important, 11 Minor; đã sửa toàn bộ trừ 2 mục ghi dưới.
- **Hướng dẫn của giáo viên lấy từ `note` (user chốt):** composer Speaking chỉ có ô "Hướng dẫn thêm" (`note`), không có ô `intro`. Take payload gửi `note` **chỉ với đề Speaking** (không có đáp án nên không lộ); Reading/Listening/Writing vẫn giữ kín `note` tới sau khi nộp. `intro` vẫn render cho dữ liệu cũ. Thay cho KD11 (intro).
- Part 2 có cue card thì không hiện `prompt` (composer ẩn ô câu hỏi ở Part 2 nhưng còn lưu prompt cũ khi đổi part).
- Guard: chỉ PUT/DELETE đúng path media bỏ qua JSON + bodyLimit (đúng red-team #8). DELETE song song idempotent. `filename*` theo RFC 8187.
- Client: `busyRef` chặn hộp "Leave site?" trên redirect 409/401; `useBlocker` hỏi trước khi rời take screen bằng điều hướng trong app khi đang tải; lỗi thay file vẫn hiện file đã lưu, ẩn "Thử lại" với lỗi không thử lại được; validate tên file ở client khớp server; thả file ra ngoài vùng tải không làm trình duyệt rời trang; trả focus sau upload/xoá; `cancelQueries` trước khi ghi cache; player hủy tải khi unmount và xử lý 401.
- Không làm: unit test `createR2MediaStore` (cần `FixedLengthStream` của Workers, Node không có) và thả file lên card media để thay (đã có nút "Thay file", thả ngoài vùng được chặn kèm hướng dẫn).

## Red Team Review

### Session — 2026-10-02
**Findings:** 15 (14 accepted, 1 rejected; user chọn "áp dụng như đề xuất")
**Severity breakdown:** 0 Critical, 6 High, 9 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Submit trượt vì thiếu media rơi vào self-heal, stamp `submittedAt` khi attempt còn `in_progress` | High | Accept | KD8, Phase 2 §2.6, §2.8 |
| 2 | `skill`/`media` required trên schema strict phá cửa sổ deploy | High | Accept | KD12, Risks, Phase 1 §1.5, Phase 4 §4.1 |
| 3 | e2e `openPaper` chờ `navigator-progress`, Speaking bỏ navigator | High | Accept | Phase 3 §3.6, Phase 4 §4.4 |
| 4 | `MediaStore` dùng `R2Bucket` trong module mà e2e type-check | High | Accept | KD2, Phase 1 §1.2–1.3 |
| 5 | Object mồ côi khi Worker bị huỷ hoặc D1 lỗi; `put` không try/catch | High | Accept (một phần: không pending-key/rate-limit) | KD2, KD4, Risks, Phase 2 §2.3, Phase 4 follow-up |
| 6 | State media client tách khỏi cache; Hủy ở 100% vẫn commit | High | Accept | Phase 3 §3.4, §3.6 |
| 7 | Tin `Content-Length` thay vì đếm byte thật | Medium | Accept | KD4, Phase 1 §1.2–1.3, Phase 2 §2.3, §2.8 |
| 8 | CORP global `cross-origin`; bypass `/media` quá rộng | Medium | Accept | KD5, KD6, Phase 2 §2.1, §2.5, §2.8 |
| 9 | Blob mất nosniff/CSP; tên file lọt ký tự `\p{Cf}` | Medium | Accept (không sniff magic bytes) | KD9, Phase 1 §1.5, Phase 3 §3.3 |
| 10 | Deploy/infra: token CI, thiếu binding → 500, kiểm cột, dev-url, `alchemy dev` | Medium | Accept | Risks, Phase 1 §1.2 + Verification, Phase 4 §4.5 |
| 11 | Không có test preflight CORS | Medium | Accept | Phase 2 §2.8 |
| 12 | MOV/HEVC không phát được, không có error state | Medium | Accept | Risks, Phase 3 §3.5 |
| 13 | Panel thiếu `assignmentId`; "Thay file" có đường validate riêng | Medium | Accept | Phase 3 §3.2, §3.4 |
| 14 | Blob playback tải hết 50MB mới phát | Medium | Reject: stream + Range cần nới auth `requireStudent` bằng query; ghi vào Risks | Risks |
| 15 | Anchor dòng lệch sau #304; không có helper để tái dùng | Medium | Accept | Phase 2 Bối cảnh, §2.2, §2.7 |

### Whole-Plan Consistency Sweep
- Delta:
  - Summary fields optional.
  - `MediaStore` tách interface/adapter; `getMediaStore` trả undefined → 503.
  - `runInBackground`, `FixedLengthStream`.
  - CORP same-site; bypass hẹp PUT/DELETE.
  - Self-heal chỉ khi `submitted`.
  - Media lấy từ cache React Query; footer Speaking mang `navigator-progress`.
  - Follow-up đổi từ lifecycle rule sang job đối chiếu.
  - CHANGELOG `## 2026-10-02` đã tồn tại.
- Rà `plan.md` + 4 phase cho các thuật ngữ cũ: `skill: z.string()` (required), "lifecycle rule", `header.skill`, "deploy cùng release", `useState(attempt?.media`, `onMediaChange`. Chỉ còn khớp ở câu phủ định có chủ đích (Risks, follow-up). Không còn mâu thuẫn; plan sẵn sàng implement.

<!-- slug: student-speaking-media-upload -->
