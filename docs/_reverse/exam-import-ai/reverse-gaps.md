# reverse-gaps.md — exam-import-ai

## OQ (Open Questions — code không nói, cần chủ sở hữu nghiệp vụ)

| ID | Câu hỏi | Bằng chứng / lý do không trích được từ code | Ảnh hưởng nếu trả lời khác giả định |
|----|---------|---------------------------------------------|-------------------------------------|
| OQ-1 | Ưu tiên (P0/P1/P2) của từng FR là gì? | Code không chứa priority; chỉ 4 plan đặt `priority: P0` ở mức toàn plan (`plans/.../plan.md:5`). Reverse gán P0/P1/P2 theo trọng lượng rủi ro tiền/UI — mang tính suy luận | Thứ tự phát triển/regression nếu làm lại |
| OQ-2 | `AI_ENABLED` (server) và `VITE_AI_ENABLED` (web) đang bật ở môi trường nào? | Default "false" tại `packages/infra/alchemy.run.ts:121-123`; không tìm thấy file `.env` thực trong repo (chỉ schema env). e2e tự bật `apps/e2e/playwright.config.ts:95` | Nếu production chưa bật → cả feature ẩn hoàn toàn; nếu bật mà binding AI vắng → mọi POST 503 |
| OQ-3 | Người dùng tìm lại bản nháp cũ bằng đường nào nếu mất URL `?job=`? | Không có route danh sách job (`grep exam-import` web routes chỉ có import.tsx/new.tsx); GET `/:id` chỉ theo id | Có thể cần "Lịch sử nhập đề"; hiện tại chỉ discovery qua banner trùng |
| OQ-4 | Vòng đời file đề gốc trên R2: retention? xóa khi nào? | Không có DELETE endpoint (`exam-imports.ts` chỉ POST/GET/PATCH); sweep chỉ release credit + đổi status, không xóa file (`release-stale.ts:76-99`); chỉ nhánh reserve-thua POST xóa file (`exam-imports.ts:308-309`) | Chi phí lưu trữ tăng vô hạn; retry sau khoảng lâu vẫn được (file còn) |
| OQ-5 | Trần Credit cá nhân (US-010/TOS-49) có còn là yêu cầu sống không? | `assertStaffCap` no-op `apps/server/src/lib/credits/wallet.ts:352-355`; route vẫn gọi `exam-imports.ts:278,524` | Nếu nghiệp vụ kỳ vọng "hạn mức theo vai" thì hiện tại không có bảo vệ |
| OQ-6 | Chất lượng bóc tách của `@cf/meta/llama-4-scout-17b-16e-instruct` và ngưỡng `reviewConfidence: 0.8` đã được xác thực chưa? | Không có metric/eval trong code; plan TOS-24 liệt kê là "Rủi ro" (`plan.md:98`); model do plan chọn (cần người duyệt xác nhận — `plan.md:105`) | Đổi model/threshold ảnh hưởng trực tiếp số câu gắn nhãn rà soát |
| OQ-7 | Request-đồng-bộ 120s có nằm trong giới hạn runtime của Workers production (subrequest/execution)? | Plan TOS-24 D5 chọn phương án này vì `waitUntil` ~30s (`plan.md:40`); risk "đóng tab giữa chừng" ghi nhận tại `plan.md:99` | Nếu platform cắt sớm: job treo `processing` tới sweep 150s; người dùng thấy lỗi mạng thay vì kết quả |
| OQ-8 | `ta`/`class_teacher` được xem nội dung đề + file gốc của org (GET không gate `canImportExam`) — đây có phải chủ ý nghiệp vụ cuối cùng? | Comment route `exam-imports.ts:372-376` nói "member trong org được xem theo plan D8 (TA chỉ xem)"; code GET chỉ 401 + org-scope | Nếu muốn chặn `ta` xem đề thì phải thêm gate GET |
| OQ-9 | Spec gốc `docs/selfomy-alignment/...` (US-005, UC, wireframe, ERD) ở đâu? | Plans cite các file này nhưng thư mục không tồn tại trong repo (find 0) | Không đối chiếu được wording gốc ngoài 3 message đã đóng băng trong contracts |
| OQ-10 | Message E-001 hứa "mua thêm gói 100 Credit (149.000đ)" — khi nào có màn mua/Top-up để lời hứa khả dụng? | Dialog chỉ có "Đóng"/"Soạn đề thủ công" (`insufficient-credits-dialog.tsx:22-38`); plan TOS-27 D5 ghi "TOS-43 bổ sung sau" | Người dùng có ý định mua sẽ bị bế tắc trong UI |
| OQ-11 | `heldCredits` là cột lưu mức giữ chuẩn (default 5) — có kịch bản giá thay đổi theo lượt trong tương lai không? | Cột `exam-import-job.ts:29-30` + comment "hiện luôn 5"; mọi lần ghi là `CREDIT_COSTS.examImport` | Rule hoàn theo `job.heldCredits` (sweep) đã sẵn sàng cho giá khác nhau |
| OQ-12 | `error_code`/`error_reason` là cột text tự do — có cần enum ràng buộc ở DB/schema migration? | Schema không constraint (`exam-import-job.ts:35-38`); code chỉ ghi E-004 + 3 reason (`run-import.ts:282-296`, `release-stale.ts:82-92`) | Rủi ro dữ liệu bẩn nếu code mới ghi giá trị lạ |

