# Pre-Landing Code Review — Release v0.0.24 (`origin/main...HEAD`)

**Kết luận:** PASS — Không phát hiện lỗi Critical (blocking). Diff `origin/main...HEAD` trên nhánh `vinh19410/spiderfish` (577 files changed trong `git diff --stat`, gồm ~181 file mã nguồn/cấu hình/test ngoài ảnh PNG, `plans/` và `docs/`) an toàn để phát hành lên `main` với 6 ghi nhận mức độ informational ở Pass 2. Toàn bộ kiểm tra kiểu dữ liệu, Biome và unit/integration tests đã chạy đều đạt.

---

## Tổng quan kiểm tra theo trọng tâm phát hành

### 1. An toàn Migration D1 (`packages/db`)
- **Đạt:** `packages/db/src/migrations/0074_greedy_thanos.sql:1-2` chỉ bổ sung 2 cột nullable kiểu `real` (`writing_band`, `speaking_band`) vào bảng `placement_test_submission` qua `ALTER TABLE ... ADD`, không có thao tác phá hủy dữ liệu, không có cột `NOT NULL` thiếu giá trị mặc định và hoàn toàn tương thích SQLite/D1.
- Schema Drizzle trong `packages/db/src/schema/placement-test.ts:120,125` (`writingBand`, `speakingBand`) và `packages/db/src/migrations/meta/_journal.json:524-529` (entry `idx: 74`, `0074_greedy_thanos`) khớp nhau.

### 2. Auth, Bảo mật, CSP & Inline Document Preview
- **Gỡ Email OTP (`packages/auth`, `apps/student`):**
  - `packages/auth/src/index.ts` đã gỡ hoàn toàn plugin `emailOTP`, `otpEmailTemplate`, helper `getUserByEmail`/`checkAndUpdateCooldown` và middleware OTP. Test `packages/auth/src/auth-verification-email.test.ts:258-312` xác nhận toàn bộ 9 endpoint OTP trả HTTP 404 với origin student, teacher và không có origin.
  - `apps/student/src/routes/login.tsx:33-40` và `apps/student/src/components/auth/auth-tabs.tsx:5-41` chỉ giữ 2 tab `signin`/`signup` (tự fallback giá trị `"otp"` cũ trong `localStorage` về `"signin"`). `apps/student/src/lib/auth-error.ts:5-13` hướng dẫn học viên từng dùng OTP sang luồng Quên mật khẩu.
- **CSP Headers (`apps/student/src/worker.ts`, `apps/web/src/security-headers.ts`):**
  - `apps/student/src/worker.ts:19-51` bổ sung `Permissions-Policy` (`microphone=(self)`) và `Content-Security-Policy` cho môi trường non-local (`worker-src 'self'`, `media-src 'self' blob: ${crossOrigin}`, `connect-src 'self' blob: ${crossOrigin} https:`, `frame-ancestors 'none'`, `object-src 'none'`).
  - `apps/web/src/security-headers.ts:15` mở `connect-src 'self' blob: https:` để phục vụ `pdfjs-dist` đọc `blob:` URL.
