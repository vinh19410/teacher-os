# Phase 2: Class Context, Level Parsing và Form Default

## Goal
Xây dựng hàm pure helper `bandFromClassLevel` với khả năng xử lý an toàn tiền tố, hậu tố, dải điểm (range), phân biệt lớp IELTS và TOEIC; truyền `classId` qua route `/assignments/new`, tự động trích xuất band của lớp để làm giá trị mặc định cho form soạn bài tập mà không làm gián đoạn luồng khôi phục nháp (draft); cập nhật `PromptComposer` dùng `ASSIGNMENT_BANDS`.

## Target files and symbols
- `apps/web/src/components/assignments/assignment-presets.ts`:
  - Thêm hàm `bandFromClassLevel(level: string, classType?: string): AssignmentBand | null`
- `apps/web/src/components/assignments/assignment-presets.test.ts`:
  - Unit tests cho `bandFromClassLevel` bao quát: `"Band 5.5"`, `"IELTS 5.5"`, `"5.5"`, `"Band 7.5+"`, `"IELTS 5.0–6.0"` (lấy target 6.0), `"Lớp 12 - Band 7.0"`, `"Khóa 2026 - Band 6.5"`, `"TOEIC 550"` (loại bỏ -> null), `"Phòng 602"` (null), `""` (null), `"8.5"` (null)
- `apps/web/src/components/classes/class-assignments-tab.tsx`:
  - Cập nhật link "Thêm đề mới" (dòng ~550) sang `<Link to="/assignments/new" search={{ classId: classGroup.id }}>`
- `apps/web/src/routes/_auth/assignments/new.tsx`:
  - Khai báo `validateSearch: (search: Record<string, unknown>) => ({ classId: typeof search.classId === "string" ? search.classId : undefined })`
  - Đổi `freshComposer(band?: AssignmentBand): ComposerValue`
  - Tra cứu lớp từ `data.classes` theo `classId` từ search params
  - Khởi tạo `composer` với band từ lớp (hoặc fallback `DEFAULT_ASSIGNMENT_BAND` khi không có/không parse được)
  - Đảm bảo các lần reset form (`discardDraftBanner`, "Tạo bài khác", "reset") giữ đúng band mặc định này
  - An toàn hoá ép kiểu: dùng kiểm tra danh sách hợp lệ thay vì ép kiểu mù quáng `value.band as AssignmentBand`
- `apps/web/src/components/assignments/prompt-composer.tsx`:
  - Dùng `ASSIGNMENT_BANDS` cho `ChipFilter` ở field "Band mục tiêu" thay vì mảng hardcoded 4 phần tử
- `apps/web/src/components/assignment-tests/test-builder-shell.tsx`:
  - Cập nhật type assertion / import `AssignmentBand` nếu có dùng cast band tương tự

## Tasks & Steps

### Task 2.1 — Viết helper `bandFromClassLevel` an toàn kèm unit tests
- Goal: Trích xuất chính xác giá trị `AssignmentBand` từ chuỗi mô tả trình độ lớp học, bảo vệ khỏi false positives của TOEIC, số phòng, số khóa và hỗ trợ dải điểm (range).
- Target files: `apps/web/src/components/assignments/assignment-presets.ts`, `apps/web/src/components/assignments/assignment-presets.test.ts`
- Steps:
  1. Viết test trước trong `assignment-presets.test.ts`:
     - `"Band 5.5"` -> `"5.5"`
     - `"IELTS 5.5"` -> `"5.5"`
     - `"5.5"` -> `"5.5"`
     - `"Band 7.5+"` -> `"7.5"`
     - `"Band 5.0"` -> `"5.0"`
     - `"Band 6"` -> `"6.0"`
     - Dải điểm: `"IELTS 5.0–6.0"` -> `"6.0"` (lấy target band), `"6.5 - 7.5"` -> `"7.5"`
     - Có tiền tố số: `"Lớp 12 - Band 7.0"` -> `"7.0"`, `"Khóa 2026 - Band 6.5"` -> `"6.5"`
     - Lớp không phải IELTS hoặc số lớn: `"TOEIC 550"` -> `null`, `"TOEIC 600–700"` -> `null`, `"Phòng 602"` -> `null`
     - Không hợp lệ / ngoài dải: `"B2"` -> `null`, `""` -> `null`, `"8.5"` -> `null`
     - Khi `classType === "communication"` hoặc khác `"ielts"`: trả về `null`
  2. Implement hàm `bandFromClassLevel` trong `assignment-presets.ts`:
     ```ts
     import { ASSIGNMENT_BANDS, type AssignmentBand } from "@teacher-os/api/contracts";

     export function bandFromClassLevel(
       level: string,
       classType?: string,
     ): AssignmentBand | null {
       if (classType && classType !== "ielts") return null;
       if (!level || typeof level !== "string") return null;

       // Loại trừ các lớp TOEIC hoặc có số điểm lớn (>= 100)
       if (/toeic/i.test(level) || /\b\d{3,}\b/.test(level)) return null;

       const normalize = (val: string): AssignmentBand | null => {
         const num = val.includes(".") ? val : `${val}.0`;
         return (ASSIGNMENT_BANDS as readonly string[]).includes(num)
           ? (num as AssignmentBand)
           : null;
       };

       // 1. Dải điểm (ví dụ: "IELTS 5.0–6.0", "5.5 - 6.5") -> lấy mốc mục tiêu (mốc sau)
       const rangeMatch = level.match(
         /(?:band|ielts)?\s*([4-9](?:\.[05])?)\s*[-–—]\s*([4-9](?:\.[05])?)\b(?!\d)/i,
       );
       if (rangeMatch) {
         const target = normalize(rangeMatch[2]);
         if (target) return target;
       }

       // 2. Chứa từ khóa rõ ràng "Band X.X" hoặc "IELTS X.X" (kèm "+" tuỳ chọn)
       const keywordMatch = level.match(
         /(?:band|ielts)\s*([4-9](?:\.[05])?)\+?\b(?!\d)/i,
       );
       if (keywordMatch) {
         const band = normalize(keywordMatch[1]);
         if (band) return band;
       }

       // 3. Số đơn lẻ có word boundary và trong dải điểm hợp lệ
       const standaloneMatch = level.match(/\b([5-8](?:\.[05])?)\+?\b(?!\d)/);
       if (standaloneMatch) {
         const band = normalize(standaloneMatch[1]);
         if (band) return band;
       }

       return null;
     }
     ```
