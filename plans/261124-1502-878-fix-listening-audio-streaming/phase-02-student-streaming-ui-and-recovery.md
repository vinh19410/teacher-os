---
phase: 2
title: "Student Streaming UI & Error Recovery"
status: completed
priority: P0
effort: "1h"
dependencies: [1]
---

# Phase 2: Student Streaming UI & Error Recovery

## Goal

Chuyển màn làm bài (`QuizTakeView`) và màn xem lại bài làm (`AttemptDetailScreen`) của học viên sang phát audio Listening bằng direct streaming `<audio crossOrigin="use-credentials">` gắn ngay từ frame đầu (0ms, không chờ tải 100% file thành blob), có 1-shot diagnostic probe (`cache: "no-store"`, tách `disposed` khỏi `timedOut`, an toàn khi đổi org) tự chữa `401` / `403 STUDENT_ORG_MISMATCH`, có trạng thái lỗi `"Không tải được file nghe."` kèm nút `"Thử lại"`, và gia cố các lỗi phụ liên quan (`fetchPracticeAudioObjectUrl` timeout, `useQuizAudioObjectUrl` AbortError, `QuizTakeView` unmount effect deps).

## Files to Create / Modify

- Modify: `packages/ui/src/components/quiz/quiz-paper.tsx`
- Modify: `packages/ui/src/components/quiz/quiz-paper.test.tsx`
- Modify: `apps/student/src/lib/repos/quiz.ts`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
- Modify: `apps/student/test/quiz-paper.test.tsx`
- Modify: `apps/student/test/quiz-take-view.test.tsx`
- Create: `apps/student/test/quiz-audio.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết TDD tests (Red) cho `QuizPaper` audio error/retry & hook streaming URL học viên

<!-- Updated: Red Team Session 2026-11-24 - Thêm test cache:no-store probe, timeout tách disposed, đổi activeOrgId reset error & healedOrgId, MEDIA_ERR_ABORTED, onAuthError callback, timeout qua fetchPracticeAudioObjectUrl -->

- **Goal:** Có unit tests fail cho:
  1. `QuizPaper` truyền `crossOrigin`, bắt `onAudioError`, hiển thị `"Không tải được file nghe."` + nút `"Thử lại"` gọi `onAudioRetry`.
  2. Hook streaming `useQuizAudioStream`: trả `audioSrc` streaming URL ngay khi `source` hợp lệ (kèm `?org=` khi có active org), giữ `audioLoading: false`, không chờ `fetch().blob()`.
  3. Khi `onAudioError` kích hoạt:
     - Bỏ qua nếu `event?.currentTarget?.error?.code === 1` (`MEDIA_ERR_ABORTED`).
     - Probe `GET` tới URL sạch (không `?org=`/`?_r=`) với `cache: "no-store"`, `Range: bytes=0-0`, `credentials: "include"`, header `x-student-org-id`.
     - Nếu probe trả `401` → gọi `onAuthError` (mặc định `reauth()`), không bật `audioError`.
     - Nếu probe trả `403` với `code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL` → gọi `redirectToLoginForWrongRole()`, không bật `audioError`.
     - Nếu probe trả `403` với `code === STUDENT_ERROR_CODES.ORG_MISMATCH` và đã gửi `activeOrgId` → lưu `healedOrgId = activeOrgId`, gọi `clearActiveStudentOrgId()`, invalidate `["student", "orgs"]`, và tự retry 1 lần với URL không `?org=` (tối đa 1 lần cho org đó, không lặp vô hạn).
     - Nếu sau khi self-heal học viên đổi sang org mới (`org-2`), `audioSrc` lại gắn `?org=org-2` và `audioError` tự reset về `false`.
     - Nếu probe trả `404`/`500`, lỗi mạng, hoặc **timeout** (tách `timedOut` khỏi `disposed`) → đặt `audioError: true`, và gọi `retry()` hủy probe cũ + tăng `_r=` + xóa `audioError`.
  4. `fetchPracticeAudioObjectUrl` reject khi fetch vượt timeout, và `useQuizAudioObjectUrl` đặt `audioError: true` (không kẹt `audioLoading: true`) khi gặp external `AbortError` không xuất phát từ cleanup.
- **Target files and symbols:**
  - `packages/ui/src/components/quiz/quiz-paper.test.tsx`
  - `apps/student/test/quiz-audio.test.tsx` (tạo mới)
  - `apps/student/test/quiz-take-view.test.tsx`
- **Steps:**
  1. Trong `packages/ui/src/components/quiz/quiz-paper.test.tsx`, thêm tests cho `audioCrossOrigin`, `onAudioError`, `audioError` ưu tiên hiển thị alert `"Không tải được file nghe."` kèm nút `"Thử lại"` gọi `onAudioRetry` (ngay cả khi `audioSrc` khác `null`).
  2. Tạo `apps/student/test/quiz-audio.test.tsx` (`@vitest-environment jsdom`) kiểm tra `resolveQuizAudioUrl`, `useQuizAudioStream` (tất cả kịch bản trên), `fetchPracticeAudioObjectUrl` timeout, và `useQuizAudioObjectUrl` external `AbortError`.
- **Success criteria:** Các test mới fail đúng vì `QuizPaper` chưa có props mới và `useQuizAudioStream` chưa tồn tại.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx` và `pnpm --filter student exec vitest run test/quiz-audio.test.tsx` exit non-zero (assertion / import failure).

