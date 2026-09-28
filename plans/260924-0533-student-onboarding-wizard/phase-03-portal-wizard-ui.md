---
phase: 3
title: "Portal — route /onboarding + wizard UI + gate 2 chiều"
status: completed
priority: P2
effort: 4h
dependencies: [2]
---

# Phase 3: Portal — route /onboarding + wizard UI + gate 2 chiều

## Goal

Học viên lần đầu vào portal (đã verify, chưa onboarding) bị `/` đẩy sang `/onboarding`, chạy wizard 4 bước, bấm "Hoàn thành" → `POST /api/student/onboarding` → invalidate queries → về `/` overview.

Điểm load-bearing: (1) Gate đặt tại `_auth/index.tsx` **giữa nhánh `meQuery.error` (dòng 36-40) và nhánh `overviewQuery.error` (dòng 42-56)** — NHƯNG trước `const me = meQuery.data` (dòng 58). Nhánh `meQuery.error` đã xử lý user chưa verify (403 EMAIL_UNVERIFIED) nên đặt gate sau nhánh đó là an toàn; đặt SAU nhánh `overviewQuery.error` sẽ khiến lỗi overview thoáng qua (5xx/network) kẹt user chưa onboarding ở màn lỗi, không bao giờ tới được wizard. (2) `isLoading` (dòng 23, 32-34) giữ nguyên chờ CẢ `meQuery` lẫn `overviewQuery` (tối thiểu diff) — tradeoff: user chưa onboarding trả giá 1 lần fetch overview rồi mới bị redirect (user mới provision thì overview rỗng, nhanh; cohort hiện hữu chậm hơn đúng một lần đầu — xem Risks plan). (3) Route `/onboarding` không được vào `beforeLoad` của `_auth/route.tsx` (D2) — guard session hiện có giữ nguyên.

## Files to Create / Modify

- Modify: `apps/student/src/lib/repos/student.ts` (thêm `submitOnboarding` + `useSubmitOnboarding`)
- Create: `apps/student/src/components/onboarding/onboarding-steps.tsx` (labels + option button + 4 step components + summary — tất cả presentational, controlled)
- Create: `apps/student/src/components/onboarding/onboarding-wizard.tsx` (state lifted + validate từng bước + progress + submit)
- Create: `apps/student/src/routes/_auth/onboarding.tsx` (route `/onboarding` + gate chiều ngược)
- Modify: `apps/student/src/routes/_auth/index.tsx` (gate chiều xuôi: chưa onboarding → `/onboarding`)
- Create: `apps/student/test/onboarding.test.tsx`

Không đổi: `_auth/route.tsx` (D2); `sign-up-form.tsx` (redirect `/` sau sign-up giữ nguyên — gate ở `/` lo phần còn lại); packages/ui (không thêm dependency, không có stepper).

## Tasks & Steps

### Task 3.1 — Repo `submitOnboarding` + mutation hook
- Goal: đường gửi dữ liệu wizard theo đúng transport pattern portal hiện có.
- Target files: `apps/student/src/lib/repos/student.ts`.
- Steps:
  1. Thêm fetch function theo pattern `fetchStudentMe` (dòng 16-44 — `credentials: "include"`, HttpError với `code` từ body):
     ```ts
     export async function submitOnboarding(
         payload: StudentOnboardingPayload,
     ): Promise<StudentMe> {
         const res = await fetch(`${getApiBaseUrl()}/api/student/onboarding`, {
             method: "POST",
             headers: { Accept: "application/json", "Content-Type": "application/json" },
             credentials: "include",
             body: JSON.stringify(payload),
         });
         // !res.ok -> throw HttpError(res.status, ..., { code }) — copy nguyên khối
         // xử lý lỗi của fetchStudentMe (dòng 25-40)
         ...
         return studentMeSchema.parse(await res.json());
     }
     ```
     Import type `StudentOnboardingPayload` vào block `@teacher-os/api/contracts` sẵn có (dòng 2-7).
  2. Thêm mutation hook (đặt cạnh `useStudentOverview` dòng 84-90):
     ```ts
     export function useSubmitOnboarding() {
         const queryClient = useQueryClient();
         return useMutation({
             mutationFn: submitOnboarding,
             onSuccess: (data) => {
                 // Ghi thẳng DTO mới vào cache TRƯỚC khi navigate — nếu chỉ
                 // invalidate (void, fire-and-forget), gate ở "/" đọc cache cũ
                 // (onboardingCompletedAt null) trong cửa sổ refetch và đẩy
                 // user ngược vào wizard vừa bị unmount (mất state).
                 queryClient.setQueryData(["student", "me"], data);
                 void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
             },
         });
     }
     ```
     `setQueryData(["student","me"], data)` dùng đúng queryKey của `useStudentMe` (dòng 78); `invalidateQueries` chỉ còn việc làm mới `["student","overview"]` (dòng 86). Query client có `staleTime: 60_000` (`apps/student/src/lib/query-client.ts:42`) nên không set/invalidate sẽ đứng dữ liệu cũ.
