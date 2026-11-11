---
phase: 2
title: "Phase 2: Tự phục hồi active_student_org_id đa truy vấn & đa tài khoản trên Student Portal, cập nhật E2E E6 & CHANGELOG"
status: completed
priority: P1
effort: "1.75h"
dependencies: [1]
---

# Phase 2: Tự phục hồi `active_student_org_id` đa truy vấn & đa tài khoản trên Student Portal, cập nhật E2E E6 & CHANGELOG

<!-- Updated: Red-Team & Validation Session 1 - HttpError.sentOrgId for concurrent GET race, syncActiveStudentUser in /_auth beforeLoad, separate parseWriteErrorAndThrow in vocab.ts + audio/* check, quiz.ts:request() + QuizAttemptStore.drain() early break on ORG_MISMATCH, submitOnboarding pinned orgId, subscribeActiveStudentOrg useSyncExternalStore, student-org-storage direct imports for mock safety, orgBId in E2E spec -->

## Goal
Triển khai cơ chế tự phục hồi `active_student_org_id` an toàn trước truy vấn song song và cô lập giữa nhiều tài khoản trên cổng học viên (`apps/student`) mà tuyệt đối không tự động retry thao tác ghi sang tổ chức khác, đồng thời cập nhật kịch bản E2E E6 (`material-upload-student.spec.ts` kèm khai báo `orgBId`) và `CHANGELOG.md`.

## Files to Create / Modify
- Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/student-org-storage.ts`
- Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/student-org-recovery.test.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/query-client.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/quiz-attempt-store.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/student.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/quiz.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/vocab.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/route.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/onboarding.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/onboarding/onboarding-wizard.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/layout/org-switcher.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/overview/greeting-header.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/class/lesson-materials.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/layout/avatar-menu.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/overview/student-error-view.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/tuition/$invoiceId.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/org-switcher.test.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/avatar-menu.test.tsx`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/e2e/specs/material-upload-student.spec.ts`
- Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/CHANGELOG.md`

## Tasks & Steps

### Task 2.1 — Viết bộ bài test đỏ (TDD Red) cho tự phục hồi đa truy vấn song song, chống retry lệnh ghi, cô lập `userId`, `OrgSwitcher`, đăng xuất và các hàm repo ngoài React Query
- **Goal:** Tạo bộ test đơn vị khoá chặt mọi đường phục hồi (kể cả race nhiều query song song và `vocab` GET queries), cô lập đa tài khoản và chống tự retry lệnh ghi (kể cả `QuizAttemptStore.drain()`) trước khi sửa code.
- **Target files and symbols:**
  - Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/student-org-recovery.test.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/org-switcher.test.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/test/avatar-menu.test.tsx`
- **Steps:**
  1. Tạo `apps/student/test/student-org-recovery.test.ts` (`// @vitest-environment jsdom`) phủ 8 kịch bản:
     - **Kịch bản Q1 (Đa truy vấn `GET` song song tự phục hồi đồng thời — chống race RT-1):** Đặt `localStorage.setItem("active_student_org_id", "org-stale")`; chạy song song `await Promise.all([client.fetchQuery({ queryKey: ["student", "me"], queryFn: fetchStudentMe }), client.fetchQuery({ queryKey: ["student", "overview"], queryFn: fetchStudentOverview }), client.fetchQuery({ queryKey: ["student", "vocab-overview"], queryFn: fetchVocabOverview })])` với `globalThis.fetch` trả `403` JSON `{ code: "STUDENT_ORG_MISMATCH" }` bất cứ khi nào request mang header `x-student-org-id: org-stale` (trả lệch nhịp microtask) và trả payload hợp lệ `200` khi không còn header đó. Khẳng định cả 3 truy vấn song song đều resolve thành công ngay lập tức (mỗi endpoint gọi đúng `2` lần) và `localStorage.getItem("active_student_org_id")` là `null`.
     - **Kịch bản Q2 (Chống vòng lặp khi request không gửi `sentOrgId`):** Nếu `localStorage` không có `active_student_org_id` (`sentOrgId === undefined`) mà server trả `403 STUDENT_ORG_MISMATCH`, hoặc trả `403 STUDENT_NOT_LINKED` / `404`, `fetchQuery` chỉ gọi mạng đúng `1` lần rồi reject `HttpError` (không retry).
     - **Kịch bản U1 (Cô lập phiên đa tài khoản `syncActiveStudentUser` — RT-5):** Khi `localStorage` đang giữ `active_student_org_id = "org-1"` của `"user-a"`, gọi `syncActiveStudentUser("user-b")` xoá ngay `active_student_org_id` về `null` và lưu `"user-b"`; gọi lại `syncActiveStudentUser("user-b")` giữ nguyên org mới chọn của `"user-b"`; gọi `syncActiveStudentUser(null)` (hết phiên) xoá cả `active_student_org_id` lẫn `active_student_user_id`.
     - **Kịch bản M1 (Mutation & Onboarding ghim `orgId` KHÔNG tự retry lệnh ghi — RT-3/RT-7):** Đặt `localStorage.setItem("active_student_org_id", "org-stale")`, spy `client.invalidateQueries`, chạy mutation gọi `submitOnboarding(validPayload, "org-stale")` nhận `403 STUDENT_ORG_MISMATCH` → khẳng định `fetch` chỉ gọi đúng `1` lần, reject `HttpError`, `localStorage.getItem("active_student_org_id")` bị xoá về `null`, `invalidateQueries` được gọi với `{ queryKey: ["student"] }`; và nếu gọi tiếp `submitOnboarding(validPayload, "org-stale")` lần 2 trước khi `meQuery` đổi org, request vẫn gửi đúng `x-student-org-id: org-stale` (không lặng lẽ rơi về `rows[0]`).
     - **Kịch bản R1 (`reauth()` xoá org cũ):** Đặt `localStorage.setItem("active_student_org_id", "org-stale")`, stub `window.location` / `authClient.signOut`, gọi `reauth()` → `localStorage.getItem("active_student_org_id")` bằng `null`.
     - **Kịch bản B1 (Blob GET ngoài React Query — `fetchQuizMediaObjectUrl` & `fetchVocabAudioObjectUrl` + chặn MIME HTML/SVG — RT-9):** Khi lần 1 mang `x-student-org-id: org-stale` nhận `403 STUDENT_ORG_MISMATCH`, lần 2 không có header nhận `200` `audio/mpeg` → cả hai hàm trả blob URL sau đúng `2` lần gọi; nếu `fetchVocabAudioObjectUrl` nhận `Content-Type: text/html` thì ném `HttpError` mà không gọi `URL.createObjectURL`.
     - **Kịch bản W1 (Imperative write ngoài `useMutation` — `postVocabAnswer`, `patchQuizAnswer`, `deleteQuizMedia`, `uploadQuizMedia` — RT-4/RT-6):** Khi nhận `403 STUDENT_ORG_MISMATCH`, mỗi hàm chỉ gọi mạng đúng `1` lần, xoá `active_student_org_id` khỏi `localStorage`, và reject `HttpError(403, ..., { code: "STUDENT_ORG_MISMATCH" })`.
     - **Kịch bản D1 (`QuizAttemptStore.drain()` ngắt ngay sau wave 1 khi gặp `STUDENT_ORG_MISMATCH` — RT-6):** Khi `send` ném `new HttpError(403, "Forbidden", { code: STUDENT_ERROR_CODES.ORG_MISMATCH })` (và xoá `active_student_org_id`), `await expect(store.drain()).rejects.toThrow()` chỉ gọi `send` đúng `1` lần (không chạy wave 2 gửi `PATCH` không header sang org khác), trong khi lỗi `400` thông thường vẫn giữ nguyên hành vi `QUIZ_DRAIN_MAX_WAVES` của test `F1b`.
  2. Cập nhật `apps/student/test/org-switcher.test.tsx`:
     - Đổi mock `getActiveStudentOrgId` thành `const mockGetActiveOrgId = vi.fn<() => string | null>(() => "org-1")` và spy `mockInvalidateQueries = vi.fn()`.
     - Thêm test: khi `mockGetActiveOrgId` trả `"org-removed"` và `orgs` trả `[{ id: "org-2", name: "TOEIC Cô Mai", isCurrent: true }]` → `useStudentTeam()` trả `activeOrgId: "org-2"`, gọi `setActiveStudentOrgId("org-2")` và gọi `mockInvalidateQueries({ queryKey: ["student"] })`.
     - Thêm test: khi `mockGetActiveOrgId` trả `null` (đăng nhập lần đầu / vừa được `retry` dọn) và `orgs` trả `[{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true }]` → gọi `setActiveStudentOrgId("org-1")` mà không gọi `mockInvalidateQueries` thừa.
  3. Cập nhật `apps/student/test/avatar-menu.test.tsx`:
     - Stub `window.location` (`vi.stubGlobal("location", { ...window.location, assign: vi.fn() })`), đặt `localStorage.setItem("active_student_org_id", "org-old")`, render `<AvatarMenuContent />`, `fireEvent.click` vào menuitem `"Đăng xuất"`, và dùng `await waitFor(() => expect(localStorage.getItem("active_student_org_id")).toBeNull())`.
- **Success criteria:** Bộ test mới chạy đỏ vì module `student-org-storage.ts` chưa tồn tại và các file client chưa có logic tự phục hồi.
- **Verify:** `pnpm --filter student test -- test/student-org-recovery.test.ts test/org-switcher.test.tsx test/avatar-menu.test.tsx` kết thúc với mã thoát khác `0` (nếu thoát `0` là thất bại).

### Task 2.2 — Cài đặt `student-org-storage.ts`, tự phục hồi đa truy vấn ở `QueryClient`/`MutationCache`, cô lập `/_auth`, ghim `orgId` onboarding, `QuizAttemptStore` và các hàm repo (TDD Green)
- **Goal:** Hiện thực đầy đủ toàn bộ cơ chế tự phục hồi, cô lập `userId`, phản ứng `useSyncExternalStore` và chống tự retry lệnh ghi mà không làm vỡ bất kỳ mock test hiện hữu nào (`overview.test.tsx`, `student-shell.test.tsx`, `quiz-attempt-store.test.ts`).
- **Target files and symbols:**
  - Create: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/student-org-storage.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/query-client.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/quiz-attempt-store.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/student.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/quiz.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/lib/repos/vocab.ts`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/route.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/onboarding.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/onboarding/onboarding-wizard.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/layout/org-switcher.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/overview/greeting-header.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/class/lesson-materials.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/layout/avatar-menu.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/components/overview/student-error-view.tsx`
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/student/src/routes/_auth/tuition/$invoiceId.tsx`
- **Steps:**
  1. Tạo `apps/student/src/lib/student-org-storage.ts` (module lá thuần không phụ thuộc `query-client.ts` hay `repos/*`):
     - Quản lý `ACTIVE_STUDENT_ORG_KEY = "active_student_org_id"` và `ACTIVE_STUDENT_USER_KEY = "active_student_user_id"`.
     - Xuất `getActiveStudentOrgId(): string | null` (đọc `localStorage`, `.trim()`, rỗng trả `null`), `setActiveStudentOrgId(orgId: string): void`, `clearActiveStudentOrgId(): void` (chỉ xoá key org và phát thông báo cho subscribers), `syncActiveStudentUser(userId: string | null | undefined): void` (nếu `!userId` thì xoá cả `ACTIVE_STUDENT_USER_KEY` và `clearActiveStudentOrgId()`; nếu `prevUserId && prevUserId !== userId` thì gọi `clearActiveStudentOrgId()`; sau đó lưu `ACTIVE_STUDENT_USER_KEY = userId`), và `subscribeActiveStudentOrg(listener: () => void): () => void` (lắng nghe cả in-tab `Set<() => void>` lẫn sự kiện `window` `"storage"` an toàn SSR khi `typeof window === "undefined"`).
  2. Trong `apps/student/src/lib/query-client.ts`:
     - Mở rộng `HttpError`: thêm thuộc tính `readonly sentOrgId?: string;` trong `options?: { code?: string; sentOrgId?: string }`.
     - Xuất `isStudentOrgMismatchError(error: unknown): error is HttpError` (`isHttpError(error) && error.status === 403 && error.code === STUDENT_ERROR_CODES.ORG_MISMATCH`) và `healStudentOrgMismatch(client: QueryClient = studentQueryClient): void` (`clearActiveStudentOrgId(); void client.invalidateQueries({ queryKey: ["student"] });`).
     - Trong `reauth()`: gọi `syncActiveStudentUser(null)` trước khi điều hướng `/login`.
     - Trong `createStudentQueryClient()`:
       - `defaultOptions.queries.retry`: `(failureCount, error) => { if (failureCount < 1 && isStudentOrgMismatchError(error) && Boolean(error.sentOrgId)) { if (getActiveStudentOrgId() === error.sentOrgId) { clearActiveStudentOrgId(); void client.invalidateQueries({ queryKey: ["student", "orgs"] }); } return true; } return false; }`.
       - `defaultOptions.queries.retryDelay`: `(attemptIndex, error) => isStudentOrgMismatchError(error) ? 0 : Math.min(1000 * 2 ** attemptIndex, 30_000)`.
       - `queryCache: new QueryCache({ onError: (error) => { if (isHttpError(error) && error.status === 401) { reauth(); return; } if (isStudentOrgMismatchError(error) && Boolean(error.sentOrgId)) { healStudentOrgMismatch(client); } } })`.
       - `mutationCache: new MutationCache({ onError: (error) => { if (isHttpError(error) && error.status === 401) { reauth(); return; } if (isStudentOrgMismatchError(error)) { healStudentOrgMismatch(client); } } })`.
  3. Trong `apps/student/src/routes/_auth/route.tsx`: import `syncActiveStudentUser` từ `@/lib/student-org-storage`; trong `beforeLoad`, khi `!session.data` gọi `syncActiveStudentUser(null)` trước `throw redirect(...)`, và khi có `session.data.user?.id` gọi `syncActiveStudentUser(session.data.user.id)`.
  4. Trong `apps/student/src/components/layout/avatar-menu.tsx` và `apps/student/src/components/overview/student-error-view.tsx`: **bắt buộc import `syncActiveStudentUser` / `clearActiveStudentOrgId` trực tiếp từ `@/lib/student-org-storage`** (không import từ `@/lib/repos/student` để bảo toàn tuyệt đối các mock đóng trong `overview.test.tsx` và `student-shell.test.tsx`); gọi `syncActiveStudentUser(null)` trong `finally` của `handleSignOut`, và thêm nhánh hiển thị thân thiện cho `STUDENT_ERROR_CODES.ORG_MISMATCH` trong `student-error-view.tsx`.
  5. Trong `apps/student/src/lib/repos/student.ts`:
     - Re-export `getActiveStudentOrgId`, `setActiveStudentOrgId`, `clearActiveStudentOrgId` từ `@/lib/student-org-storage`.
     - Sửa `getStudentHeaders(extra = {}, explicitOrgId?: string | null)`: chọn `const orgId = explicitOrgId !== undefined ? explicitOrgId : getActiveStudentOrgId();` để hỗ trợ ghim `orgId` tường minh.
     - Viết helper nội bộ `throwStudentHttpError(res: Response, sentOrgId: string | undefined, fallbackPrefix = "Request failed with status"): Promise<never>` đọc JSON `{ code?: string; error?: string }` (`code = body.code ?? body.error`) và ném `new HttpError(res.status, ..., { code, sentOrgId })`; áp dụng thống nhất cho toàn bộ các hàm fetch trong `repos/student.ts` (bao gồm cả `acceptStudentInvitation`, `rejectStudentInvitation`, `acceptClassEnrollment` tại dòng 269/296/323 và `markInboxRead` dòng 750, `fetchStudentInvoices` dòng 838, `fetchStudentInvoicePayment` dòng 862).
     - Cho phép `submitOnboarding(payload: StudentOnboardingPayload, explicitOrgId?: string)` và `useSubmitOnboarding(explicitOrgId?: string)` nhận `explicitOrgId`; cập nhật `onboarding.tsx` truyền `orgId={meQuery.data?.student.orgId}` xuống `<OnboardingWizard>` và `OnboardingWizard` hiển thị thông báo rõ `"Tổ chức học tập vừa thay đổi, vui lòng kiểm tra lại trước khi lưu."` khi gặp `isStudentOrgMismatchError(err)`.
     - Trong `useStudentSchedule`: đăng ký `useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, getActiveStudentOrgId)` để `activeOrgId` trong `queryKey` luôn phản ứng tức thì khi `localStorage` đổi.
  6. Trong `apps/student/src/components/layout/org-switcher.tsx`, `apps/student/src/components/overview/greeting-header.tsx`, và `apps/student/src/components/class/lesson-materials.tsx` (`MaterialRow`): dùng `useSyncExternalStore(subscribeActiveStudentOrg, getActiveStudentOrgId, getActiveStudentOrgId)` (import `subscribeActiveStudentOrg` từ `@/lib/student-org-storage`, giữ `getActiveStudentOrgId` từ `@/lib/repos/student` để tương thích 100% với `renderToStaticMarkup` và các mock test hiện hữu); đồng thời trong `org-switcher.tsx` cập nhật `useEffect`:
     ```ts
     useEffect(() => {
     	if (!currentOrg || activeOrgId === currentOrg.id) return;
     	const hadStaleOrg = activeOrgId !== null;
     	setActiveStudentOrgId(currentOrg.id);
     	if (hadStaleOrg) {
     		void queryClient.invalidateQueries({ queryKey: ["student"] });
     	}
     }, [currentOrg, activeOrgId, queryClient]);
     ```
  7. Trong `apps/student/src/routes/_auth/tuition/$invoiceId.tsx`: bỏ `retry: false` ở dòng 28.
  8. Trong `apps/student/src/lib/repos/quiz.ts` và `apps/student/src/lib/quiz-attempt-store.ts`:
     - Ở `quiz.ts:request()`: ghi nhận `sentOrgId = headers["x-student-org-id"]`; nếu `!res.ok`, đọc `{ code }`, khi `method === "GET"` gặp `403 ORG_MISMATCH` với `sentOrgId` thì xoá `localStorage` (nếu còn khớp `sentOrgId`) + retry `GET` 1 lần, còn khi `method !== "GET"` gặp `403 ORG_MISMATCH` thì gọi `healStudentOrgMismatch()` và ném `new HttpError(res.status, ..., { code, sentOrgId })` không retry.
     - Ở `uploadQuizMedia`: ghi nhận `sentOrgId = headers["x-student-org-id"]`; nếu `403 ORG_MISMATCH` thì gọi `healStudentOrgMismatch()` và `reject(new HttpError(..., { code, sentOrgId }))`.
     - Ở `fetchQuizMediaObjectUrl`: nếu lần `GET` đầu tiên có `sentOrgId` và nhận `403 ORG_MISMATCH`, xoá `localStorage` (nếu còn khớp `sentOrgId`), `invalidateQueries(["student", "orgs"])`, và retry `GET` đúng 1 lần.
     - Ở `quiz-attempt-store.ts:369-371` (`drain()`): nếu `isStudentOrgMismatchError(lastSendError)` thì `break` khỏi vòng lặp wave ngay sau wave 1 (giữ nguyên hành vi đủ `QUIZ_DRAIN_MAX_WAVES` cho lỗi `400`/`5xx` để test `F1b` xanh 100%).
  9. Trong `apps/student/src/lib/repos/vocab.ts`:
     - Giữ `parseErrorAndThrow(res, sentOrgId)` thuần (chỉ đọc `code` và ném `new HttpError(res.status, ..., { code, sentOrgId })`) cho 4 hàm `GET` (`fetchVocabOverview`, `fetchVocabSessionData`, `fetchVocabLibraryCourses`, `fetchVocabLibraryCourseDecks`).
     - Thêm `parseWriteErrorAndThrow(res, sentOrgId)` gọi `healStudentOrgMismatch()` khi `403 ORG_MISMATCH` trước khi ném `HttpError` cho 4 hàm `POST` (`postVocabAnswer`, `postVocabLearnCommit`, `acceptVocabSuggestion`, `dismissVocabSuggestion`).
     - Trong `fetchVocabAudioObjectUrl`: hỗ trợ retry `GET` 1 lần khi `sentOrgId` gặp `403 ORG_MISMATCH`, sau đó chuẩn hoá `Content-Type` qua `normalizeMediaType` và bắt buộc `type.startsWith("audio/")` trước khi tạo `URL.createObjectURL(new Blob([await res.blob()], { type }))` (nếu sai MIME thì ném `HttpError`).
- **Success criteria:** Toàn bộ suite unit test của `apps/student` (gồm cả `overview.test.tsx`, `student-shell.test.tsx`, `quiz-attempt-store.test.ts` và 3 file test ở Task 2.1) chạy xanh 100%.
- **Verify:** `pnpm --filter student test` thoát với mã `0` và không có test thất bại.

### Task 2.3 — Cập nhật kịch bản E2E E6 (`material-upload-student.spec.ts` kèm `orgBId`), chạy kiểm chứng E2E + cập nhật `CHANGELOG.md` & toàn bộ local gate
- **Goal:** Khai báo `orgBId`, đồng bộ kỳ vọng của kịch bản E6 trong `apps/e2e/specs/material-upload-student.spec.ts` sang `403 STUDENT_ORG_MISMATCH`, bổ sung kiểm thử tự phục hồi đa truy vấn trên trình duyệt thật khi `localStorage.active_student_org_id` trỏ vào org lạ, cập nhật `CHANGELOG.md`, và chạy xanh E2E + toàn bộ local gate.
- **Target files and symbols:**
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/apps/e2e/specs/material-upload-student.spec.ts` (comment dòng 18–19, khai báo `orgBId` tại dòng 295, và khối E6 dòng 447–485).
  - Modify: `/root/projects/worktrees/teacher-os-675-student-guard-fail-closed/CHANGELOG.md` (mục `## 2026-11-11`).
- **Steps:**
  1. Trong `apps/e2e/specs/material-upload-student.spec.ts`:
     - Cập nhật comment đầu file (dòng 18–19) phản ánh E6 kiểm tra `404` khi không kèm `?org=`, `403 STUDENT_ORG_MISMATCH` khi truyền `?org=${orgAId}`, và tự phục hồi `localStorage.active_student_org_id` cũ trên trình duyệt.
     - Ngay sau `const teacherBEmail = await signUpViaApi(...)` (dòng 292–294), khai báo `const orgBId = await orgIdForTeacherEmail(teacherBEmail);`.
     - Trong khối E6 (dòng 479–483): đổi `expect(unauthorizedWithOrg.status()).toBe(404)` thành `expect(unauthorizedWithOrg.status()).toBe(403)` kèm `expect(await unauthorizedWithOrg.json()).toMatchObject({ code: "STUDENT_ORG_MISMATCH" })`.
     - Tiếp theo trên `otherPage` (học viên chỉ thuộc Org B, đang đứng ở `STUDENT_ORIGIN` — trang `/` chạy đồng thời `useStudentMe` + `useStudentOverview`): đặt `await otherPage.evaluate((staleOrg) => localStorage.setItem("active_student_org_id", staleOrg), orgAId)` rồi `await otherPage.reload()`; khẳng định trang tự phục hồi không hiện màn lỗi `"Không thể truy cập cổng học viên"`, hiển thị tên `"Trung tâm Beta"`, và `await expect.poll(() => otherPage.evaluate(() => localStorage.getItem("active_student_org_id"))).toBe(orgBId)`.
  2. Trong `CHANGELOG.md` dưới `## 2026-11-11` → `### Changed`: thêm mục tiếng Việt cho `#675` mô tả `createStudentGuard` chuyển sang fail-closed `403 STUDENT_ORG_MISMATCH` (chỉ nhận `?org=` trên `GET`/`HEAD`, đồng bộ thứ tự với `GET /api/student/orgs`), Student Portal tự phục hồi `active_student_org_id` cũ an toàn trước truy vấn song song + cô lập đa tài khoản không tự retry lệnh ghi, và khoá cứng MIME/CORP/Referrer-Policy cho `mediaObjectResponse`.
  3. Chạy spec E2E `material-upload-student.spec.ts` với port override chuẩn (`8100/8101/8103/8104/8105`) và chạy toàn bộ local gate (`pnpm exec biome check .`, `pnpm check-types`, unit tests).
- **Success criteria:** Spec E2E `material-upload-student.spec.ts` xanh trọn vẹn và toàn bộ lint, typecheck, unit test đều xanh 0 lỗi.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-upload-student.spec.ts && pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/api test && pnpm --filter server test -- src/student.test.ts src/lib/media-response.test.ts src/routes/grading.test.ts src/routes/student-quiz-media.test.ts && pnpm --filter student test` thoát với mã `0`.

## Todo
- [x] Task 2.1: Viết bài test đỏ cho tự phục hồi đa truy vấn song song, cô lập `userId`, chống retry lệnh ghi (`MutationCache`, `QuizAttemptStore.drain()`, `vocab.ts`), `OrgSwitcher` và đăng xuất
- [x] Task 2.2: Cài đặt `student-org-storage.ts` + cơ chế tự phục hồi & cô lập trên `apps/student` và chạy xanh toàn bộ test `student`
- [x] Task 2.3: Khai báo `orgBId`, cập nhật E2E E6 (`material-upload-student.spec.ts`) + `CHANGELOG.md` và chạy xanh E2E cùng toàn bộ local gate

## Verification
- `pnpm --filter student test` (thoát 0)
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-upload-student.spec.ts` (thoát 0)
- `pnpm exec biome check .` (thoát 0)
- `pnpm check-types` (thoát 0)

## Success Criteria
- Học viên có `localStorage.active_student_org_id` cũ hoặc chuyển tài khoản trên cùng trình duyệt tự động được cô lập/chuyển về org hợp lệ ngay trong lần tải đầu mà không dính race màn lỗi `403`, trong khi mọi thao tác ghi mang org cũ bị chặn fail-closed mà không tự chạy lại trên org khác.
- E2E `material-upload-student.spec.ts` xanh trọn vẹn với khẳng định `403 STUDENT_ORG_MISMATCH` và kiểm thử tự phục hồi trình duyệt thật; `CHANGELOG.md` đầy đủ và toàn bộ local gate xanh.

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