- **Inline Document Preview (`packages/ui`, `apps/web`, `apps/student`):**
  - `packages/ui/src/components/document-preview/inline-document-preview.tsx:23-47` khóa allowlist MIME ở 4 định dạng (`application/pdf`, `image/png`, `image/jpeg`, `image/webp` — loại trừ SVG/HTML). Cả `fetchMaterialFileBlobUrl` (`apps/web/src/lib/repos/materials.ts:425-428`) và `fetchLessonMaterialBlobUrl` (`apps/student/src/lib/repos/student.ts:487-492`) đều kiểm `isPreviewableContentType(res.headers.get("content-type"))`, hủy body và ném lỗi HTTP 415 trước khi gọi `URL.createObjectURL`.
  - `packages/ui/src/components/document-preview/blob-document-view.tsx:38-50,115-150` render PDF lên `<canvas>` qua `pdfjs-dist` (`disableAutoFetch: true`, `maxImageSize: MAX_CANVAS_SIDE * MAX_CANVAS_SIDE`, kẹp cạnh tối đa 4096px) và ảnh qua `<img>`, không dùng `<iframe>` hay chèn HTML thô. `InlineDocumentPreview` giới hạn tối đa 3 lượt tải đồng thời (`MAX_CONCURRENT_PREVIEW_LOADS = 3`), chặn auto-fetch file > 10 MiB (`INLINE_AUTO_PREVIEW_MAX_BYTES`) và thu hồi `blob:` URL qua `URL.revokeObjectURL` khi unmount/abort/đổi `requestKey`.
  - Xử lý lệch org trong `apps/student/src/lib/repos/student.ts:453-475` và `apps/student/src/components/class/student-material-preview.tsx:198-212`: khi gặp HTTP 403 `STUDENT_ORG_MISMATCH`, client xóa org cũ khớp `sentOrgId`, invalidate cache `["student", "orgs"]` và thử lại 1 lần không gửi `x-student-org-id`.

### 3. Chế độ bảo trì Profile trên Production
- **Đạt:** `apps/profile/maintenance.json:2` giữ nguyên `"disabled": true` (không thay đổi so với `origin/main`).
- `.github/workflows/deploy.yml:142-190` không đặt biến `PROFILE_MAINTENANCE` và gọi `isProfileMaintenanceEnabled()` (`apps/profile/maintenance.mjs:27-39`), bảo đảm production profile tiếp tục phục vụ trang bảo trì `noindex, nofollow` cùng smoke check bảo trì tương ứng.

### 4. Placement Test & AI Grading (IELTS Bands / Speaking bắt buộc / Tương thích ngược)
- **Speaking bắt buộc:** `studentPlacementSubmitSchema` và `placementPublicSubmitSchema` (`packages/api/src/placement-test-contracts.ts:2262,2302`) chỉ chấp nhận `"upload" | "none"`. `validatePlacementSpeakingModeForSnapshot` (`apps/server/src/lib/placement-submission-service.ts:778-818`) được gọi ở cả `apps/server/src/routes/public-placement-test.ts:546` và `apps/server/src/routes/student-placement-test.ts:597`, trả HTTP 400 `PLACEMENT_SPEAKING_REQUIRED` nếu đề có Speaking mà gửi `speakingMode !== "upload"`, và `PLACEMENT_SUBMIT_INVALID` ở chiều ngược lại.
- **AI Grading chỉ liệt kê lỗi & bảo vệ concurrency:** `openai-grader.ts:57-67,103-132` và `grader.ts:101-155` ép schema JSON chỉ trả `{ errors }` (không điểm/nhận xét). `gradePlacementSubmissionResponse` (`placement-submission-service.ts:603,662-745`) dùng `coalesce` cho `resultToken`, CAS trên `resultPublishedAt IS NULL` để chỉ gửi email ở lần chốt đầu, và đọc lại bản ghi đã lưu để đồng bộ tóm tắt khi có lượt chốt đồng thời. `runClaimedPlacementAiGrading` (`run-placement-grading.ts:252-255`) dùng `ne(status, "graded")` để không ghi đè transcript của bài đã chốt.
- **Tương thích ngược dữ liệu D1 cũ:**
  - `parseStoredWritingRubric` / `parseStoredSpeakingRubric` (`placement-test-contracts.ts:1754-1774`) đọc được cả rubric IELTS mới lẫn rubric legacy (`/15`, `/20`).
  - Các endpoint đọc (`placement-submission-service.ts:286-299`, `public-placement-test.ts:1023-1030`, `student-placement-test.ts:217-228`) ưu tiên `writingBand ?? writingScore` và `speakingBand ?? speakingScore`, đồng thời giữ kiểu `"skipped"` trên các view đọc kết quả cũ.
  - Khi giáo viên chấm lại bằng thang IELTS, `gradePlacementSubmissionResponse` (`placement-submission-service.ts:586-592`) ghi `writingBand`/`speakingBand` mới và đặt `writingScore: null`, `speakingScore: null` để không trộn hai thang điểm.

