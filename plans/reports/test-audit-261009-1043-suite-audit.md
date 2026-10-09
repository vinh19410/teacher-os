# Audit bộ test — teacher-os (2026-10-09, branch `develop` @ 5717a67)

Chế độ: report-only. Không sửa test, source hay workflow nào.

## Tổng quan

| Lớp | File | Test | Thời gian (tuần tự, không cache) | Kết quả |
| --- | --- | --- | --- | --- |
| server (vitest, libsql in-memory + migration thật) | 44 | 647 | 36.9s | pass |
| web (vitest, env node) | 126 | 1389 | 20.6s | pass |
| student | 22 | 250 | 2.1s | pass |
| packages api/auth/infra | 16 | 156 | 4.7s | pass |
| landing + scripts (node --test) | 3 | 16 | <1s | pass |
| E2E Playwright (CI, run push gần nhất) | 52 spec | 136 pass, 1 skip | 8.4m (job 9.6m) | pass |

`pnpm turbo run test --force --concurrency=1`: 72.9s tổng. Không thấy `.only`, `.todo`, `xit`, snapshot,
assert tautology, file test không có assertion. Các file test bị xoá từ 06/2026 đều đi cùng commit gỡ
tính năng tương ứng (`/settings`, `/assignments/bank`, tạo học sinh thủ công). Commit redesign #350 xoá
assertion của BrandPanel/NotificationBell vì prop/variant đó đã bị bỏ, không phải nới lỏng để xanh.

Điểm mạnh: test server chạy qua chuỗi handler thật (`buildApp`) với migration thật; độ phủ cách ly
tenant/authz dày (`kernel.test.ts`: 22 assert 403, 78 assert 404, ~74 tham chiếu cross-org);
`scripts/ci-workflow.test.mjs` khoá contract của workflow CI.

## Phát hiện

### Important

**1. Test "contract" regex trên source bảo vệ hành vi bằng chuỗi ký tự — chứng minh được false-green.**
12 file, ~260 assertion `expect(src).toMatch(...)`, lớn nhất là
`apps/web/src/lib/kernel-runtime.contract.test.ts` (109), `class-detail-sessions-tab.contract.test.ts` (31),
`profile.contract.test.ts` (29), các `*-peel.contract.test.ts`, `avatar.contract.test.ts`, phần cuối
`components/layout/sidebar.test.tsx`, `packages/auth/src/avatar-policy.test.ts`.

Mutation spot-check (bản sao tạm ở `/tmp`, đã xoá, worktree không đổi), file `routes/_auth/profile.tsx`:

| Mutation | Ý nghĩa | Kết quả `profile.contract.test.ts` |
| --- | --- | --- |
| Bỏ `return;` sau `toast.error` (dòng 113) | Bug thật: lưu tên lỗi vẫn hiện toast "Đã cập nhật" và invalidate router | **Survived** (15/15 pass) |
| Đổi `error` → `updateError` | Refactor giữ nguyên hành vi | **Fail** (false-red) |

Test tên "updates via authClient.updateUser and toasts on the error branch" không phát hiện được chính bug
nó tuyên bố bảo vệ. E2E `profile.spec.ts` chỉ phủ happy path, nên nhánh lỗi không có lớp nào bảo vệ.

Rủi ro cao nhất nằm ở các contract toàn vẹn dữ liệu chỉ được khoá bằng regex, và `grade-modal.tsx` không
có test hành vi nào:
- `kernel-runtime.contract.test.ts:538` — giữ ổn định `operationId` của comment khi outcome unknown để
  server dedupe (server có test dedupe, client thì không);
