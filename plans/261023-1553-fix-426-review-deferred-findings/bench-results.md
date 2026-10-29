# Bench work-per-keystroke — trang soạn đề (#426 F3)

Môi trường: macOS arm64 (M-series), Node qua vitest, fixture listening 4 slot × 40 câu, 1 slot dirty draft (passage ~16KB), 50 lần tính derived lấy trung bình. Thước đo theo kongming plan-gate: **số lần gọi hàm parse mỗi keystroke** (các hàm thuần không đổi — chỉ đổi tần suất gọi) + wall-time khối derived (`effectiveParts` + `validateTestReady` + `buildTestOutline` + `buildAnswersOverview`).

| Chỉ số | BEFORE | AFTER | Ghi chú |
|---|---|---|---|
| `partInputFromValue` / keystroke | 4.0 | **1.0** | chỉ parse part đang sửa (unit test spy khẳng định 1 lần) |
| `partValueFromDto` / keystroke (trong derived) | 3.0 | **0.0** | bản lưu lấy từ `savedInputsBySlot` memo theo `partsBySlot` |
| Wall-time khối derived (ms) | 2.52 | **0.75** | ~3.4×; chạy trước cùng fixture đo được 1.01 → 0.46 (nhiễu máy, tỷ lệ giữ nguyên) |

Ngoài khối derived: `useDeferredValue(drafts)` tách `readyIssues`/`sections`/`answerRows` ra khỏi frame gõ phím (React 19, priority thấp — trễ ~1 frame); `PartForm` dirty-check memo baseline canonical string (baseline stringify 1 lần/baseline thay vì mỗi render). Hành vi được bảo vệ bởi unit test `effective-parts.test.ts` (5 case) + test hành vi dirty trong `part-form.test.tsx`.
