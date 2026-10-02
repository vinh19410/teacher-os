---
phase: 3
title: "UI màn nộp bài Speaking: đề, hướng dẫn, dropzone, player"
status: pending
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: UI màn nộp bài Speaking: đề, hướng dẫn, dropzone, player

## Goal
Học viên mở đề Speaking và thấy đúng câu hỏi/cue card cùng hướng dẫn. Học viên kéo-thả hoặc bấm chọn một file audio/video, xem tiến trình upload, nghe/xem lại, thay hoặc xoá file, và chỉ bấm "Nộp bài" được khi đã có file.

## Bố cục màn hình (cột 720px, giống take screen hiện tại)

```
┌ QuizRuntimeHeader: tiêu đề đề ·································· [Nộp bài] ┐
│                                                     (disabled khi chưa có file) │
├──────────────────────────────────────────────────────────────────────────────┤
│ SPEAKING · BAND 6.5                                  ← eyebrow (QuizPaper)     │
│ [intro của giáo viên — RichTextBody, text-muted-fg]  ← "hướng dẫn" của GV      │
│ Part 2: cue card "Describe … / You should say: • … • …"                         │
│ Part 1/3: danh sách câu hỏi (prompt RichTextBody)                              │
│                                                                                │
│ ┌ Hướng dẫn làm bài ─────────────────────────────────────────────────────────┐ │
│ │ • Hướng dẫn chuẩn theo part (bảng ở 3.4)                                    │ │
│ │ • Ghi âm hoặc quay video câu trả lời, rồi tải lên 1 file.                   │ │
│ │ • MP3, M4A, WAV, WEBM, OGG, MP4, MOV · tối đa 50 MB · video nên quay 720p.  │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ BÀI NÓI CỦA BẠN                                                                │
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│ ╎        ⤒  Kéo thả file vào đây hoặc  [Chọn file]                          ╎ │
│ ╎        Audio hoặc video · tối đa 50 MB                                    ╎ │
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│   kéo file qua: viền liền accent-blue + nền accent-blue/5, chữ "Thả để tải lên"│
│   đang tải: [♪ part2.m4a · 12,4 MB ▓▓▓▓▓░░░ 62%]            [Hủy]              │
│   xong:     [♪ part2.m4a · 12,4 MB · Đã tải lên 12:40]   [Thay file] [Xoá]     │
│             <audio controls> hoặc <video controls> preview                     │
│   lỗi:      [⚠ Không tải lên được — kiểm tra kết nối]    [Thử lại]             │
│ Hint dưới panel khi chưa có file: "Tải file bài nói lên để nộp bài."          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Bối cảnh
- `packages/ui/src/components/quiz/quiz-paper.tsx:178-195`: nhánh `skill === "speaking"` luôn render cue card. `prompt` bị loại khỏi Speaking. `intro` chỉ render cho đề auto. Empty-state ở `:255`.
- `packages/ui/src/components/attachment.tsx`: `Attachment` (state `idle | uploading | processing | error | done`), `AttachmentMedia`, `AttachmentContent`, `AttachmentTitle`, `AttachmentDescription`, `AttachmentActions`, `AttachmentAction`. Hiện chưa ai dùng. Token `card`, `muted`, `destructive` đã map sang `bg`, `surface`, `danger` (`globals.css:166-178`).
- Route take: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`. Gồm gate card (`:243-291`), `QuizRuntimeHeader` có `submitDisabled`, `QuizNavigator` (`:295`), submit mutation drain-before-submit (`:158`). Sau #304 route đã có nhánh `isWriting`.
- Repo: `apps/student/src/lib/repos/quiz.ts`, gồm `request()`, `HttpError`, và `getStudentHeaders()` (thêm `x-student-org-id`).
- Icon: `lucide-react`.

## Files to Create / Modify
- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Create: `packages/ui/src/components/quiz/media-dropzone.tsx`, `packages/ui/src/components/quiz/quiz-speaking-footer.tsx` <!-- Updated: Red Team 2026-10-02 -->
- Create: `apps/student/src/components/quiz/speaking-submission-panel.tsx`
- Create: `apps/student/src/components/quiz/quiz-media-player.tsx`
- Modify: `apps/student/src/lib/repos/quiz.ts`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Create: `apps/student/test/media-dropzone.test.tsx`, `apps/student/test/speaking-submission-panel.test.tsx`

