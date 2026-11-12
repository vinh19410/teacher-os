# Gaps & Open Questions — assignment-tests

## Open Questions

| ID | Câu hỏi | Bằng chứng dẫn | Ảnh hưởng nếu không chốt |
|----|---------|----------------|--------------------------|
| OQ-1 | Bộ đề soạn tay chuyển `status` sang `ready` bằng gì? PATCH contract nhận `status` (enum draft\|ready) nhưng UI builder không có control: `test-header-form.tsx` không chứa chuỗi "status" (grep = 0); payload submit là `assignmentTestCreateSchema` (`.strict()`, không có field status) nên không thể kèm status. Unique đường khác: publish exam-import đặt ready (`publish-to-bank.ts:463-483`). | `packages/api/src/contracts.ts:1217-1221` vs `apps/web/src/components/assignment-tests/test-header-form.tsx` (grep) + `test-builder-shell.tsx:493-500` | Bộ đề tạo tay mãi mãi `draft` → học viên không bao giờ thấy trong catalog tự luyện (BR-012). Có thể là gap UI hoặc ready chỉ dành cho luồng import. |
| OQ-2 | Cửa vào builder: link điều hướng thường tới `/assignments/tests/new` ở đâu? Grep toàn web src (loại test/routeTree/matcher) chỉ còn 3 chỗ: fallback trang preview rỗng (`preview.tsx:109` — nhưng preview chỉ mở được từ chính builder), redirect khi AI tắt (`import.tsx:44`), nút trong dialog hết credit (`insufficient-credits-dialog.tsx:40`). Không có entry ở sidebar, /assignments index, command-search, app-shell breadcrumb. | grep `to="/assignments/tests/new"` + `tests/new` toàn `apps/web/src` | Người dùng mới không tìm ra màn soạn bộ đề (e2e phải `page.goto` trực tiếp — `assignment-test-create.spec.ts:168`). |
| OQ-3 | `qStartOverride` dùng cho ca nào nghiệp vụ (đề gộp chia chương, trùng số chủ ý…)? Code chỉ mô tả cơ chế + test ca (c) minh họa; e2e chỉ test qua API (`tests.test.ts:272-299` gửi 14). | `apps/web/src/lib/test-ranges.test.ts:45-54`; `assignment-test.ts:70` schema | Ưu tiên giữ/bỏ tính năng; rủi ro người dùng đặt số gây trùng/lệch không có cảnh báo (không thấy validation chồng lấn dải). |
| OQ-4 | Tại sao UI không có control nhập `qStartOverride`? `setOverrides` chỉ chạy ở init edit/reset/rollback/remove-null — không có input người dùng (grep `setOverrides` trong `test-builder-shell.tsx`: các dòng 143,297,322,361,599 — đều không phải handler input). | grep NS2 | Tính năng server-side-only: chỉ ai dùng API trực tiếp mới đặt được. |
| OQ-5 | 500 `test write conflict` xảy ra khi nào? `insert().returning()` trống trên SQLite/D1 là đường hiếm; không có test nào cover. | `apps/server/src/routes/assignments/tests.ts:84` | Severity thật của E-013 chưa xác định được. |
| OQ-6 | Bộ đề có được xóa khi đang có attempt không? DELETE không kiểm attempt (chỉ 404/org) và FK attempt là SET NULL — hành ý "xóa được luôn, attempt giữ điểm" là inference từ schema, chưa thấy ghi nhận sản phẩm. | `tests.ts:135-161`; `quiz-attempt.ts:35-40,57-59` | Xác nhận chính sách xóa dữ liệu có bài làm. |
| OQ-7 | grammar/vocabulary có preset trong `ASSIGNMENT_TEST_PRESETS` nhưng bị chặn tạo test (schema `PRACTICE_SKILLS` + contract test). Preset 2 slot này dùng cho ai? | `contracts.ts:442-447` vs `contracts.ts:1203` + `assignment-rich-text-contract.test.ts:540-557` | Dead-config hay chuẩn bị tương lai. |
| OQ-8 | Trang danh sách bộ đề của giáo viên ở đâu? Snapshot trả `assignmentTests` nhưng web chỉ tiêu thụ ở edit route, datalist, preview-ref — không có route index `/assignments/tests`. | grep `.assignmentTests` (5 chỗ, không có list page) | Sau khi tạo/sửa, không có chỗ duyệt lại toàn bộ bộ đề (trừ catalog học viên, chỉ ready). |