- `kernel-runtime.contract.test.ts:554` — reset điểm khi mở modal cho bài khác ("grading B would silently
  submit A's persisted scores");
- `:94`, `:252` — modal chỉ đóng khi kết quả đã refresh.

Ghi chú: comment đầu file (`classes-peel.contract.test.ts`: "Not a component test") cho thấy đây là phong
cách có chủ đích, nên việc thay thế là quyết định của bạn (xem câu hỏi cuối).

Sửa đề xuất: tách logic quyết định ra hàm thuần rồi unit test (vd. chọn/giữ/xoá `operationId`, điều kiện
reset theo `[open, assignmentId]`), hoặc thêm test render có tương tác (cần `happy-dom`/`jsdom` +
Testing Library; hiện web dùng `environment: "node"` và `renderToStaticMarkup` ở 54 file). Ưu tiên:
grade-modal → profile save → các form modal "close on refreshed". Giữ regex chỉ cho invariant kiến trúc
thật (vd. "repo không import data-store"). Mỗi test thay thế phải fail với mutation M1 ở trên.

**2. E2E không chặn deploy production.**
`deploy.yml` chạy khi push `main` với `needs: [quality]` (biome/test/types/build), không có E2E.
`e2e.yml` chạy song song, độc lập. `gh api .../branches/main/protection` trả 403 ("Upgrade to GitHub Pro
or make this repository public") nên không có required check nào. Hệ quả: merge vào `main` khi E2E đỏ,
hoặc E2E đỏ trên chính commit push, vẫn deploy prod.

Sửa đề xuất: thêm job e2e vào `deploy.yml` và để `deploy` `needs: [quality, e2e]` (hoặc trigger
`workflow_run` khi E2E success). Chi phí: deploy chậm thêm ~10 phút. Cần cập nhật
`scripts/ci-workflow.test.mjs` cùng lúc.

### Minor

**3. Test chụp screenshot one-off nằm trong suite E2E vĩnh viễn.**
`invoice-detail.spec.ts:380` ("screenshots at 3 viewports") và `student-tuition-summary.spec.ts:164`
ghi PNG vào `plans/261008-*/screenshots/` (file đang được track). Mỗi lần chạy E2E local đều làm bẩn
worktree; CI tốn thời gian cho artefact không ai dùng. Assertion duy nhất là một `toBeVisible`. Chưa có
timing per-test. Sửa: gate bằng env (vd. `E2E_SCREENSHOTS=1`) hoặc chuyển sang script riêng.

**4. Scaffold E2E ở root chưa hoàn thiện.**
`tests/example.e2e.ts` + `e2e.config.ts` (commit 44a045f, 2026-10-08) trỏ `http://localhost:3000`,
trong khi dev stack dùng 8000/8001/8003; test chỉ assert `body` visible. Không chạy trong CI, nhưng
`pnpm test:e2e` sẽ không chứng minh được gì. Sửa: trỏ về 8001 và viết hành trình thật, hoặc gỡ.

**5. `retries: 1` trên CI che flake.** `apps/e2e/playwright.config.ts`: test fail rồi pass lại vẫn xanh.
Run gần nhất không có flaky nên tác động hiện tại thấp. Sửa: giữ retry nhưng fail job khi có flaky
(`--fail-on-flaky-tests`), hoặc ít nhất in số flaky ra summary.

**6. Log request làm ngập output test server.** 2.514 block stdout từ middleware logger trong một lần
chạy server; failure thật bị chôn trong log CI. Sửa: tắt logger khi `VITEST`/`NODE_ENV=test`.

**7. Assertion phủ định dựa trên sleep.** `routes/_auth/tuition/$invoiceId.test.tsx:337,363`:
`setTimeout(20)` rồi `not.toHaveBeenCalled()`; sẽ pass sai nếu lệnh gọi xảy ra sau 20ms. Sửa: dùng fake
timers hoặc flush promise tường minh.

**8. Quality job chạy trùng trên push `main`.** `ci.yml` và `deploy.yml` cùng chạy biome/test/types/build
trên cùng SHA. Đây là cơ hội giảm chi phí, chuyển cho `optimize`, không phải lỗi bảo vệ.

### Không cần làm
- `profile.spec.ts:143` `test.skip` có lý do rõ (cần OAuth Google thật, gate bằng `E2E_GOOGLE_OAUTH`).
  Dòng `expect(email).toBeTruthy()` ở cuối là filler, assertion thật là `waitForURL`.
- `.catch(() => {})` ở `student-quiz-take-review.spec.ts:628` nằm trong listener phụ; test vẫn assert
  `startedAttemptId` ngay sau đó nên không nuốt failure.

## Sửa đã áp dụng (2026-10-09, branch `test/behavioral-contract-tests`, chưa commit)

Theo quyết định của người dùng: (1) đổi toàn bộ test regex-trên-source sang test hành vi;
(2) chặn deploy prod khi E2E fail.

**Phát hiện 2 — E2E chặn deploy.** `e2e.yml` thành reusable (`workflow_call`) và bỏ trigger `push`
(mỗi lần push `main` đã chạy E2E qua `deploy.yml`); `deploy.yml` thêm job `e2e` và `deploy`
`needs: [quality, e2e]`. `scripts/ci-workflow.test.mjs` có test mới (fail khi bỏ `e2e` khỏi `needs`
— đã kiểm bằng mutation). Cập nhật `README.md` và `docs/production-release-runbook.md`.

**Phát hiện 1 — test hành vi.** Đã gỡ 9 file regex (`*-peel`, `enroll-student`, `profile`,
`class-detail-sessions-tab`, `kernel-runtime` contract, `avatar.contract`) và phần regex trong
`sidebar`, `notif-panel`, `avatar-policy`, `reset-password-form` (student). Thay bằng:
- Harness `apps/web/src/test/kernel-harness.tsx`: DataProvider + command bus thật, chỉ giả kernel
  ở tầng `fetch`; `test/kernel-form-contract.tsx`: hợp đồng chung của 10 modal ghi (đóng chỉ sau
  refresh, lỗi giữ modal, chặn gửi lại sau committed/unknown, bỏ qua Escape khi đang lưu);
  `test/router-mock.tsx`.
- 30 file test mới/mở rộng (route: dashboard, lịch tuần, lớp, học viên, syllabus, học phí, hồ sơ,
  bài tập; modal: grade, report, invoice, add-class, syllabus/module/lesson; DataProvider; luồng
  `returnUrl` đăng nhập + guard `_auth`; round-trip better-auth cho `/update-user`).
- Ranh giới import (`lib/repos/*` không được import data-store/provider) chuyển sang biome
  `noRestrictedImports` — không phải hành vi, nhưng là công cụ đúng và CI có chạy.
- Bỏ không thay: giới hạn "< 500 dòng" (không phải hành vi); `routes-matcher` đã có drift guard;
  toast theo kết quả đã có `kernel-outcome.test.ts`.

Bằng chứng: khoảng 120 mutation trong worktree tạm, mọi mutation hợp lệ đều bị bắt sau khi bổ sung
case. Mutation M1 của audit (toast thành công khi lưu tên lỗi) giờ bị bắt; M2 (đổi tên biến) giờ
sống sót — đúng mong muốn với test hành vi.

**Bug thật phát hiện nhờ test mới:** `ImportSyllabusModal` không hiển thị lỗi khi server từ chối
(vd. 409) — đã sửa bằng cách hiện `error` như các modal khác.

**Chi phí:** unit tuần tự không cache 45,1s (baseline audit 72,9s — chênh lệch chủ yếu do biến
động máy; web 22,9s so với 20,6s). Web: 1.497 test (trước 1.389), song song 3/3 lần xanh. Một test
có sẵn (`$invoiceId.test.tsx`) flaky khi tải nặng vì `await import()` trong thân test → đổi sang
import tĩnh, không đổi expectation. Gate: biome, check-types, `pnpm test`, `pnpm build` đều xanh;
E2E có mục tiêu (`class-sessions-manage-modal`, `syllabus-detail-import-overwrite`) 3/3 pass.

**Ngoài phạm vi, đã ghi nhận:** `components/schedule/lesson-modal.tsx` là code chết (đã tạo task
riêng); `GradeModal` khoá ô nhận xét sau khi điểm đã lưu nên không sửa được nhận xét bị từ chối
(comment trong code ngụ ý cho sửa); `CreateReportModal` cho đóng bằng Escape khi đang lưu và lỗi
không có `role="alert"`; trang `/assignments/$assignmentId` có nhận xét mặc định viết cứng.

## Khoảng trống chưa kiểm
- Mutation chỉ lấy mẫu 2 lỗi trên 1 file; các file regex khác được suy ra cùng cơ chế, chưa đo riêng.
- Chưa chạy E2E local; số liệu E2E lấy từ run CI gần nhất.
- Chưa đo timing per-test của E2E nên không ước lượng được tiết kiệm từ phát hiện 3.

## Câu hỏi chưa giải quyết
1. Test regex-trên-source là quy ước có chủ đích của repo. Bạn muốn thay dần bằng test hành vi (bắt đầu
   từ grade-modal) hay giữ phong cách này và chỉ bổ sung test hành vi cho contract toàn vẹn dữ liệu?
2. Có chấp nhận deploy prod chậm thêm ~10 phút để E2E trở thành gate bắt buộc không?
