---
phase: 3
title: "Phase 3: Student Persistence Store & App Wiring"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Student Persistence Store & App Wiring

## Goal

Xây dựng theo TDD tầng lưu trữ `localStorage` riêng theo `attemptId` (kèm kiểm tra `passageHash`, chống poisoning, LRU 25 bài + evict khi `QuotaExceededError`, và dọn sạch khi đăng xuất/đổi tài khoản qua `syncActiveStudentUser`) tại `apps/student/src/lib/reading-annotations-store.ts`, sau đó nối prop `annotations` vào cả 3 caller của `QuizReadingSplitLayout`: Student Take (`QuizTakeView`), Student Review (`AttemptDetailScreen`), và Admin Preview (`TestPreviewOverlay`, keyed theo `tab.part`).

## Files to Create / Modify

- Create: `apps/student/src/lib/reading-annotations-store.ts`
- Create: `apps/student/src/lib/reading-annotations-store.test.ts`
- Modify: `apps/student/src/lib/student-org-storage.ts`
- Modify: `apps/student/src/components/quiz/quiz-take-view.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
- Modify: `apps/admin/src/components/library/test-preview-overlay.tsx`

## Tasks & Steps

### Task 3.1 — Write failing TDD unit tests for `reading-annotations-store.ts` and user-switch cleanup (Red Phase)
<!-- Updated: Red-Team RT-5, RT-6, RT-11, RT-12, RT-13 - jsdom pragma, poisoning/LRU/quota tests, syncActiveStudentUser clear test, no `--` -->
- **Goal**: Kiểm thử đầy đủ các nhánh đọc/ghi/xoá/hash-mismatch/poisoned JSON/LRU eviction/quota retry, đồng bộ dọn theo phiên đăng nhập, và React hook `useReadingAnnotationsStorage` trong môi trường jsdom.
- **Target files and symbols**: `apps/student/src/lib/reading-annotations-store.test.ts`.
- **Steps**:
  1. Tạo `apps/student/src/lib/reading-annotations-store.test.ts` với dòng 1 là `// @vitest-environment jsdom` và gọi `afterEach(cleanup)`.
  2. Viết test cases cho:
     - `readingAnnotationsStorageKey(attemptId)` trả đúng `"quiz-reading-annotations:<attemptId>"` (TÁCH BIỆT khỏi `"quiz-attempt:<attemptId>"`).
     - `loadReadingAnnotations(attemptId, passage, storage)`:
       - Trả `[]` khi key chưa tồn tại, JSON hỏng, chuỗi raw vượt `READING_ANNOTATIONS_MAX_BYTES` (256 KB), sai schema version, hoặc `passageHash` khác (giáo viên sửa bài đọc).
       - Chặn dữ liệu poisoned (`NaN`, float `1.5`, `id` chứa ký tự selector injection, `id: "__proto__"`).
       - Validate `end` theo độ dài `canonicalText` đã parse của HTML passage (ví dụ `<p>An là <strong>học sinh</strong> giỏi.</p>` dài 20 ký tự chứ KHÔNG theo độ dài HTML thô 43 ký tự).
       - **Invariant bất biến:** `loadReadingAnnotations` tuyệt đối không gọi `storage.setItem` hay `storage.removeItem` (ngay cả khi `passageHash` lệch).
       - Không ném lỗi khi `storage.getItem` throw (private mode/SecurityError).
     - `saveReadingAnnotations(attemptId, passage, items, storage)`:
       - Lưu payload `{ v: 1, passageHash, updatedAt, items }` khi `items.length > 0`.
       - Gọi `storage.removeItem(key)` khi `items.length === 0`.
       - LRU eviction: khi lưu quá `READING_ANNOTATIONS_MAX_STORED_ATTEMPTS` (25) key `quiz-reading-annotations:*`, tự xoá các key cũ nhất theo `updatedAt` mà KHÔNG đụng các key khác (`quiz-attempt:*`, `active_student_org_id`).
       - Khi `storage.setItem` ném `QuotaExceededError`, chủ động evict các key `quiz-reading-annotations:*` cũ nhất rồi thử ghi lại 1 lần; nếu vẫn lỗi thì nuốt an toàn không crash UI.
     - `clearAllReadingAnnotationsStorage(storage)` và tích hợp `syncActiveStudentUser`:
       - Xoá sạch toàn bộ key có prefix `quiz-reading-annotations:` mà giữ nguyên các key không liên quan (`theme`, v.v.).
       - Gọi `syncActiveStudentUser(null)` (đăng xuất) hoặc `syncActiveStudentUser("user-2")` khi trước đó là `"user-1"` sẽ tự động gọi dọn sạch toàn bộ `quiz-reading-annotations:*`.
     - `useReadingAnnotationsStorage(attemptId, passage)` (hook test `@testing-library/react`):
       - Khởi tạo **đồng bộ** từ `localStorage` ngay lượt render đầu (không nháy `[]` trên frame 1 khi reload).
       - Khi `attemptId` đổi từ `null` → `"att-1"` hoặc `passage` đổi từ `""` → HTML thật, tự nạp lại từ storage mà không ghi đè/xoá storage.
       - Khi `attemptId === null`, trả `[]` và không đọc/ghi storage.