- Success criteria: type-safe; mutation invalidates cả 2 query; không thêm dependency.
- Verify: `pnpm --filter student check-types` → exit 0.

### Task 3.2 — Step components + labels (presentational, controlled)
- Goal: 4 bước + màn tổng hợp render thuần từ props để test được bằng `renderToStaticMarkup` và tái dùng kiểu nút nhất quán.
- Target files: `apps/student/src/components/onboarding/onboarding-steps.tsx` (file mới).
- Steps:
  1. Labels tiếng Việt (map từ enum keys, import enums từ `@teacher-os/api/contracts`):
     - `EXAM_LABELS`: `ielts` → "IELTS", `toeic` → "TOEIC".
     - `TARGET_LABELS`: hiển thị nguyên chuỗi giá trị ("5.0"…"8.0+", "450"…"990").
     - `GOAL_LABELS`: `study-abroad` → "Du học", `career` → "Thăng tiến công việc", `certification` → "Thi chứng chỉ", `communication` → "Giao tiếp tự tin", `academic` → "Học tập & nghiên cứu", `other` → "Khác".
     - `HOUR_LABELS`: `under-1` → "Dưới 1 giờ", `1-2` → "1–2 giờ", `2-3` → "2–3 giờ", `3-plus` → "Hơn 3 giờ".
  2. `OptionButton` — nút lựa chọn tái dùng (một lựa chọn): props `{ selected: boolean; label: string; description?: string; onClick: () => void; }`; style theo token portal: chọn = `border-accent/40 bg-accent-soft text-fg`, chưa chọn = `border-line bg-bg text-fg hover:border-line-hover`; `rounded-[var(--radius-lg)]`, focus `focus-visible:shadow-[var(--focus-ring)]` (token precedent `student-error-view.tsx:96-99, 123-126`).
  3. `ExamInterestStep` — props `{ value: ExamInterest | null; onSelect: (v: ExamInterest) => void }`; heading "Bạn đang quan tâm chứng chỉ nào?"; 2 `OptionButton`.
  4. `TargetScoreStep` — props `{ examInterest: ExamInterest; value: string | null; onSelect: (v: string) => void }`; heading "Điểm mục tiêu của bạn?"; options lấy từ `examInterest === "ielts" ? IELTS_TARGET_BANDS : TOEIC_TARGET_SCORES`; sub-label IELTS thêm chữ "Band" phía trước giá trị ("Band 6.5").
  5. `LearningGoalsStep` — props `{ value: LearningGoalOption[]; onToggle: (goal: LearningGoalOption) => void; note: string; onNoteChange: (v: string) => void }`; heading "Mục tiêu học tiếng Anh của bạn là gì?"; 6 lựa chọn dạng chip multi-select (chọn = accent-soft, toggle được nhiều); dưới cùng `<label>` "Ghi chú thêm (tùy chọn)" + `Textarea` import từ `@teacher-os/ui` (`packages/ui/src/components/textarea.tsx` — đã có sẵn, precedent import từ ui: `__root.tsx:6` Toaster) với `className` override về token portal (`border-line`, focus `--focus-ring` — token mặc định của ui Textarea là `border-input/ring-ring` kiểu shadcn, lệch hệ portal nên phải override), `maxLength={200}`.
  6. `StudyHoursStep` — props `{ value: DailyStudyHourOption | null; onSelect: (v: DailyStudyHourOption) => void }`; heading "Mỗi ngày bạn dành bao nhiêu thời gian cho tiếng Anh?".
  7. `OnboardingSummary` — props `{ answers: StudentOnboardingPayload }`; heading "Xác nhận thông tin của bạn"; 4 dòng "chứng chỉ / điểm mục tiêu / mục tiêu học (labels join ", " + note nếu có) / thời gian mỗi ngày" + nút "Quay lại" (props `onBack`).
  8. Mọi nút đều `type="button"`; KHÔNG nút "Bỏ qua" ở bất kỳ bước nào (D7).
