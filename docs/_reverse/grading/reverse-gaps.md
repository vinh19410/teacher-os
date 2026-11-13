---
type: reverse-gaps
feature: grading
status: draft
updated: 2026-11-12
---

# Gaps, Conflicts, Inferred, Open Questions

## 1. Open Questions (cần BA/PO xác nhận)

| ID | Câu hỏi | Bằng chứng đã có | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Nhãn thương mại chuẩn: `class_teacher` = "Giáo viên đứng lớp", `ta` = "Trợ giảng" — ai phê duyệt cách gọi này trong SRS chính thức? | Chỉ thấy trong tooltip web: apps/web/src/components/grading/grade-form.tsx:26-27; apps/web/src/components/grading/ai-draft-panel.tsx:99-100 | Sai ngôn ngữ vai trong spec → nhầm quyền hạn |
| OQ-02 | Ưu tiên P0/P1… cho từng FR/NFR | Code không chứa priority; không tìm thấy ma trận ưu tiên trong repo docs về grading | Sai thứ tự triển khai lại |
| OQ-03 | Cơ sở số liệu: vì sao 30 lượt chấm nhanh/tháng; gói 100 Credit giá 149.000đ — tài liệu kinh doanh ở đâu? | packages/api/src/contracts.ts:4192, 4251-4260 (chỉ fix cứng số + chữ) | Sai định giá/hạn mức khi hiệu chỉnh |
| OQ-04 | Có cần thông báo cho giáo viên khi nháp AI xong hoặc lỗi? Hiện chỉ có poll 1s khi GV đang mở màn chấm | apps/web/src/routes/_auth/grading/$attemptId.tsx:75-77; templates.ts chỉ có thông báo cho học viên (105-130) | GV bỏ sót nháp đã xong |
| OQ-05 | KPI feature: mục tiêu giảm "bài chờ chấm", tỉ lệ AI thành công | Kicker đếm + dashboard reminder (S27:335-352; S12:263-266); không thấy bảng chỉ số | Không đo được thành công |
| OQ-06 | Hàng chờ quá tải: >500 dòng mỗi nhánh lọc thì hiển thị thế nào? Cần phân trang? | Negative search: grep "cursor|offset|LIMIT|limit(|page" trong S1 → chỉ `.limit(branchLimit)` L198/240 (500) và `.limit(1)` tra đơn; không có phân trang | Bài nộp bị "thất lạc" khỏi hàng chờ |
| OQ-07 | Trần số lần "Thử chấm lại AI"? Mỗi lần tốn/phat sinh occasion Credit riêng | Negative search: grep "retryCount" ∩ "max|cap|limit" trong S1+S2 → 0 dòng; retryCount chỉ tăng (S1:1292-1306) | Lạm dụng retry → tốn call LLM |
| OQ-08 | comment_bank sẽ nối vào màn chấm bằng cách nào (chèn nhận xét mẫu)? | Schema có (S25), route mount S10:3498, negative search grading UI (pattern "comment-bank|commentBank|CommentBank" → 0 kết quả) | Feature treo không có chủ |
| OQ-09 | Sweep chỉ chạy kèm request đọc (queue/attempt/wallet). Nếu không ai mở màn chấm, lượt treo + Credit giữ tồn tại tới khi nào được chấp nhận? | S3:38-39 + S1:726/951 + S11:32 (chỉ 3 điểm gọi); không thấy cron trong S16/S46 | Credit "kẹt" trong held lâu |

## 2. Gaps (thiếu hụt quan sát được trong code)

| ID | Mô tả | Bằng chứng / Negative search |
|---|---|---|
| G-1 | Tài liệu SRS mà code TỰ TRỊCH dẫn không tồn tại: `docs/selfomy-alignment/srs/selfomy-alignment-spec.md:111-112` | packages/api/src/contracts.ts:4246-4250 (bình luận trỏ tới spec); negative search: `ls docs/selfomy-alignment` → không tồn tại |
| G-2 | Bộ chuyển giọng nói → văn bản (STT) cho Speaking chưa được cắm: pipeline đọc `deps.getTranscriber` nhưng boot không inject → Speaking AI LUÔN rơi `AI_GRADING_NO_TRANSCRIPT` (TOS-31 chưa nối) | apps/server/src/lib/ai-grading/run-grading.ts:83, 371-383; negative search: grep "getTranscriber" toàn repo (ts/tsx) → chỉ xuất hiện trong run-grading.ts và run-grading.test.ts:631 (unit test tự inject fake transcriber — không phải boot production); app.ts/index.ts/boot.ts 0 kết quả |
| G-3 | Không có catalogue i18n: mọi thông điệp người dùng là chuỗi literal tiếng Việt hoặc hằng trong contracts → server/web có thể lệch chữ khi sửa một phía | Negative search: `find` thư mục i18n/locales/messages → rỗng; wording nằm ở S17:4238-4260 + literal trong S31/S32/S28 |
| G-4 | `assertStaffCap` là no-op: hàm "trần staff" nhận đầu vào rồi return ngay — ràng buộc giới hạn số nhân sự dùng AI chưa được thực thi | apps/server/src/lib/credits/wallet.ts:352-355 (thân hàm rỗng) |

## 3. Conflicts (mâu thuẫn trong chính source)

| ID | Mâu thuẫn | Hai phía |
|---|---|---|
| C-1 | Máy trạng thái nháp: bình luận contracts nói `manual_pending` là trạng thái kết (chỉ → published), nhưng code TOS-33 bổ sung `manual_pending → ai_processing` (Thử chấm lại AI) | packages/api/src/contracts.ts:2464-2468 (bình luận cũ) vs apps/server/src/routes/grading.ts:1292-1306 (CAS retry) + schema bình luận mới S23:7-23. Xử lý: theo CODE (có nhánh retry); bình luận contracts cũ → cần cập nhật |
| C-2 | Wording E-004 nói "không đọc được cấu trúc tệp này" — mượn ngữ cảnh exam-import (đọc tệp đề), trong khi ở grading AI đọc essay/transcript, không có "tệp" | packages/api/src/contracts.ts:4237-4239 (bình luận "spec Error Matrix" + nội dung chữ). Xử lý: quote NGUYÊN VĂN như code; đánh dấu 🟡 cần BA duyệt lại chữ |

## 4. Inferred (suy luận nghiệp vụ — không nâng cấp nhãn)

| ID | Suy luận | Cơ sở |
|---|---|---|
| I-1 | Mục tiêu nghiệp vụ: "AI giảm công chấm nhưng giáo viên vẫn là người quyết định cuối" | Kiến trúc nháp 2 lớp (S23:7-23), chữ tooltip, AC e2e S37 |
| I-2 | Chấm nhanh chỉ dành cho Writing vì Writing là khối lượng lớn nhất / không cần transcript | Điều kiện code S2:404-439 (chỉ nhánh Writing mới claim slot) |
| I-3 | "Bài chờ chấm" là chỉ số chính của feature (đặt ở kicker + dashboard reminder) | S27:335-352; S12:263-266 |
