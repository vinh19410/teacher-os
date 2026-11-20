# Ship Official Release v0.0.24 (develop → main)

**Date**: 2026-11-18 08:59 Europe/London
**Severity**: Medium
**Component**: Release `v0.0.24` (nhánh `vinh19410/spiderfish`)
**Status**: Đã review (`PASS`), đang hoàn tất commit bump version + mở PR vào `main`

## Chuyện gì đã xảy ra

Promote **34 commit** (không tính 23 merge commit, `origin/main...HEAD`, 577 files changed trong `git diff --stat` / ~181 file mã nguồn, cấu hình và test ngoài ảnh PNG, `plans/`, `docs/`) từ `develop` (`869e1f3c`) kết hợp merge `origin/main` (`f7dd127e`, `v0.0.23`) tại `5c825d18` lên `main` (`v0.0.23` → `v0.0.24`), kèm **1 D1 migration mới** (`packages/db/src/migrations/0074_greedy_thanos.sql`).

Phạm vi chính của `v0.0.24`:
- **Chấm bài đầu vào theo thang IELTS & AI chỉ liệt kê lỗi (#800):** chuyển chấm Writing/Speaking trên `apps/web`, kết quả trên `apps/student` / `apps/profile` và API (`packages/api`, `apps/server`) sang IELTS band `0.0–9.0`; AI (`openai-grader`, `grader`) chỉ xuất JSON `{ errors }` tiếng Việt thay vì tự chấm điểm.
- **Xem trước tài liệu inline & thumbnail `96×72px` (#797, #801):** render PDF lên `<canvas>` (`pdfjs-dist`) và ảnh qua `<img>` ngay trong `/materials`, modal buổi học và `LessonMaterials` (`packages/ui`, `apps/web`, `apps/student`), thu gọn ở dạng thumbnail `w-24 h-[72px]` mở modal dùng lại `blob:` URL.
- **Bắt buộc hoàn thành Speaking bài kiểm tra đầu vào (#788, #780):** bỏ `"skipped"` ở API và UI (`apps/profile`, `apps/student`), trả HTTP 400 `PLACEMENT_SPEAKING_REQUIRED` nếu thiếu bản ghi Speaking khi đề có Speaking; tinh gọn màn hình Speaking với nút Pause giữa màn hình, retry tối đa 2 lần/câu và nút `Kết thúc phần Speaking` tách riêng.
- **Thư viện Admin & tạo đề MCQ 3/4 lựa chọn (#762, #792):** hỗ trợ đầy đủ 15 dạng câu hỏi IELTS Reading trong thư viện admin (`apps/admin`, `packages/api`, `packages/ui`) và cho phép chuyển đổi 3/4 lựa chọn trên từng câu `mcq` xuyên suốt `AnswerKeyGrid`, `BulkKeyPaste`, `QuizPaper` và save-gate.
- **Gỡ Email OTP & tinh gọn luồng học viên (#761, #767, #790, #781):** gỡ hoàn toàn plugin `emailOTP` ở `packages/auth` (toàn bộ 9 endpoint OTP trả HTTP 404) và giữ 2 tab `signin`/`signup` ở `apps/student`; giới hạn onboarding còn 2 nhánh IELTS + Communication (#767); thêm `getCachedSession` cache 10s để hết khựng khi chuyển menu sidebar học viên (#790); chuyển mục kiểm tra đầu vào khỏi sidemenu sang chuông thông báo (#781).
- **Email kết quả HTML & hệ thống giao diện (#778, #786, #768, #777):** gửi bảng điểm HTML + nút `Xem chi tiết kết quả` trong email bài kiểm tra đầu vào (sửa nhãn `Grammar & Vocabulary`), chuyển sans-serif chính sang `Be Vietnam Pro` và khôi phục root font `16px` tránh iOS Safari auto-zoom. Ngoài ra còn vá tràn sidemenu `AdminShell` (#787), giữ lịch `/schedule` khi trống (#769) và bỏ chữ dư thừa ở timer/reading labels (#795, #775).

## Quyết định kỹ thuật chính

- **Merge `origin/main` vào nhánh phát hành:** hợp nhất `f7dd127e` (`v0.0.23`) vào `5c825d18` trên `vinh19410/spiderfish` để đồng bộ `CHANGELOG.md`, `apps/web/src/security-headers.ts`, `docs/production-release-runbook.md` và các E2E helper trước khi bump `package.json` lên `"0.0.24"`.
- **Migration D1 `0074_greedy_thanos.sql` an toàn dữ liệu & tương thích ngược:** chỉ dùng `ALTER TABLE placement_test_submission ADD writing_band real; ADD speaking_band real;`. Các endpoint đọc ưu tiên `writingBand ?? writingScore` và `speakingBand ?? speakingScore`, `parseStoredWritingRubric`/`parseStoredSpeakingRubric` đọc cả rubric cũ (`/15`, `/20`) lẫn IELTS mới, còn khi giáo viên chốt lại theo IELTS thì xóa `writingScore: null`, `speakingScore: null` để không trộn hai thang điểm.
- **Bảo vệ concurrency khi chấm bài & chạy AI:** `gradePlacementSubmissionResponse` dùng `coalesce` cho `resultToken`, CAS trên `resultPublishedAt IS NULL` để chỉ gửi email ở lần chốt đầu, và `runClaimedPlacementAiGrading` dùng `ne(status, "graded")` để tránh ghi đè transcript bài đã chốt.
- **Kiểm soát bảo mật Inline Document Preview & CSP:** `InlineDocumentPreview` khóa allowlist 4 MIME (`application/pdf`, `image/png`, `image/jpeg`, `image/webp` — chặn SVG/HTML), giới hạn tối đa 3 lượt tải song song, chặn auto-fetch > 10 MiB, kẹp canvas 4096px, dọn `blob:` qua `URL.revokeObjectURL`, tự thử lại không gửi `x-student-org-id` khi gặp `403 STUDENT_ORG_MISMATCH`. `apps/student/src/worker.ts` thêm `Permissions-Policy` (`microphone=(self)`) và `Content-Security-Policy`; `apps/web/src/security-headers.ts` mở `connect-src 'self' blob: https:` cho `pdfjs-dist`.
- **Giữ `apps/profile` ở chế độ bảo trì trên production:** `apps/profile/maintenance.json` giữ nguyên `"disabled": true` và `.github/workflows/deploy.yml` không đặt `PROFILE_MAINTENANCE`, đảm bảo production tiếp tục trả trang bảo trì `noindex, nofollow`.

## Kiểm chứng (trên HEAD `5c825d18`)

Theo `plans/reports/code-reviewer-261118-0833-release-v0-0-24.md`:
- **Pre-landing code review:** `PASS` — 0 lỗi Critical (blocking), 6 ghi nhận mức informational ở Pass 2.
- `pnpm exec biome check .`: Exit 0 — 1854 files checked, 0 errors (154 warnings, 17 infos baseline).
- `pnpm check-types`: Exit 0 — 12/12 tasks passed.
- **Unit / integration tests:**
  - `@teacher-os/api`: 35 files passed — 486 passed, 1 skipped (`skipIf(!existsSync(htmlPath))`).
  - `@teacher-os/auth`: 9 files passed — 102 passed (xác nhận 9 endpoint OTP trả 404).
  - `apps/profile`: 61 passed, 0 failed.
  - `@teacher-os/ui`: 20 files passed — 250 passed.
  - `apps/admin`: 21 files passed — 204 passed.
  - `apps/student`: 58 files passed — 536 passed.
  - `apps/web`: 207 files passed — 2232 passed.
  - `apps/server`: 119 files passed — 1577 passed, 1 expected fail.
  - Root scripts (`test:ci-workflow`, `test:topology-drift`, `test:devserver-watchdog`, `test:design-compare`, `test:discord-changelog`): 9 + 11 + 17 + 23 + 11 = 71 passed, 0 failed.
- **E2E:** Không chạy full Playwright E2E ở local theo `AGENTS.md` — sẽ chạy 6 shard trên GitHub Actions (`e2e.yml`) khi mở PR vào `main` và khi `deploy.yml` gate production.

## Rủi ro & việc cần theo dõi (Pass 2 Informational)

1. **`apps/student/src/lib/repos/student.ts:476-485`:** nhánh lỗi khác `403 STUDENT_ORG_MISMATCH` trong `fetchLessonMaterialBlobUrl` chưa gọi `res.body?.cancel()` và bỏ qua `body.error` (nên chuyển sang `throwStudentHttpError(res, sentOrgId)` ở đợt sau).
2. **`apps/server/src/routes/student-placement-test.ts:675-701`:** nếu `POST /placement-test/submit` (`speakingMode: "upload"`) xong nhưng `PUT /speaking` thất bại và học viên tải lại trang, `uploadToken` trong RAM mất trong khi ràng buộc 1 bài/học viên chặn nộp lại, làm bài kẹt ở `speakingStatus = "pending_upload"`; giữ nguyên cho release này, cân nhắc endpoint cấp lại `uploadToken` ở issue sau.
3. **`apps/server/src/lib/study-pack-clone.ts:236` & `packages/api/src/contracts.ts`:** đề clone từ library cho phép `optionBank` tới `LIBRARY_OPTION_BANK_MAX = 20` (`A–T`/`i–xx`), nhưng `assignmentPromptUpdateSchema` trên web vẫn giới hạn `ASSIGNMENT_OPTION_BANK_MAX = 8` nếu giáo viên sửa rồi `PATCH` lại.
4. **`apps/web/src/components/leads/placement-submission-panel.tsx:661-666,1104-1114`:** với bài legacy (`/15`, `/20`) khi mới mở (`!dirty`), `legacy-score-banner` và `zaloText` đúng dữ liệu cũ nhưng footer `placement-score-summary` hiển thị `Writing — · Speaking —` do tính từ `previewFinal` (`writingScore: null`).
5. **`apps/student/src/worker.ts:43-50`:** `media-src` dùng `${crossOrigin}` lấy từ `VITE_SERVER_URL`; cần đảm bảo CI/deploy luôn truyền `VITE_SERVER_URL` hợp lệ khi build `apps/student` để tránh rơi về `'self'`.
6. **`apps/student/src/lib/auth-client.ts:104-118`:** `getCachedSession` giữ `lastKnownSession` thêm tối đa 5s khi `getSession` lỗi mạng/timeout (đồng bộ với `apps/web`, chấp nhận được).

## Next steps

1. Commit bump version `"0.0.24"` trong `package.json`, `CHANGELOG.md`, report `code-reviewer-261118-0833-release-v0-0-24.md` và journal này rồi mở PR promote lên `main`.
2. Theo dõi CI `quality.yml` + full 6-shard `e2e.yml` trên PR trước khi merge; trước khi deploy production chạy backup D1 theo runbook vì có migration `0074_greedy_thanos.sql`.
3. Tạo issue theo dõi 4 mục Pass 2 cần vá sau release (mục 1–4 ở trên).

Report đầy đủ: `plans/reports/code-reviewer-261118-0833-release-v0-0-24.md`.