- Success criteria: các component thuần (không state nội bộ ngoài note đã lift qua props), không import router/query — chỉ render.
- Verify: `pnpm --filter student check-types` → exit 0.

### Task 3.3 — `OnboardingWizard`: state, validate từng bước, progress, submit
- Goal: điều phối wizard; mọi validation chạy cả client (zod từng bước) lẫn server (payload schema).
- Target files: `apps/student/src/components/onboarding/onboarding-wizard.tsx` (file mới).
- Steps:
  1. State lifted:
     ```ts
     type OnboardingAnswers = {
         examInterest: ExamInterest | null;
         targetScore: string | null;
         learningGoals: LearningGoalOption[];
         learningGoalsNote: string;
         dailyStudyHours: DailyStudyHourOption | null;
     };
     const [step, setStep] = useState(0); // 0..3 bước hỏi; 4 = tổng hợp
     ```
     KHÔNG default ngầm (D7): mọi lựa chọn xuất phát `null`/`[]`.
  2. Validate từng bước bằng zod schema con dựng từ enums contracts (client zod precedent `apps/student/src/lib/auth-schemas.ts`):
     - bước 0: `z.enum(EXAM_INTERESTS).safeParse(state.examInterest)`.
     - bước 1: target ∈ `examInterest === "ielts" ? IELTS_TARGET_BANDS : TOEIC_TARGET_SCORES`.
     - bước 2: `state.learningGoals.length >= 1` (unique bảo đảm bởi toggle logic) và `state.learningGoalsNote.length <= 200`.
     - bước 3: `z.enum(DAILY_STUDY_HOUR_OPTIONS).safeParse(state.dailyStudyHours)`.
     Nút "Tiếp tục" `disabled` khi bước chưa valid (kèm `aria-disabled`).
  3. Progress indicator tự dựng: thanh 4 segment — `flex gap-2`, segment hoàn thành `bg-accent`, còn lại `bg-line`, `rounded-full h-1.5`; text "Bước {min(step+1,4)}/4". KHÔNG dùng packages/ui (không có stepper).
  4. Nút "Quay lại" hiện ở bước ≥ 1 và màn tổng hợp (`setStep(s => s - 1)`).
  5. Màn tổng hợp (step 4): render `<OnboardingSummary answers={payload} onBack={...} />` với payload dựng từ state (`learningGoalsNote: state.learningGoalsNote.trim() || undefined`) + nút "Hoàn thành":
     - submit = `useSubmitOnboarding().mutateAsync(payload)`.
     - pending: nút disabled + `<Loader2 className="animate-spin">` + nhãn "Đang lưu…" (pattern `student-error-view.tsx:129-133`).
     - lỗi: `toast.error("Không thể lưu thông tin. Vui lòng thử lại.")` (sonner precedent `sign-up-form.tsx:4,43`) — mutation giữ ở màn tổng hợp để user bấm lại.
     - thành công: gọi prop `onCompleted()` (route truyền `navigate`) — component KHÔNG gọi useNavigate trực tiếp để test được bằng renderToStaticMarkup ngoài router context.
  6. Props: `{ onCompleted: () => void }`.
- Success criteria: wizard không thể vượt bước chưa valid; không nút skip; submit lỗi không mất answers.
- Verify: `pnpm --filter student check-types` → exit 0.

