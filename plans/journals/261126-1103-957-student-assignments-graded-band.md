# Journal — Sửa hiển thị Band điểm đã chấm trên tab Bài tập của học viên (#957)

- **Ngày:** 2026-11-26
- **Issue:** #957 (`Band điểm đã chấm ở /teacher/grading không hiện trên tab Bài tập của học viên`)
- **Follow-up:** #987 (`fix(design-compare): settle() in capture.mjs races DataProvider mount on screens without appSteps`)
- **Nhánh:** `vinh19410/band-i-m-ch-m-teacher-grading-kh-ng-hi-n-tr-n-ta`
- **Plan:** `plans/261126-0852-957-student-assignments-graded-band/plan.md`

## Tóm tắt kết quả

Đã sửa triệt để lệch dữ liệu giữa `/teacher/grading` và tab **Bài tập** trên trang chi tiết học viên (`/teacher/students/$studentId`):
- `apps/web/src/lib/repos/student-assignments.ts`: bổ sung `band: number | null` và `gradedAt: string | null` vào `StudentAssignmentRow`, chuyển tiếp điểm chấm từ `classAssignments[].targets[]` sau khi kiểm tra chặt miền điểm IELTS (`isBandStep`, 0–9 bước 0.5) và mốc thời gian hợp lệ (`Number.isFinite(Date.parse(...))`).
- `apps/web/src/routes/_auth/students/$studentId.tsx`: thêm type-guard phòng thủ `hasGradedBand`, render `formatBand(row.band)` (`font-semibold text-primary tabular-nums`) ở cột **Band** và `<StatusTag tone="ok">Đã chấm</StatusTag>` ở cột **Trạng thái** cho nhánh `kind === "class"` đã chấm, giữ nguyên `"—"` + `studentSubmissionStatus` cho bài chưa chấm/trắc nghiệm thuần và giữ nguyên nhánh legacy `kind === "grading"`.
- Kiểm thử: `student-assignments.test.ts` (17 tests), `$studentId.test.tsx` (8 tests tích hợp qua `DataProvider` thật), `teacher-grade-submission.spec.ts` (điều hướng SPA xác minh `kernelQueryKey` invalidation + opt-in `CAPTURE_POT_ISSUE=957` cho 6 ảnh POT 3 viewport × 2 theme + 320px reflow + focus bàn phím).

## Nguyên nhân gốc & Quyết định kỹ thuật

1. **Nguyên nhân gốc:** Khi `#319` bổ sung chấm bài Writing/Speaking và đưa `attemptId`/`gradedAt`/`band` vào `KernelSnapshot.classAssignments[].targets[]` (`snapshot.ts`) và `mapClassAssignments` (`class-assignments.ts`), phần selector `studentAssignmentRows` và hàm render `assignmentRowCells` viết trước đó từ `#317` bị bỏ sót nên luôn rơi mất `band`/`gradedAt` và hard-code `"—"` ở cột Band.
2. **Đổi cột Trạng thái sang `<StatusTag tone="ok">Đã chấm</StatusTag>` khi đã chấm:** Nhất quán với hàng legacy `kind === "grading"` ngay trong cùng bảng và xử lý luôn edge case flip-first (`submittedAt: null` quá hạn nhưng đã có `band` + `gradedAt` hợp lệ — không bao giờ hiện Band kèm `"Chưa nộp · quá hạn"`).
3. **Giữ cột Bài tập là plain text (không thêm `<Link to="/grading/$attemptId">`):** `$studentId.tsx` hiện lưu tab bằng `useState("profile")` chưa đồng bộ URL và `/grading/$attemptId` hard-code link quay về lớp (`← Về lớp`), nên thêm link ngay trong PR bugfix này sẽ gây trải nghiệm quay lại đứt gãy và vượt phạm vi `#957`.
4. **Kiểm tra miền dữ liệu qua biên snapshot (`isBandStep` + `Date.parse`):** Do `isSnapshotShape` chỉ kiểm khóa mảng cấp cao và cột `grade_scores` không có DB CHECK, chuẩn hóa chặt trong `studentAssignmentRows` (kèm bảo vệ `band === 0` không bị falsy) tránh hiển thị số vô nghĩa (`NaN`, `-1.0`, `99.0`) hoặc ghi đè sai trạng thái nộp.

## Sự cố, Điểm vướng & Cách xử lý

- **Worktree mới chưa có `apps/web/src/routeTree.gen.ts`:** Chạy `pnpm --filter web run check-types` trực tiếp báo 49 lỗi `TS2307` vì `apps/web/turbo.json` giao sinh route tree cho `web#build`. Xử lý theo đúng kiến trúc Turborepo bằng `VITE_SERVER_URL=http://localhost:8000 pnpm exec turbo run check-types --filter=web`.
- **Vitest timeout trên shared container:** `apps/web/vitest.config.ts` chỉ đặt `maxWorkers: 2` khi có `CI=1`; chạy local mặc định bung 6 worker tranh chấp RAM/CPU với các worktree khác gây timeout 5000ms ở 10 file không liên quan. Xác minh lại 12 file với `--maxWorkers=1` (201/201 pass), sau đó chạy trọn bộ `CI=1 pnpm --filter web test` đạt **217/217 file (2484/2484 test) pass**.
- **Race condition `capture.mjs:settle()` trên `t-student-detail`:** Cả 2 lần chạy `node scripts/design-compare/capture.mjs --screens t-student-detail` đều lỗi `Ảnh chụp trắng/rỗng` (`nonDominant=0.000%`) trong khi ảnh `.state/debug/t-student-detail-*.png` chụp ngay trong `catch` render đầy đủ tab `Hồ sơ` (`Phạm Bảo Ngọc`). Đã giữ phạm vi PR `#957` sạch (không sửa harness dùng chung), mở issue follow-up `#987` (label `ai-handle`, `bug`), và chứng minh trực tiếp tab **Bài tập** bằng 6 ảnh POT Playwright ở `plans/reports/957-student-assignments-band-*.png`.
- **Tránh bẩn working tree từ Test 3 của `teacher-grade-submission.spec.ts`:** Hoàn tác ngay `plans/reports/screenshots-383-grading-queue/` sau mỗi lượt chạy E2E spec.