---

## Pass 1: Critical / Blocking Issues

Pre-Landing Review: Không phát hiện vấn đề Critical (blocking).

---

## Pass 2: Informational Issues (Non-blocking)

1. **[apps/student/src/lib/repos/student.ts:476-485]** Khi `fetchLessonMaterialBlobUrl` nhận phản hồi lỗi không phải 403 `STUDENT_ORG_MISMATCH`, nhánh `else` dùng `res.clone().json()` rồi `throw new HttpError(...)` mà chưa gọi `res.body?.cancel()` và bỏ qua `body.error` (khác với `throwStudentHttpError` ở dòng 83–104).
   - **Fix:** Dùng `await throwStudentHttpError(res, sentOrgId)` (hoặc truyền `code` đã parse và gọi `void res.body?.cancel().catch(() => {})`) để đồng bộ tiêu thụ stream với các repo helper khác.

2. **[apps/server/src/routes/student-placement-test.ts:675-701]** Khi `POST /placement-test/submit` tạo bài với `speakingMode: "upload"` (nay bắt buộc nếu đề có Speaking), hàng đợi AI bỏ qua lúc submit (`submit.speakingMode !== "upload"`) để chờ `PUT /speaking`. Nếu `PUT /speaking` thất bại và học viên tải lại trang trước khi bấm thử lại, `uploadToken` trong RAM mất vĩnh viễn trong khi ràng buộc 1 bài/học viên (`NOT EXISTS ... student_id = s.id`) chặn nộp lại, khiến bài kẹt ở `speakingStatus = "pending_upload"` và `aiStatus = "none"`.
   - **Fix:** Giữ nguyên cho release này (giáo viên vẫn có thể bấm phân tích lỗi AI cho phần Writing ở panel chi tiết); về sau cân nhắc endpoint cấp lại `uploadToken` khi bài thuộc chính học viên đang ở trạng thái `pending_upload`.

3. **[apps/server/src/lib/study-pack-clone.ts:236] & [packages/api/src/contracts.ts:1066,1339,1347]** `flattenLibraryTestPart` mở rộng `optionBank` sao chép từ library lên `LIBRARY_OPTION_BANK_MAX` (20 mục, nhãn `A–T` / `i–xx`). Học viên làm bài và `gradeQuiz` chạy bình thường, nhưng nếu giáo viên mở prompt đã clone có >8 mục bank (hoặc đáp án `I–T` / `ix–xx`) để chỉnh sửa rồi lưu qua `PATCH /api/assignments/prompts/:id`, `assignmentPromptUpdateSchema` hiện vẫn giới hạn `ASSIGNMENT_OPTION_BANK_MAX = 8`.
   - **Fix:** Theo dõi ở issue kế tiếp: nới giới hạn `optionBank` và tập nhãn trên `assignmentPromptUpdateSchema` / `assignments/index.ts` tương ứng với `LIBRARY_OPTION_BANK_MAX` nếu cho phép sửa các prompt clone lớn trên web.

4. **[apps/web/src/components/leads/placement-submission-panel.tsx:661-666,1104-1114]** Với bài cũ đã chấm theo thang legacy (`/15`, `/20`), khi giáo viên mới mở panel (`!dirty`), thanh banner phía trên hiển thị đúng điểm cũ (`legacy-score-banner`) và nút sao chép Zalo giữ `submission.zaloText` cũ, nhưng dòng tóm tắt ở footer (`placement-score-summary`) tính từ `previewFinal` với `writingScore: null` nên hiển thị `Writing — · Speaking —` cùng `averagePct` tính thiếu 2 kỹ năng cho đến khi giáo viên nhập điểm IELTS mới.
   - **Fix:** Khi `isLegacyGraded && !dirty`, hiển thị nhãn tóm tắt footer từ dữ liệu đã lưu (`submission.writingScore/15`, `submission.speakingScore/20`, `submission.finalScorePct`, `submission.finalBandLevel`).