### Task 2.2 — Mở rộng `QuizPaper` với `audioCrossOrigin`, `onAudioError`, và `onAudioRetry`

- **Goal:** `QuizPaper` hỗ trợ direct streaming `<audio>`, giữ nguyên mặc định không set `crossOrigin` cho `apps/web` (`blob:` URL), và cung cấp nút `"Thử lại"` khi lỗi.
- **Target files and symbols:**
  - `packages/ui/src/components/quiz/quiz-paper.tsx` (`QuizPaper`)
- **Steps:**
  1. Thêm 3 prop optional vào `QuizPaper`:
     - `audioCrossOrigin?: "anonymous" | "use-credentials"`
     - `onAudioError?: (event: React.SyntheticEvent<HTMLAudioElement>) => void`
     - `onAudioRetry?: () => void`
  2. Trong nhánh `skill === "listening"` (`packages/ui/src/components/quiz/quiz-paper.tsx:717-739`):
     - Kiểm tra `audioError` **trước** `audioSrc` (vì direct streaming `<audio>` vẫn có `audioSrc` khác `null` sau khi fire `onError`):
       - Nếu `audioError`: render `<div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-danger text-sm"><span>Không tải được file nghe.</span>{onAudioRetry && <button type="button" onClick={onAudioRetry} ...>Thử lại</button>}</div>`.
       - Ngược lại nếu `audioSrc`: render `<audio controls preload="metadata" crossOrigin={audioCrossOrigin} src={audioSrc} aria-label="Bài nghe" className="w-full" data-testid="quiz-audio-player" onError={onAudioError} />`.
       - Ngược lại nếu `audioLoading || detail.hasAudio`: render `"Đang tải file nghe…"`.
       - Ngược lại: giữ fallback `🔊 {detail.audioName.trim() || "Chưa đính file nghe"}`.