### Task 3.4 — Route `/onboarding` + gate 2 chiều
- Goal: D2 — user chưa onboarding rơi vào wizard từ `/`; user đã onboarding không vào được wizard.
- Target files: `apps/student/src/routes/_auth/onboarding.tsx` (mới); `apps/student/src/routes/_auth/index.tsx` (sửa).
- Steps:
  1. Tạo `apps/student/src/routes/_auth/onboarding.tsx` (imports đầy đủ: `createFileRoute`, `Navigate`, `useNavigate` từ `@tanstack/react-router`; `Loader` từ `@/components/loader`; `useStudentMe` từ `@/lib/repos/student`; `isHttpError` từ `@/lib/query-client`; `StudentErrorView` từ `@/components/overview/student-error-view`; `OnboardingWizard` từ `@/components/onboarding/onboarding-wizard`):
     ```tsx
     export const Route = createFileRoute("/_auth/onboarding")({
         component: StudentOnboardingPage,
     });

     function StudentOnboardingPage() {
         const navigate = useNavigate();
         const { session } = Route.useRouteContext();
         const sessionEmail = session?.data?.user?.email;
         const meQuery = useStudentMe();

         if (meQuery.isLoading) return <Loader />;
         if (meQuery.error) {
             const err = meQuery.error;
             const code = isHttpError(err) ? err.code : undefined;
             // User chưa verify vào thẳng /onboarding vẫn thấy màn chờ xác thực cũ
             return <StudentErrorView code={code} userEmail={sessionEmail} />;
         }
         if (meQuery.data?.student.onboardingCompletedAt != null) {
             return <Navigate to="/" />;
         }
         return <OnboardingWizard onCompleted={() => void navigate({ to: "/" })} />;
     }
     ```
     `void navigate(...)` theo pattern `login.tsx:39-40`. Bố cục trang: centered card theo pattern `student-error-view.tsx:95-99` (`max-w-[480px]` → dùng `max-w-[560px]` cho wizard, cùng token `border-line bg-surface/50 rounded-[var(--radius-lg)] shadow-[var(--elev-raised)]`), KHÔNG bọc `StudentShell` (onboarding là flow một lần, không cần sidebar).
  2. Gate chiều xuôi trong `apps/student/src/routes/_auth/index.tsx`: chèn **giữa nhánh `meQuery.error` (kết thúc dòng 40) và nhánh `overviewQuery.error` (bắt đầu dòng 42)** — KHÔNG chèn sau nhánh overviewQuery.error (xem Goal):
     ```tsx
     if (meQuery.data?.student.onboardingCompletedAt == null) {
         return <Navigate to="/onboarding" />;
     }
     ```
     Import `Navigate` từ `@tanstack/react-router`. KHÔNG đụng gì khác trong file (các nhánh error giữ nguyên để user chưa verify/lỗi bridge vẫn thấy đúng màn; nhánh `meQuery.error` đứng TRÊN gate nên user chưa verify không bao giờ bị redirect).
- Success criteria: 4 trạng thái của route `/onboarding` đúng: loading / màn error (kể cả verify) / Navigate `/` khi đã onboarding / wizard; `/` không render overview cho user chưa onboarding.
- Verify: `pnpm --filter student check-types` → exit 0; `pnpm --filter student build` → exit 0 (file-based route sinh type).

### Task 3.5 — Component tests
- Goal: gate cơ học cho copy + cấu trúc wizard (hành vi full flow do e2e Phase 4).
- Target files: `apps/student/test/onboarding.test.tsx` (mới; pattern `apps/student/test/overview.test.tsx:1-20` — `renderToStaticMarkup`, `vi.mock("@/lib/auth-client")`; vitest config `apps/student/vitest.config.ts` dùng tsconfigPaths cho alias `@/`).
- Steps:
  1. Mock: `vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }))` (copy `overview.test.tsx:9-13` — cần vì `StudentErrorView` import authClient).
  2. `ExamInterestStep`: render với `value={null}` → html chứa "Bạn đang quan tâm chứng chỉ nào?", "IELTS", "TOEIC"; KHÔNG chứa "Bỏ qua".
  3. `TargetScoreStep`: render với `examInterest="toeic"` → chứa "990" và KHÔNG chứa "8.0+"; render với `examInterest="ielts"` → chứa "Band 6.5".
  4. `LearningGoalsStep`: render với `value={["career"]}` → "Thăng tiến công việc" xuất hiện; textarea có `maxlength="200"` (renderToStaticMarkup serialize attribute).
  5. `StudyHoursStep`: render → chứa "Dưới 1 giờ", "Hơn 3 giờ".
  6. `OnboardingSummary`: render với answers đầy đủ → chứa 4 nhãn mục + giá trị labels (vd "Du học", "1–2 giờ").
  7. `OnboardingWizard`: bọc `<QueryClientProvider client={new QueryClient()}>` (import từ `@tanstack/react-query`) rồi render — assert: bước đầu hiển thị câu hỏi bước 1; có "Bước 1/4"; không có nút "Hoàn thành" (chỉ xuất hiện ở màn tổng hợp).
- Success criteria: toàn bộ test apps/student pass.
- Verify: `pnpm --filter student test` → exit 0.

## Verification (cả phase)

- `pnpm --filter student test` → exit 0.
- `pnpm --filter student check-types` → exit 0.
- `pnpm check` → exit 0.
- Smoke dev (thủ công, không bắt buộc CI): `pnpm dev` → đăng ký tài khoản mới trên `http://localhost:8003/login` → verify qua URL trong console (`[mail:log]`) → vào `/` tự chuyển `/onboarding` → chạy 4 bước → "Hoàn thành" → về `/` thấy "Chào"; F5 không quay lại `/onboarding`.

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