## Gaps

| ID | Gap | Bằng chứng / negative search | Phân loại |
|----|-----|------------------------------|-----------|
| G-1 | Không có control chuyển test `status` trong UI (chi tiết OQ-1) | <details><summary>negative-search NS3</summary>`grep -n "status" apps/web/src/components/assignment-tests/test-header-form.tsx` → 0 kết quả; `grep '"ready"' components/assignment-tests/*.tsx` → chỉ badge của prompt, không của test.</details> | UI gap |
| G-2 | Không có đường điều hướng thường vào builder (OQ-2) | <details><summary>negative-search NS4</summary>`grep -rn "to=\"/assignments/tests/new\"\|to: \"/assignments/tests/new\"" apps/web/src --include=*.tsx --include=*.ts | grep -v "\.test\."` → 3 kết quả (preview fallback, import redirect, insufficient-credits). Không có sidebar/index/command-search.</details> | UI gap |
| G-3 | Mutation `delete-assignment-test` không có UI caller | <details><summary>negative-search NS1</summary>`grep -rn "delete-assignment-test" apps/web/src` → 4 kết quả: `lib/data-actions.ts:277` (định nghĩa type), `lib/repos/kernel.ts:289` (map DELETE), `lib/repos/assignment-tests.test.ts:163` (test mapping). Không có component dispatch.</details> | dead-path UI (🟡) |
| G-4 | Không có control UI cho `qStartOverride` (OQ-4) | <details><summary>negative-search NS2</summary>`grep -n "setOverrides" apps/web/src/components/assignment-tests/test-builder-shell.tsx` → 143 (init), 297 (reset khi đổi skill), 322 (rollback), 361 (reset null khi gỡ slot), 599 (discard draft). Không có đường từ input.</details> | UI gap |
| G-5 | Không có GET đơn cho một bộ đề (chỉ snapshot toàn bộ) — hợp pattern kernel nhưng nghĩa là mọi màn hình edit tải toàn bộ snapshot | `tests.ts` chỉ có POST/PATCH/DELETE/PUT; đọc qua `snapshot.ts:822-832` | thiết kế (ghi nhận) |
| G-6 | Không có validation chồng lấn dải câu khi `qStartOverride` gây trùng số giữa 2 part (server lẫn client) — đọc code `computeTestRanges` không phát hiện overlap | `test-ranges.ts:33-45`; schema chỉ ràng buộc `int > 0` (`contracts.ts:1236`) | rủi ro tiềm ẩn 🟡 |

## Conflicts

Không tìm thấy xung đột giữa các nguồn trong phạm vi feature: wording lỗi ở route khớp catalog mã (`TEST_PARTS_LOCKED` `tests.ts:277` ≡ `contracts.ts:1189`) và khớp test server (`tests.test.ts:460-463`); comment contract "cap ≤ số slot preset do route kiểm" khớp `.max(4)` + kiểm preset ở route; schema comment slot id khớp `ASSIGNMENT_TEST_PRESETS`.

## Inferred (suy luận có gốc, cần xác nhận)

| ID | Suy luận | Gốc |
|----|----------|-----|
| I-1 | Priority P0/P1/P2 trong bảng FR/NFR là phân tích (🔵), không phải tuyên bố code | Không có file priority trong repo |
| I-2 | Người dùng duy nhất của builder là giáo viên | `tests.test.ts:72` session role "teacher"; mọi route guard kernelCtx |
| I-3 | Hành vi "xóa đề giữ attempt" là chủ ý (SET NULL + hiển thị "Đề đã xoá") | `quiz-attempt.ts:35-40` |
| I-4 | Feature name `assignment-tests` | `docs/_reverse/reverse-plan.json:156`; thư mục component `assignment-tests` |