- **Success criteria:** `packages/ui` tests và `apps/student/test/quiz-paper.test.tsx` pass hoàn toàn.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/components/quiz/quiz-paper.test.tsx && pnpm --filter student exec vitest run test/quiz-paper.test.tsx` exits 0 và toàn bộ tests pass.

### Task 2.3 — Xây dựng `resolveQuizAudioUrl` + `useQuizAudioStream` và gia cố `fetchStudentAudioObjectUrl` / `useQuizAudioObjectUrl`

<!-- Updated: Red Team Session 2026-11-24 - cache:no-store, tách disposed/timedOut + probeGenerationRef, healedOrgId, probeUrl sạch, onAuthError callback, MEDIA_ERR_ABORTED guard, import ACCOUNT_ERROR_CODES & reauth -->

- **Goal:** Học viên nhận direct streaming URL ngay lập tức, tự hồi phục `401` / `403 ORG_MISMATCH` an toàn qua 1-shot `no-store` probe khi `<audio>` lỗi, không rò rỉ org khi chuyển org, và không còn đường nào kẹt vĩnh viễn ở `"Đang tải file nghe…"`.
- **Target files and symbols:**
  - `apps/student/src/lib/repos/quiz.ts` (`resolveQuizAudioUrl`, `useQuizAudioStream`, `fetchStudentAudioObjectUrl`, `fetchAssignmentAudioObjectUrl`, `fetchPracticeAudioObjectUrl`, `useQuizAudioObjectUrl`)
- **Steps:**
  1. Bổ sung import `ACCOUNT_ERROR_CODES` từ `@teacher-os/api/contracts`, `reauth` từ `@/lib/query-client`, `subscribeActiveStudentOrg` từ `@/lib/student-org-storage`, và `useCallback`, `useRef`, `useSyncExternalStore` từ `react`.
  2. Export `resolveQuizAudioUrl(source: QuizTakeSource, options?: { orgId?: string | null; retryNonce?: number }): string`:
     - Base URL: `${getApiBaseUrl()}/api/student/assignments/${encodeURIComponent(source.id)}/audio` hoặc `${getApiBaseUrl()}/api/student/practice/${encodeURIComponent(source.testId)}/audio`.
     - Nếu `options?.orgId?.trim()`, gắn `org=<orgId>` vào `URLSearchParams`.
     - Nếu `options?.retryNonce && options.retryNonce > 0`, gắn `_r=${options.retryNonce}`.
  3. Export `useQuizAudioStream(source: QuizTakeSource | null, options?: { onAuthError?: () => void; probeTimeoutMs?: number })`:
     - Đọc `activeOrgId = useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, () => null)`.
     - Tách `sourceKind = source?.kind ?? null`, `sourceId = source === null ? null : quizTakeSourceId(source)`.
     - State: `audioError` (boolean), `retryNonce` (number), `healedOrgId` (`string | null`).
     - Tính `effectiveOrgId = activeOrgId && activeOrgId !== healedOrgId ? activeOrgId : null`.
     - Tính `audioSrc = sourceKind && sourceId ? resolveQuizAudioUrl(sourceKind === "assignment" ? { kind: "assignment", id: sourceId } : { kind: "practice", testId: sourceId }, { orgId: effectiveOrgId, retryNonce }) : null`.
     - Dùng `probeRef` giữ `{ controller: AbortController; generation: number; inFlightSrc: string | null }`.
     - `useEffect` theo `[sourceKind, sourceId, activeOrgId]`: hủy probe cũ (tăng `generation` + `controller.abort()`), đặt `audioError = false`, reset `retryNonce = 0`, và nếu `activeOrgId !== healedOrgId` (khi `activeOrgId` đổi sang org khác) thì xóa `healedOrgId` (trừ trường hợp `activeOrgId === null` ngay sau self-heal). Cleanup khi unmount cũng tăng `generation` và `abort()` probe đang bay.
     - Trong `onAudioError(event?: { currentTarget?: { error?: { code?: number } | null } })`:
       - Nếu `event?.currentTarget?.error?.code === 1` (`MEDIA_ERR_ABORTED`), bỏ qua.
       - Nếu `!sourceKind || !sourceId || !audioSrc || audioError`, bỏ qua.
       - Nếu `probeRef.current.inFlightSrc === audioSrc`, bỏ qua (chống trùng probe song song).
       - Hủy probe cũ (nếu có), tăng `generation`, đánh dấu `inFlightSrc = audioSrc`.
       - Dựng `probeUrl` là **URL sạch không có `?org=` hay `?_r=`** (`resolveQuizAudioUrl(reconstructedSource)`).
       - Tạo `controller = new AbortController()`, `let timedOut = false`, timer `timeoutMs = options?.probeTimeoutMs ?? 8_000` đặt `timedOut = true; controller.abort();` (clear trong `finally`).
       - Gọi `fetch(probeUrl, { method: "GET", credentials: "include", cache: "no-store", headers: getStudentHeaders({ Accept: "audio/*", Range: "bytes=0-0" }, effectiveOrgId), signal: controller.signal })`.
       - Sau `await`: kiểm `if (probeRef.current.generation !== myGeneration) { void res.body?.cancel().catch(() => {}); return; }`.
       - Nếu `res.status === 401`: `void res.body?.cancel().catch(() => {}); (options?.onAuthError ?? reauth)(); return;`.
       - Nếu `res.status === 403`: đọc `{ code } = await parseErrorBody(res)`:
         - Nếu `probeRef.current.generation !== myGeneration` return.
         - Nếu `code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL`: `redirectToLoginForWrongRole(); return;`.
         - Nếu `code === STUDENT_ERROR_CODES.ORG_MISMATCH && effectiveOrgId`:
           - Đặt `setHealedOrgId(effectiveOrgId)`.
           - Nếu `getActiveStudentOrgId() === effectiveOrgId`: gọi `clearActiveStudentOrgId()` và `void studentQueryClient.invalidateQueries({ queryKey: ["student", "orgs"], exact: true })`.
           - Tăng `setRetryNonce((n) => n + 1)`.
           - `return;` (không bật `audioError`).
       - Hủy body `void res.body?.cancel().catch(() => {})` và đặt `setAudioError(true)`.
       - Trong `catch`: nếu `probeRef.current.generation !== myGeneration` (unmount / đổi source / đổi org / retry) thì `return`; ngược lại (kể cả khi `timedOut === true`) đặt `setAudioError(true)`.
       - Trong `finally`: `clearTimeout(timerId)` và xóa `inFlightSrc` nếu vẫn là `myGeneration`.
     - Trong `retry()`: tăng `probeRef.current.generation`, hủy probe cũ nếu đang bay, đặt `setAudioError(false)`, `setRetryNonce((n) => n + 1)`.
     - Trả `{ audioSrc, audioLoading: false, audioError, onAudioError, retry }`.
  4. Gia cố `fetchStudentAudioObjectUrl` (gọi qua `fetchAssignmentAudioObjectUrl` / `fetchPracticeAudioObjectUrl`) và `useQuizAudioObjectUrl`:
     - Thêm optional `timeoutMs = 30_000` trong `fetchStudentAudioObjectUrl` bằng controller nội bộ nối với external `signal`, clear timer trong `finally`.
     - Trong `.catch()` của `useQuizAudioObjectUrl`: chỉ bỏ qua im lặng khi `controller.signal.aborted === true` (không bỏ qua external `AbortError` khi effect chưa cleanup!).
- **Success criteria:** `apps/student/test/quiz-audio.test.tsx` pass 100%.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-audio.test.tsx` exits 0 và toàn bộ tests pass.