- **Success criteria**: File test fail ở bước Red vì module `reading-annotations-store.ts` chưa tồn tại.
- **Verify**: `pnpm --filter student test src/lib/reading-annotations-store.test.ts` exits non-zero (module not found; passing test is a failure).

### Task 3.2 — Implement `reading-annotations-store.ts` and hook logout/account-switch cleanup (Green Phase)
<!-- Updated: Red-Team RT-5, RT-11, RT-12 -->
- **Goal**: Triển khai `apps/student/src/lib/reading-annotations-store.ts` nhẹ, thuần, chống poisoning, có LRU eviction + quota recovery, và nối dọn sạch vào `syncActiveStudentUser`.
- **Target files and symbols**:
  - Create: `apps/student/src/lib/reading-annotations-store.ts` (`READING_ANNOTATIONS_STORAGE_PREFIX`, `READING_ANNOTATIONS_MAX_BYTES`, `READING_ANNOTATIONS_MAX_STORED_ATTEMPTS`, `readingAnnotationsStorageKey`, `loadReadingAnnotations`, `saveReadingAnnotations`, `clearAllReadingAnnotationsStorage`, `useReadingAnnotationsStorage`)
  - Modify: `apps/student/src/lib/student-org-storage.ts` (`syncActiveStudentUser`)
- **Steps**:
  1. Export constants:
     - `READING_ANNOTATIONS_STORAGE_PREFIX = "quiz-reading-annotations:"`
     - `READING_ANNOTATIONS_MAX_BYTES = 262_144` (256 KB)
     - `READING_ANNOTATIONS_MAX_STORED_ATTEMPTS = 25`
  2. Export `readingAnnotationsStorageKey(attemptId: string): string` trả `` `${READING_ANNOTATIONS_STORAGE_PREFIX}${attemptId}` ``.
  3. Export `loadReadingAnnotations(attemptId, passage, storage?)`:
     - Read-only tuyệt đối (KHÔNG bao giờ gọi `setItem`/`removeItem`).
     - Đọc raw string trong `try/catch`; nếu `!raw || raw.length > READING_ANNOTATIONS_MAX_BYTES` → trả `[]`.
     - Parse JSON; kiểm `parsed?.v === 1 && parsed.passageHash === hashPassage(passage) && Array.isArray(parsed.items)`.
     - Lọc trước số phần tử tối đa (`parsed.items.slice(0, READING_ANNOTATION_MAX_ITEMS * 2)`), kiểm cấu trúc thô rồi chuẩn hoá qua `normalizeReadingAnnotations(candidates, buildPassageModel(passage).canonicalText.length)`.
  4. Export `saveReadingAnnotations(attemptId, passage, items, storage?)`:
     - Nếu `items.length === 0`: `storage.removeItem(key)` trong `try/catch` và return.
     - Chuẩn hoá `items` và tạo payload `{ v: 1, passageHash: hashPassage(passage), updatedAt: now(), items }`.
     - Quét các key mang prefix `READING_ANNOTATIONS_STORAGE_PREFIX` (ngoại trừ `key` hiện tại); nếu tổng số key ≥ `READING_ANNOTATIONS_MAX_STORED_ATTEMPTS`, xoá các key cũ nhất theo `updatedAt` (key hỏng JSON xem như `updatedAt = 0` để ưu tiên xoá).
     - Ghi `storage.setItem(key, serialized)`. Nếu gặp lỗi (ví dụ `QuotaExceededError`), evict tối đa 5 key `quiz-reading-annotations:*` cũ nhất (khác `key`) rồi thử `setItem` lại 1 lần; nếu vẫn lỗi thì bỏ qua an toàn.
  5. Export `clearAllReadingAnnotationsStorage(storage?)`: duyệt danh sách key (snapshot tên key trước khi xoá để không lệch index khi mutate `Storage`) và `removeItem` toàn bộ key bắt đầu bằng `READING_ANNOTATIONS_STORAGE_PREFIX`.
  6. Trong `apps/student/src/lib/student-org-storage.ts` (`syncActiveStudentUser`): gọi `clearAllReadingAnnotationsStorage()` trong cả nhánh `!trimmedUser` (đăng xuất/hết phiên) và nhánh `prevUser && prevUser !== trimmedUser` (đổi tài khoản trên cùng trình duyệt).
  7. Export hook `useReadingAnnotationsStorage(attemptId: string | null, passage: string)`:
     - Khởi tạo state **đồng bộ** (`useState(() => attemptId && passage ? loadReadingAnnotations(attemptId, passage) : [])`).
     - Khi `attemptId` hoặc `passage` đổi sau mount, cập nhật state bằng `loadReadingAnnotations` (tuyệt đối không ghi storage trong `useEffect`).
     - `setItems` (ổn định theo `attemptId`, `passage`) cập nhật React state và gọi `saveReadingAnnotations` ngay.