- Success criteria: Toàn bộ unit test cases đều pass.
- Verify: `pnpm --filter web test src/components/assignments/assignment-presets.test.ts` exits 0.

### Task 2.2 — Truyền `search={{ classId }}` từ tab Bài tập lớp học
- Goal: Link "Thêm đề mới" trên tab bài tập của lớp mang theo `classId`.
- Target files: `apps/web/src/components/classes/class-assignments-tab.tsx`
- Steps:
  1. Tại dòng ~550 của `class-assignments-tab.tsx`:
     Thay:
     ```tsx
     <Link
       to="/assignments/new"
       className="font-medium text-muted-foreground text-xs hover:text-foreground"
     >
       Thêm đề mới
     </Link>
     ```
     Bằng:
     ```tsx
     <Link
       to="/assignments/new"
       search={{ classId: classGroup.id }}
       className="font-medium text-muted-foreground text-xs hover:text-foreground"
     >
       Thêm đề mới
     </Link>
     ```
- Success criteria: Link render href chứa `?classId=...`.
- Verify: `pnpm --filter web test src/components/classes/class-assignments-tab.test.tsx` exits 0.

### Task 2.3 — Cập nhật `PromptComposer` dùng `ASSIGNMENT_BANDS`
- Goal: Giao diện chọn band hiển thị đầy đủ 7 mức từ 5.0 đến 8.0.
- Target files: `apps/web/src/components/assignments/prompt-composer.tsx`
- Steps:
  1. Import `ASSIGNMENT_BANDS` từ `@teacher-os/api/contracts`.
  2. Tại dòng ~168:
     Thay: `options={["6.0", "6.5", "7.0", "7.5"]}`
     Bằng: `options={ASSIGNMENT_BANDS}`
- Success criteria: Chip filter hiển thị 7 options.
- Verify: `pnpm --filter web check-types` exits 0.

### Task 2.4 — Tiếp nhận `classId`, xác định default band và khởi tạo form `/assignments/new`
- Goal: Route `/assignments/new` đọc `classId` từ URL search, tự động gán band mặc định theo lớp, fallback về 7.0 an toàn và xử lý chuẩn xác toàn bộ vòng đời reset / discard draft.
- Target files: `apps/web/src/routes/_auth/assignments/new.tsx`
- Steps:
  1. Thêm `validateSearch` vào route:
     ```tsx
     export const Route = createFileRoute("/_auth/assignments/new")({
       validateSearch: (search: Record<string, unknown>): { classId?: string } => ({
         classId: typeof search.classId === "string" ? search.classId : undefined,
       }),
       component: NewAssignmentRoute,
     });
     ```
  2. Cập nhật `freshComposer(initialBand: AssignmentBand = DEFAULT_ASSIGNMENT_BAND): ComposerValue`:
     ```tsx
     function freshComposer(initialBand: AssignmentBand = DEFAULT_ASSIGNMENT_BAND): ComposerValue {
       return {
         skill: "writing",
         part: "task2",
         type: "",
         band: initialBand,
         ...emptyComposer("writing", ""),
         writing: null,
       };
     }
     ```
  3. Trong `NewAssignmentRoute`:
     - Lấy `const { classId } = Route.useSearch();`
     - Lấy danh sách lớp: `const { data } = useData();`
     - Tính `resolvedDefaultBand`:
       ```tsx
       const targetClass = classId ? data.classes?.find((c) => c.id === classId) : null;
       const classBand = targetClass ? bandFromClassLevel(targetClass.level, targetClass.type) : null;
       const resolvedDefaultBand = classBand ?? DEFAULT_ASSIGNMENT_BAND;
       ```
     - Khi khởi tạo state composer:
       Nếu có preview draft hoặc autosave draft thì draft vẫn thắng (spread đè lên `freshComposer(resolvedDefaultBand)`).
       Nếu không có draft, khởi tạo với `freshComposer(resolvedDefaultBand)`.
     - Đồng bộ an toàn: Dùng `useEffect` kiểm tra nếu `targetClass` được nạp sau mount và người dùng chưa từng tương tác sửa trường band (và không có draft được khôi phục), cập nhật composer với `resolvedDefaultBand`.
     - Tại `discardDraftBanner`: reset về `freshComposer(resolvedDefaultBand)`.
     - Tại `resetAll` hoặc sau khi submit thành công chọn "Tạo bài khác": gọi `freshComposer(resolvedDefaultBand)`.
     - Bảo vệ boundary khi submit payload:
       ```tsx
       band: (ASSIGNMENT_BANDS as readonly string[]).includes(value.band)
         ? (value.band as AssignmentBand)
         : DEFAULT_ASSIGNMENT_BAND,
       ```
- Success criteria: Form nhận đúng band khi có classId và fallback 7.0 khi không có.
- Verify: `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

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