## Gap (khoảng trống đặc tả)

| ID | Gap | Bằng chứng | Đề xuất |
|----|-----|------------|---------|
| G-1 | Luồng "mua Credit" bị tham chiếu trong thông điệp lỗi nhưng chưa tồn tại | OQ-10 + `insufficient-credits-dialog.tsx:5-10` | Thêm link/tickets TOS-43 hoặc đổi message trung thực |
| G-2 | Không có phép đo success cho chất lượng AI (SC chỉ đo tiền/trạng thái) | Toàn bộ test khóa hành vi (tiền/trạng thái); không test chất lượng extract (fake extractor ở mọi e2e) | Bổ sung eval sampling với đề thật |
| G-3 | Tiến trình upload là giả lập (`Progress value={80}` cố định) | `import.tsx:373-376` | Ghi nhận UX; cân nhắc indeterminate thật |
| G-4 | Không có audit log nghiệp vụ cho publish (ai xuất bản đề nào) | `exam_import_job.publishedTestId` không ghi actor; `credit_usage_log` không cover publish (0 Credit) | Nếu cần truy vết: thêm log riêng |

## Conflict (mâu thuẫn trong nguồn)

| ID | Mâu thuẫn | Bên A | Bên B | Phân xử |
|----|-----------|-------|-------|---------|
| C-1 | "Mua thêm gói 100 Credit (149.000đ)" vs không có luồng mua | Message E-001 (`contracts.ts:4275-4276`) | Capability hiện tại (dialog 2 nút, không mua) | CODE wins: message nói sai khả năng hệ thống → Conflict mở chờ TOS-43 |
| C-2 | Plan TOS-24 D5 ghi "POST (multipart)" + thứ tự "lưu R2 → INSERT job → reserve" vs code raw-body + "INSERT job → reserve → put file" | Plan (`plan.md:40`) | Code (`exam-imports.ts:228-340`, `run-import.ts:153-163`) | CODE wins (R1: test khóa raw-body + thứ tự); plan stale |
| C-3 | Thanh "Đang bóc tách (tối đa 120 giây)" + progress 80% vs không có tín hiệu tiến độ thật | UI hiển thị đang tiến hành | Code không có cơ chế báo tiến độ | CODE wins: chỉ là trạng thái chờ; không phải % thật |

## Inferred (suy đoán từ ≥2 chỗ code — nhãn 🔵)

| ID | Suy đoán | Hậu thuẫn |
|----|----------|-----------|
| I-1 | Feature thuộc cụm AI chung: một cờ `AI_ENABLED` điều khiển cả extractor (import) lẫn grader (chấm bài) | `ai-gate.ts:14-24` trả cả `getExamExtractor` + `getAiGrader` từ cùng binding; `app.ts:151-167` hai getter cùng hợp đồng fail-closed |
| I-2 | Dedupe là yêu cầu bảo mật dữ liệu org, không chỉ UX: index riêng + gate role lookup + org-scope + 2 lớp | `exam-import-job.ts:53-59` (index), `exam-imports.ts:343-352` (gate lookup), `dedupe.ts:32-39` (org-scope), tests `exam-imports.test.ts:1094-1214` |
| I-3 | Bộ e2e AC-001..004 là nghiệm thu chính của US-005: 4 spec đúng thứ tự 4 plan, cờ AI bật riêng cho e2e | specs `ac-001..004`, `playwright.config.ts:95`, plans TOS-24..27 phase e2e |
| I-4 | Ví Credit được dựng tối thiểu cho feature này rồi mở rộng cho AI grading (không phải feature ví riêng) | `wallet.ts:24-26` comment "TOS-30 mở rộng từ exam_import"; `actionType` union 2 giá trị; plan TOS-24 "Quyết định người dùng 2026-10-27: TOS-24 dựng lõi Ví Credit tối thiểu" |