5. **[apps/student/src/worker.ts:43-50]** `media-src` trong CSP dùng `${crossOrigin}` lấy từ `import.meta.env.VITE_SERVER_URL`. Nếu build production thiếu hoặc sai định dạng `VITE_SERVER_URL`, `crossOrigin` rơi về `'self'` và có thể chặn phát media cross-origin từ API (trong khi `connect-src` đã có fallback `https:`).
   - **Fix:** Bảo đảm CI/deploy luôn truyền `VITE_SERVER_URL` hợp lệ khi build `apps/student` (đã có trong pipeline deploy), hoặc bổ sung fallback `https:` có kiểm soát nếu cần phát audio/video từ domain API khác.

6. **[apps/student/src/lib/auth-client.ts:104-118]** `getCachedSession` giữ `lastKnownSession` thêm 5 giây khi request `getSession` gặp lỗi mạng/timeout (đồng bộ với `apps/web`). Nếu người dùng vừa bị thu hồi phiên đúng lúc mạng chập chờn, route guard `/_auth` có thể cho qua thêm tối đa 5 giây trước khi API trả HTTP 401 kích hoạt `reauth()`.
   - **Fix:** Chấp nhận được theo thiết kế UX chống đứng hình khi mất mạng thoáng qua (`apps/web` dùng cùng cơ chế); không cần chặn phát hành.

---

## Kiểm tra đã thực thi trực tiếp (trên HEAD `5c825d18`)

| Kiểm tra | Lệnh | Kết quả quan sát |
|---|---|---|
| Lint / Format (read-only) | `pnpm exec biome check .` | Exit 0 — 1854 files checked, 0 errors (154 warnings, 17 infos baseline) |
| TypeScript | `pnpm check-types` | Exit 0 — 12/12 tasks passed |
| `@teacher-os/api` | `pnpm --filter @teacher-os/api test` | 35 files passed — 486 passed, 1 skipped (`skipIf(!existsSync(htmlPath))`) |
| `@teacher-os/auth` | `pnpm --filter @teacher-os/auth test` | 9 files passed — 102 passed |
| `apps/profile` | `pnpm --filter profile test` | 61 passed, 0 failed |
| `@teacher-os/ui` | `pnpm --filter @teacher-os/ui test` | 20 files passed — 250 passed |
| `apps/admin` | `pnpm --filter admin test` | 21 files passed — 204 passed |
| `apps/student` | `pnpm --filter student test` | 58 files passed — 536 passed |
| `apps/web` | `pnpm --filter web test` | 207 files passed — 2232 passed |
| `apps/server` | `pnpm --filter server test` | 119 files passed — 1577 passed, 1 expected fail |
| Root script tests | `pnpm test:ci-workflow && pnpm test:topology-drift && pnpm test:devserver-watchdog && pnpm test:design-compare && pnpm test:discord-changelog` | 9 + 11 + 17 + 23 + 11 = 71 passed, 0 failed |

*Lưu ý:* Không chạy full Playwright E2E tại local theo quy ước `AGENTS.md` (E2E chạy trên GitHub Actions 6 shard khi PR vào `main` và `deploy.yml`). Ngoài ra, `package.json` trên `HEAD` hiện vẫn là `"version": "0.0.23"` (chưa bump lên `"0.0.24"` trong commit hiện tại).

## Câu hỏi chưa giải quyết
1. Phiên bản `"0.0.24"` trong `package.json` sẽ được bump trực tiếp trong bước release/merge PR vào `main` hay cần commit bump version trước khi mở PR promotion?