- **Success criteria**: Toàn bộ test trong `reading-annotations-store.test.ts` pass; không ảnh hưởng các test hiện có của `student-org-storage`.
- **Verify**: `pnpm --filter student test src/lib/reading-annotations-store.test.ts` exits 0.

### Task 3.3 — Wire Student Take (`QuizTakeView`), Student Review (`AttemptDetailScreen`), and Admin Preview (`TestPreviewOverlay`)
<!-- Updated: Red-Team RT-2, RT-12, RT-13 -->
- **Goal**: Kích hoạt tính năng tô sáng và ghi chú trên cả 3 màn hình dùng `QuizReadingSplitLayout` đúng ngữ nghĩa, không giật ở `QuizResumeDialog`, không xoá nhầm khi pending, và cô lập tuyệt đối theo tab ở Admin Preview.
- **Target files and symbols**:
  - Modify: `apps/student/src/components/quiz/quiz-take-view.tsx` (`QuizTakeView`)
  - Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` (`AttemptDetailScreen`)
  - Modify: `apps/admin/src/components/library/test-preview-overlay.tsx` (`TestPreviewOverlay`)
- **Steps**:
  1. Trong `apps/student/src/components/quiz/quiz-take-view.tsx`:
     - Gọi `const [readingAnnotations, setReadingAnnotations] = useReadingAnnotationsStorage(attemptId, detail?.passage ?? "");` **TRƯỚC mọi early return** (tuân thủ Rules of Hooks giống `useQuizAudioStream` tại line 365).
     - Truyền `annotations={attemptId ? { mode: storeActive ? "edit" : "readonly", items: readingAnnotations, onChange: storeActive ? setReadingAnnotations : undefined } : undefined}` vào `<QuizReadingSplitLayout>` (line 562) — nhờ đọc đồng bộ theo `attemptId` và chuyển `readonly` khi `QuizResumeDialog` đang mở, highlight hiển thị liền mạch không giật mất sau reload.
     - Tuyệt đối KHÔNG đụng `QuizAttemptStore`, `combinedSaveState`, hay `submitMutation`.
  2. Trong `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`:
     - Gọi `const [readingAnnotations] = useReadingAnnotationsStorage(quizQuery.data ? attempt.id : null, quizQuery.data?.passage ?? "");` **TRƯỚC early return** ở line 172 (chỉ truyền `attempt.id` khi `quizQuery.data` đã có passage thật).
     - Truyền `annotations={{ mode: "readonly", items: readingAnnotations }}` vào `<QuizReadingSplitLayout>` (line 268).
  3. Trong `apps/admin/src/components/library/test-preview-overlay.tsx`:
     - Thêm state in-memory `const [readingAnnotationsByTab, setReadingAnnotationsByTab] = useState<Record<string, ReadingAnnotation[]>>({});` (song song `answersByTab` tại line 61).
     - Gắn `key={tab.part}` lên `<QuizReadingSplitLayout>` (line 282) và truyền `annotations={{ mode: "edit", items: readingAnnotationsByTab[tab.part] ?? [], onChange: (next) => setReadingAnnotationsByTab((prev) => ({ ...prev, [tab.part]: next })) }}`.
     - Đảm bảo 0 network mutation khi tô sáng/ghi chú trong preview và tự reset khi đóng overlay.
- **Success criteria**: Cả 3 màn hình compile sạch, không vi phạm Rules of Hooks, toàn bộ unit tests ở `packages/ui`, `apps/student`, `apps/admin`, `apps/web` (`rich-text-body.test.tsx`) đều pass.
- **Verify**: `pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter admin test && pnpm --filter web test src/components/ui/rich-text-body.test.tsx && pnpm check-types && pnpm check` exits 0.

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
