# Journal: Giải thích nút "Nộp bài" bị khóa khi dialog "Tiếp tục bài làm" đang mở (#885)

- **Date:** 2026-11-25
- **Issue:** #885
- **Branch:** `vinh19410/fix-practice-dialog-ti-p-t-c-b-i-l-m-kh-a-n-t-n` (target: `develop`)

## Bối cảnh
- Khi học viên tải lại trang đang làm bài đã có đáp án lưu trên server (`serverHasAnswers === true`), `QuizTakeView` cố ý giữ `storeActive = !needsResumeDialog` để không reconcile/gửi PATCH ngầm từ `localStorage` mirror trước khi học viên bấm `"Tiếp tục"`. Hệ quả là `submitDisabled` chuyển sang `true`, khiến nút `"Nộp bài"` trên `QuizRuntimeHeader` hiển thị mờ/khóa phía sau lớp phủ `QuizResumeDialog` mà không có bất kỳ lời giải thích nào trong dialog hay trên nút (bao gồm cả các trạng thái khóa khác như Speaking chưa tải file, đang upload, đang nộp, hoặc autosave halt).
- Do `QuizDialog` phủ toàn màn hình trên `<header>` (`z-30`) và chặn thao tác trỏ chuột/phím tới header khi đang mở, chỉ gắn tooltip lên nút `"Nộp bài"` không đủ để giải thích tại thời điểm dialog đang mở.

## Thay đổi & Quyết định kỹ thuật
- **Giải thích ngay trong `QuizResumeDialog` & gia cố modal `QuizDialog` (`apps/student/src/components/quiz/quiz-lifecycle-dialogs.tsx`):**
  - Thêm prop tùy chọn `helperText?: string` cho `QuizDialog`, render thành thẻ `<p data-testid="quiz-dialog-helper">` tách biệt khỏi đoạn `description` gốc và nối vào `aria-describedby` (`${descriptionId} ${helperId}`). `QuizResumeDialog` truyền `'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".'`.
  - Nâng lớp phủ modal từ `z-50` lên `z-[60]` để luôn đứng trên portal `TooltipContent` (`z-50` gắn cuối `document.body`).
  - Gia cố focus trap `Tab`/`Shift+Tab`: xử lý đúng khi focus đang nằm trên card dialog ban đầu hoặc ngoài card, và lọc bỏ đồng nhất mọi phần tử có `[disabled]` hoặc `aria-disabled="true"` bằng `.filter(...)` — vá lỗi thực tế phát hiện qua test hồi quy do `@base-ui/react/button` luôn xuất `tabindex="0"` trên `<button disabled>`, khiến nhánh CSS `[tabindex]:not([tabindex='-1'])` vẫn khớp lại nút bị khóa.
- **`submitDisabledReason` với cây DOM ổn định trên `QuizRuntimeHeader` (`apps/student/src/components/quiz/quiz-runtime-header.tsx`):**
  - Bọc nút `"Nộp bài"` trong cấu trúc ổn định `<TooltipProvider delay={0}><Tooltip disabled={disabledReason === null}><TooltipTrigger render={<span />}><Button disabled={submitDisabled} aria-describedby={...}>Nộp bài</Button></TooltipTrigger><TooltipContent ... /></Tooltip>` để `<button>` không bị React unmount/remount khi đổi trạng thái (giữ ổn định DOM node và focus), không tạo nested `<button>`, và giữ nguyên accessible name `"Nộp bài"`.
  - Chỉ đặt `disabled` trên `<Tooltip>` (không đặt trên `<TooltipTrigger>`) để giữ tương thích SSR `renderToStaticMarkup` (`quiz-navigator.test.tsx:173` kiểm `not.toContain('disabled=""')`), đồng thời giữ `<TooltipContent>` thường trực trong cây với `disabledReason === null && "hidden"` và `max-w-[calc(100vw-16px)]` để tránh lỗi rò trạng thái `store.mounted` của Base UI khi chuyển `disabled → enabled → disabled` lúc đang hover.
  - Render `<span id={submitReasonId} className="sr-only">` thường trực trong DOM khi bị khóa để `aria-describedby` luôn trỏ tới phần tử tồn tại thật thay vì Portal chưa mount.
- **Một nguồn chân lý cho mọi lý do khóa nút nộp (`apps/student/src/components/quiz/quiz-take-view.tsx`):**
  - Xuất hàm thuần `resolveSubmitDisabledReason(...)` theo thứ tự ưu tiên 7 nhánh (`attemptStatus !== "in_progress"`, `needsResumeDialog`, `isSubmitting`, `haltedReason` [`auth`/`org_mismatch`/khác], `isSpeaking && mediaUploading`, `isSpeaking && !hasMedia`, thiếu `store`/`essayStore`), suy `submitDisabled = submitDisabledReason !== null` để trạng thái khóa và lý do không bao giờ lệch nhau.
  - Bổ sung `storeRef.current?.halt("auth")` trong `SpeakingSubmissionPanel.onAuthError` để bài Speaking hết phiên 401 khóa nút nộp với đúng lý do hết phiên đăng nhập.

## Xác minh
- TDD Red → Green + regression suite: `apps/student` pass 100% (bao gồm `quiz-navigator.test.tsx`, `quiz-take-view.test.tsx`, `text-bg-guard.test.ts`), bổ sung test hồi quy cho chu kỳ Tooltip `disabled → enabled → disabled`, focus trap lọc nút disabled của `QuizStartDialog`, và Speaking delete 401 halt.
- Targeted E2E (unified `apps/lms` trên cổng `8100–8105`, tuân thủ `AGENTS.md` không chạy full E2E local): `apps/e2e/specs/student-practice.spec.ts` pass đầy đủ sau khi hòa giải với `origin/develop` (`#883`), xác minh màn giới thiệu → bắt đầu → tải lại → helper text + `aria-describedby` đa-ID an toàn + zero overflow → bấm `"Tiếp tục"` mở khóa nút nộp.
- Gate monorepo: `pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, `VITE_SERVER_URL=http://localhost:8000 pnpm build` đều pass 0 lỗi.
- Ảnh POT: 6 ảnh `plans/reports/885-*.png` (desktop/tablet/mobile Light & Dark + hover tooltip thật trên Speaking không có media) đã rà soát trực quan đạt chuẩn tương phản `DESIGN.md` và zero overflow `320px–1440px`.

## Follow-ups (ngoài phạm vi #885)
- `SpeakingSubmissionPanel` tách biến `deleting` khỏi `onUploadingChange` — tách follow-up riêng nếu cần khóa nút `"Nộp bài"` trong lúc `DELETE /media` đang bay.
- 3 modal khác trong `apps/student` (`placement-prompt-modal.tsx`, `vocab-course-switcher-dialog.tsx`, `student-material-preview.tsx`) có mẫu selector `[tabindex]:not([tabindex='-1'])` tương tự — theo dõi ở follow-up riêng.
