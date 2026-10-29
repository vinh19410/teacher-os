# Phase 1. Kiểm kê và đề xuất gating (chỉ đọc)

Ngày: 2026-10-29. Chưa sửa code, chưa ghi gì lên prod.

## 1.1 Migration 0035–0056 (22 file)

Không có DROP COLUMN, không có NOT NULL thiếu default trên bảng đã có dữ liệu prod. Các điểm cần chú ý:

| Migration | Nội dung | Rủi ro trên dữ liệu prod |
| --- | --- | --- |
| 0038, 0039 | Dựng lại `vocab_deck`, `vocab_card` (DROP + RENAME) | Không. Bảng vocab do 0036 tạo, prod chưa có dữ liệu. |
| 0041 | Dựng lại `quiz_attempt` (DROP + RENAME, thêm `test_id`, `mode`, CHECK) | Có cascade FK tới `quiz_attempt_annotation`. Migration đã backup/restore. Prod có 0 attempt nên không mất gì. Vẫn phải rehearse ở Phase 3. |
| 0042 | UPDATE `class.syllabus_id` theo `syllabus.class_id` | Ghi dữ liệu lớp. Phase 3 kiểm lớp có syllabus. Không xoá dòng. |
| 0044, 0049, 0055, 0056 | ADD COLUMN NOT NULL có DEFAULT | An toàn. Đây là loại làm trang 500 nếu code chạy trước migration (runbook), nên thứ tự migrate trước deploy là bắt buộc. |
| 0036, 0038, 0047, 0048, 0050, 0051 | Unique index mới | Chỉ trên bảng mới tạo. Không đụng dữ liệu cũ. |
| 0040, 0053 | File rỗng (0 dòng) | Cần xác nhận là cố ý (journal vẫn ghi). |

## 1.2 Trạng thái D1 prod (đọc bằng `wrangler d1 execute --remote`, SELECT)

- Ledger `d1_migrations`: 35 bản ghi, tương ứng 0000–0034. Khớp giả định "0034 là cuối". Journal tại `2ba23a22` cũng dừng ở `0034_familiar_jamie_braddock`.
- `quiz_attempt_annotation` chưa tồn tại (do 0035 tạo). Điều này đúng thứ tự: 0041 chạy sau 0035.
- Dữ liệu: 8 org, 20 user, 5 lớp, 4 học viên, 0 quiz attempt.
- Chưa kiểm secret prod (6.3).

## 1.3 Bề mặt lộ ra khi deploy

| Tính năng | Điểm vào | Trạng thái nếu deploy nguyên trạng | Đề xuất |
| --- | --- | --- | --- |
| Nhập đề AI + chấm nháp AI | Nút "Nhập đề AI" ở `/assignments/tests/import`, route `/api/exam-imports`, chấm nháp | **MỞ.** Gating chỉ dựa vào `env.AI` (`apps/server/src/index.ts:134,138`), mà `alchemy.run.ts:169` khai báo binding `AI` vô điều kiện, nên getter luôn trả extractor thật. Mọi org mới có ví Credit mặc định `TRIAL_CREDITS` (`lib/credits/wallet.ts:91`), nên giáo viên prod dùng được AI thật và tốn Neuron Cloudflare. | **Fail-closed bằng cờ rõ ràng** (không dựa vào "không bind"): thêm cờ env, mặc định tắt trên prod. Ẩn nút. Plan 2.1 cần sửa: "không bind AI" không đủ vì binding vô điều kiện. |
| Ví Credit | Ví tự tạo khi dùng AI | Lazy-create, chỉ sinh khi gọi. Tắt AI thì không phát sinh. | Giữ. |
| Admin console | Worker admin, `ADMIN_EMAILS` | `ADMIN_EMAILS` mặc định rỗng = không ai là admin (`alchemy.run.ts:128`). Worker vẫn deploy. | Giữ, không set biến. Xác nhận ở 6.3. |
| SePay Bank Hub | Route ngân hàng | Thiếu secret nào thì 503 `BANKHUB_DISABLED`. | Giữ, xác nhận secret prod rỗng ở 6.3. |
| Cổng học viên | Worker `student` + domain `topology.studentHost` (`alchemy.run.ts:283-292`) | Deploy luôn, gắn domain. | **Cần Vinh quyết.** |
| Từ vựng, báo cáo phụ huynh | Route/UI giáo viên | Chưa khảo sát điểm vào. | Khảo sát tiếp ở đầu Phase 2. |
| Thư viện đề (admin) | `LIBRARY_AUDIO` bucket | Tạo bucket, không lộ nếu không có admin. | Giữ. |

## Phát hiện làm thay đổi plan

1. Plan 2.1 giả định "prod không bind `AI` để getter trả `undefined`". Sai với code hiện tại: binding khai báo vô điều kiện. Phải thêm cờ gating server-side (và UI ẩn theo cờ).
2. Ledger prod xác nhận 0034, không cần giả định nữa. Rehearse 0034 → 0056 vẫn cần vì staging đã migrate liên tục.

## Quyết định cần Vinh (cổng của Phase 1)

1. Cổng học viên: ship hay ẩn?
2. AI: tắt hẳn trên prod, hay bật cho riêng org của Vinh? Đề xuất mặc định: tắt hẳn bằng cờ.
3. Ngày/giờ release.