### Task 2.4 — Đấu nối `useQuizAudioStream` vào `QuizTakeView` và `AttemptDetailScreen` + ổn định `useEffect` deps

<!-- Updated: Red Team Session 2026-11-24 - Truyền onAuthError từ QuizTakeView (halt/flush + authBanner trước reauth) và dựng QuizTakeSource từ primitive bên trong useEffect để pass Biome useExhaustiveDependencies -->

- **Goal:** Cả trang làm bài (take) và trang xem chi tiết kết quả (review detail) đều dùng direct streaming `<audio crossOrigin="use-credentials">` với error recovery + retry, và `QuizTakeView` không bị `invalidateQueries` thừa khi parent re-render.
- **Target files and symbols:**
  - `apps/student/src/components/quiz/quiz-take-view.tsx` (`QuizTakeView`)
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` (`AttemptDetailScreen`)
  - `apps/student/test/quiz-take-view.test.tsx`
- **Steps:**
  1. Trong `apps/student/src/components/quiz/quiz-take-view.tsx`:
     - Đổi `useQuizAudioObjectUrl` sang `useQuizAudioStream` và import `quizTakeSourceId`.
     - Gọi `useQuizAudioStream(detail?.hasAudio && attempt !== null ? source : null, { onAuthError: () => { storeRef.current?.halt("auth"); essayStoreRef.current?.halt("auth"); setAuthBanner(true); reauth(); } })`.
     - Truyền `audioCrossOrigin="use-credentials"`, `onAudioError={onAudioError}`, `onAudioRetry={retry}` vào cả 2 nhánh `<QuizPaper>` (split-pane và single-column).
     - Ổn định `useEffect` unmount ở dòng 375-381:
       ```ts
       const sourceKind = source.kind;
       const sourceId = quizTakeSourceId(source);
       useEffect(() => {
         const cleanupSource: QuizTakeSource =
           sourceKind === "assignment"
             ? { kind: "assignment", id: sourceId }
             : { kind: "practice", testId: sourceId };
         return () => {
           void queryClient.invalidateQueries({
             queryKey: quizDetailQueryKey(cleanupSource),
           });
         };
       }, [sourceKind, sourceId, queryClient]);
       ```
  2. Trong `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`:
     - Đổi `useQuizAudioObjectUrl(audioSource)` sang `useQuizAudioStream(audioSource)`.
     - Truyền `audioCrossOrigin="use-credentials"`, `onAudioError={onAudioError}`, `onAudioRetry={retry}` vào cả 2 nhánh `<QuizPaper>`.
  3. Trong `apps/student/test/quiz-take-view.test.tsx`:
     - Cập nhật mock `@/lib/repos/quiz` sang `useQuizAudioStream` + `quizTakeSourceId`, kiểm tra `QuizTakeView` gọi `useQuizAudioStream` với `{ kind: "practice", testId: "test-listen-1" }` và không gọi `invalidateQueries` khi parent re-render cùng `source` value.
- **Success criteria:** Toàn bộ tests trong `apps/student/test/quiz-take-view.test.tsx`, `apps/student/test/quiz-audio.test.tsx`, và `apps/student/test/quiz-paper.test.tsx` pass.
- **Verify:** `pnpm --filter student exec vitest run test/quiz-take-view.test.tsx test/quiz-audio.test.tsx test/quiz-paper.test.tsx` exits 0 và toàn bộ tests pass.

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