## Tasks & Steps

### 3.1 `QuizPaper`: render đúng đề Speaking (không đổi API)
- [ ] Thay nhánh Speaking. Chỉ render cue card khi `detail.cueTopic.trim() !== ""`. Có `cuePoints` thì mới render "You should say:" + list.
- [ ] Đổi điều kiện prompt từ `!isAuto && skill !== "speaking"` thành `!isAuto`, để Part 1/3 hiện câu hỏi. Part 2 có prompt (giáo viên có thể ghi thêm) thì hiện dưới cue card.
- [ ] Speaking có `intro` không rỗng thì render `RichTextBody` intro với `text-muted-fg text-sm` ngay dưới eyebrow (hướng dẫn của giáo viên).
- [ ] Ẩn empty-state "không có câu hỏi tự chấm" khi `skill === "speaking"` (Writing đã được #304 ẩn).
- [ ] Test `quiz-paper.test.tsx`:
  - Part 2 (cueTopic + cuePoints): có "Describe a place…" và các bullet, không có empty-state.
  - Part 1 (prompt, cueTopic rỗng): có nội dung prompt, không có "Describe the topic".
  - Speaking có intro thì intro hiện ra.
  - Reading không đổi.

### 3.2 `MediaDropzone` (packages/ui, thuần trình bày)
- [ ] Validate dùng chung: thêm `validateQuizMediaFiles(files: ArrayLike<File>, maxBytes): { ok: true; file: File; type: string } | { ok: false; reason: "type" | "size" | "multiple"; file?: File }` vào `packages/api/src/lib/quiz-media.ts` (test ở `quiz-media.test.ts`). Dropzone và input ẩn "Thay file" đều gọi hàm này, nên chỉ có một đường validate. <!-- Updated: Red Team 2026-10-02 -->
- [ ] Props: `accept: string`, `maxBytes: number`, `disabled?: boolean`, `onFile(file: File, type: string): void`, `onReject(reason: "type" | "size" | "multiple", file?: File): void`, `hint?: ReactNode`.
- [ ] Cấu trúc: một `<div role="button" tabIndex={0}>`, `aria-describedby` trỏ vào hint, nhãn "Kéo thả file vào đây hoặc chọn file", kèm `<input type="file" hidden accept={accept}>`. Click hoặc Enter/Space mở input. `aria-disabled` khi `disabled`.
- [ ] Drag & drop:
  - `onDragEnter`/`onDragOver` gọi `preventDefault` và set `dragging` (đếm enter/leave để không nhấp nháy khi rê qua phần tử con).
  - `onDrop` lấy `dataTransfer.files`. Nhiều hơn 1 file → `onReject("multiple")`.
  - Validate bằng `validateQuizMediaFiles`, sau đó mới `onFile`. Validate y hệt cho input change. Reset `input.value` để chọn lại cùng file vẫn kích hoạt.
- [ ] Style:
  - Idle: `rounded-[var(--radius-lg)] border-2 border-dashed border-line bg-bg px-6 py-10 text-center`, hover `border-accent-blue/60`.
  - Dragging: `border-solid border-accent-blue bg-accent-blue/5`, chữ đổi thành "Thả để tải lên".
  - Focus ring: `focus-visible:outline-2 focus-visible:outline-accent-blue`.
  - Icon `UploadIcon` (lucide) `size-6 text-muted-fg`.
  - Nút giả "Chọn file" dùng style `Button variant="outline" size="sm"`, đặt trong vùng (không lồng `<button>` vào `role=button`, dùng `<span>` với class của button).
- [ ] Test `media-dropzone.test.tsx`:
  - Drop file `.m4a` hợp lệ → `onFile`.
  - Drop `.pdf` → `onReject("type")`.
  - File 51MB (`new File([], …)` kèm `Object.defineProperty(size)`) → `"size"`.
  - Drop 2 file → `"multiple"`.
  - Enter khi focus → click input.
  - `disabled` thì không gọi gì.

### 3.3 Repo
- [ ] `uploadQuizMedia(attemptId, file, type, { onProgress, signal }): Promise<QuizAttemptMedia>`:
  - Dùng `XMLHttpRequest`: `PUT ${getApiBaseUrl()}/api/student/attempts/:id/media`, `withCredentials = true`.
  - Headers lấy từ `getStudentHeaders({ "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) })`.
  - `xhr.upload.onprogress` gọi `onProgress(loaded / total)`. `signal` abort thì `xhr.abort()` và reject `DOMException("AbortError")`.
  - 2xx thì parse `z.object({ media: quizAttemptMediaSchema })`. Lỗi thì reject `HttpError(status, …, { code })` đọc từ JSON body. Lỗi mạng (`onerror`) thì reject `HttpError(0, …)`.
  - Comment giải thích vì sao dùng XHR mà không dùng `request()`: cần progress khi upload.
- [ ] `deleteQuizMedia(attemptId)` qua `request()` với method DELETE, không body (nên không có Content-Type).
- [ ] `fetchQuizMediaObjectUrl(attemptId): Promise<string>` dùng `fetch` + `credentials: "include"` + `getStudentHeaders({ Accept: "*/*" })`. Response có `content-type` (lowercase, bỏ `;params`) không thuộc `QUIZ_MEDIA_TYPES` thì throw, không tạo URL. Hợp lệ thì `URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }))` với type đã kiểm. <!-- Updated: Red Team 2026-10-02 --> Lỗi thì throw `HttpError`. Comment giải thích vì sao không dùng `<audio src>` trực tiếp: header `x-student-org-id` (Key Decision 9).

### 3.4 `SpeakingSubmissionPanel` (apps/student)
- [ ] Props: `assignmentId: string`, `attemptId: string`, `part: string`, `media: QuizAttemptMedia | null` (đọc từ cache query detail), `onUploadingChange(boolean)`, `disabled: boolean` (đang nộp hoặc store halted). <!-- Updated: Red Team 2026-10-02 -->
- [ ] **Một nguồn sự thật:** panel không giữ bản sao `media`. PUT/DELETE thành công thì gọi `queryClient.setQueryData(["student","quiz",assignmentId], d => ({ ...d, attempt: { ...d.attempt, media } }))`. Sau abort, lỗi mạng (status 0), `MEDIA_CONFLICT` thì `invalidateQueries` cùng key để render lại theo server.
- [ ] Card "Hướng dẫn làm bài" (`rounded-[var(--radius-lg)] border border-line bg-surface/50 p-4 text-sm`), heading mono eyebrow, các bullet:

  | part | Hướng dẫn chuẩn |
  |------|-----------------|
  | `part1` | "Trả lời lần lượt từng câu hỏi, mỗi câu khoảng 20–30 giây." |
  | `part2` | "Bạn có 1 phút chuẩn bị, sau đó nói liên tục 1–2 phút theo cue card." |
  | `part3` | "Trả lời mỗi câu khoảng 30–60 giây, nêu lý do và ví dụ." |
  | khác | (không có dòng này) |

  Thêm hai bullet cố định: "Ghi âm hoặc quay video câu trả lời bằng điện thoại/máy tính, rồi tải lên **1 file**." và "Định dạng: {nhãn từ `QUIZ_MEDIA_TYPES`, bỏ trùng} · tối đa 50 MB · video nên quay 720p để file nhẹ."
- [ ] Heading eyebrow "Bài nói của bạn" và state machine nội bộ: `idle | uploading { file, progress, controller } | processing { file } | error { file, message }`. File đã lưu đến từ prop `media`.
  - **Chưa có file, idle:** `MediaDropzone`. `onReject` (dùng chung cho dropzone và "Thay file") hiện lỗi inline `role="alert"` `text-danger text-sm` ngay dưới heading "Bài nói của bạn", ở mọi state:
    - type: "Định dạng không hỗ trợ. Hãy chọn file MP3, M4A, WAV, WEBM, OGG, MP4 hoặc MOV."
    - size: "File {formatMediaSize} vượt quá 50 MB. Hãy cắt ngắn hoặc quay lại ở 720p."
    - multiple: "Chỉ tải lên 1 file."
  - **Uploading:** `Attachment state="uploading"` gồm icon `MusicIcon` hoặc `VideoIcon`, tên file, `formatMediaSize`, thanh tiến trình (`<div role="progressbar" aria-valuenow>` cao 4px `bg-accent-blue` trên `bg-line`), "% đã tải", và `AttachmentAction` "Hủy" (abort). Khi `progress >= 1` (byte cuối đã gửi) chuyển sang `processing`: `Attachment state="processing"`, chữ "Đang xử lý…", **ẩn nút Hủy** vì server có thể đang commit. Gọi `onUploadingChange(true/false)` (true suốt uploading + processing). <!-- Updated: Red Team 2026-10-02 --> Thông báo `aria-live="polite"` khi hoàn tất: "Đã tải lên {name}".
  - **Thành công:** `setQueryData` như trên. Giữ `localPreviewUrl = URL.createObjectURL(file)` để preview ngay, revoke khi đổi file hoặc unmount.
  - **Đã có file** (`media !== null`): `Attachment state="done"` hiện tên, dung lượng, "Đã tải lên {formatVietnamSubmittedAt(media.uploadedAt)}" (helper có sẵn ở `apps/student/src/lib/attempt-format.ts:31`). Actions:
    - "Thay file": mở input ẩn, file mới đi qua `validateQuizMediaFiles` và upload. Server xoá object cũ. Bị từ chối thì hiện alert chung, file hiện tại giữ nguyên.
    - "Xoá": confirm nhẹ bằng `QuizDialog` có sẵn ("Xoá file bài nói?"), rồi `deleteQuizMedia` → `setQueryData(media: null)`.

    Bên dưới là `QuizMediaPlayer`.
  - **Lỗi upload:** `Attachment state="error"` + message. Message theo lỗi:
    - 413: "File vượt quá 50 MB."
    - 415: "Định dạng không hỗ trợ."
    - 409 `MEDIA_CONFLICT`: "File vừa được thay ở tab khác — đã tải lại." Kèm `invalidateQueries(["student","quiz",assignmentId])`; xong thì về state idle.
    - 409 `ATTEMPT_SUBMITTED`: chuyển sang summary.
    - 401: `reauth()`.
    - Mạng (status 0): "Không tải lên được — kiểm tra kết nối." Kèm `invalidateQueries`, vì server có thể đã commit.

    Actions: "Thử lại" (upload lại đúng file) và "Chọn file khác".
- [ ] `beforeunload` guard khi đang `uploading`.
- [ ] Toàn bộ action disable khi `disabled`.
- [ ] Test `speaking-submission-panel.test.tsx` (mock `@/lib/repos/quiz`):
  - Hiện bullet theo part2.
  - Chọn file thì `uploadQuizMedia` được gọi với type đã resolve, progress 50% hiện "50%", progress 100% thì hiện "Đang xử lý…" và không còn nút "Hủy", resolve thì cache query có `attempt.media` mới.
  - Upload reject 413 thì hiện message và nút "Thử lại".
  - `media` có sẵn thì hiện tên file và "Thay file"/"Xoá"; xoá thì gọi `deleteQuizMedia` rồi cache có `attempt.media === null`.
  - "Thay file" với file `.pdf` hiện "Định dạng không hỗ trợ" và giữ file cũ.
  - Hủy thì abort được gọi và quay về dropzone.

### 3.5 `QuizMediaPlayer` (apps/student)
- [ ] Props: `media: QuizAttemptMedia`, `attemptId: string`, `localUrl?: string | null`.
- [ ] Có `localUrl` thì render player ngay. Không có thì hiện nút "Nghe lại bài nói" (video: "Xem lại bài nói"). Bấm thì `fetchQuizMediaObjectUrl`; đang tải hiện spinner `Loader`; lỗi hiện "Không tải được file. Thử lại". Revoke URL khi unmount.
- [ ] Player: `isVideoMediaType` → `<video controls playsInline preload="metadata" className="max-h-80 w-full rounded-md border border-line bg-fg/5">`, còn lại `<audio controls preload="metadata" className="w-full">`. Thêm `aria-label="Bài nói đã nộp"`.
- [ ] Bắt sự kiện `error` của thẻ media: hiện "Trình duyệt không phát được định dạng này." kèm link "Tải file về" (`<a href={url} download={media.name}>`). Hướng dẫn trong card: iPhone nên chọn Cài đặt → Camera → Định dạng → "Tương thích nhất". <!-- Updated: Red Team 2026-10-02 -->

### 3.6 Route take `$assignmentId.tsx`
- [ ] `const isSpeaking = detail?.skill === "speaking"`. `const media = attempt?.media ?? null`, derive trực tiếp từ cache query (không `useState` bản sao, không effect đồng bộ). State `uploading`. <!-- Updated: Red Team 2026-10-02 -->
- [ ] Gate card trước start: Speaking hiện "Bài nói · {PART_LABEL} · nộp 1 file audio/video (tối đa 50 MB) · Band X" thay cho "0 câu hỏi". `PART_LABEL` lấy từ `ASSIGNMENT_TEST_PRESETS.speaking.slots` theo `part`, part lạ thì bỏ.
- [ ] Sau start, Speaking: trong `<main>` render `QuizPaper` rồi `SpeakingSubmissionPanel` (assignmentId, attemptId, part, media, onUploadingChange=setUploading, disabled=submitMutation.isPending || halted). Thay `QuizNavigator` bằng `QuizSpeakingFooter` (`packages/ui`, cùng khuôn `QuizEssayFooter` của #304) mang `data-testid="navigator-progress"` để helper e2e `openPaper` dùng chung được; nội dung "Chưa tải file bài nói" / "Đã tải file bài nói". Header `saveState={null}` với Speaking (không có autosave text). <!-- Updated: Red Team 2026-10-02 -->
- [ ] `submitDisabled` thêm `|| (isSpeaking && (media === null || uploading))`. Dưới panel, khi `media === null`, có hint `text-muted-fg text-sm`: "Tải file bài nói lên để nộp bài."
- [ ] `handleSubmitClick` với Speaking đã tự gọi thẳng `submitMutation.mutate()` (`unansweredCount === 0`, `essayGuardOpen === false`), không cần sửa. `onError`: 400 `MEDIA_REQUIRED` thì toast "Bạn cần tải file bài nói lên trước khi nộp"; 409 `MEDIA_CONFLICT` thì toast "File bài nói vừa thay đổi — hãy thử nộp lại". Cả hai `invalidateQueries` detail. <!-- Updated: Red Team 2026-10-02 -->
- [ ] Không đổi nhánh Reading/Listening/Writing.

## Verification
- `pnpm --filter student test`: xanh (quiz-paper, media-dropzone, speaking-submission-panel và các test cũ).
- `pnpm --filter web test`: xanh, vì web import `QuizPaper` cho preview giáo viên.
- `pnpm check` + `pnpm check-types`: xanh.
- Thủ công: `pnpm dev` (alchemy dev có R2 local), đăng nhập học viên seed, mở một đề Speaking Part 2. Kéo-thả một file `.m4a` khoảng 5MB: tiến trình chạy đến 100%, player phát được. Reload: file vẫn hiện, "Nghe lại" phát được. Thay bằng `.mp4`: player đổi sang video. Xoá: nút Nộp bị disable. Upload lại rồi Nộp thì về summary.

## Risks
- Safari iOS: `File.type` của bản ghi Voice Memos là `audio/x-m4a` hoặc rỗng, nên `resolveQuizMediaType` phải xử lý (đã có test ở Phase 1). Video `.mov` từ iPhone thường > 50MB ở 4K/1080p; copy hướng dẫn "quay 720p" và message lỗi size giải quyết phần này.
- Bản ghi `.webm` của Chrome đôi khi không có duration, nên player hiện thời lượng vô hạn. Chỉ là hiển thị, chấp nhận được.
