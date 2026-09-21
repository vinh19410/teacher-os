# Triage convention — M4 pilot (self-pilot)

Quy ước phân loại phản hồi pilot và SLA xử lý, dùng chung cho mọi entry trong [pilot log](./pilot-log.md). Nguồn yêu cầu: issue #68 + [plan M4](./plan.md) + [roadmap M4](../../docs/project-roadmap.md) (SLA: pilot blocker mở tối đa 1 ngày làm việc; 0 mất dữ liệu xác nhận sau reload).

**Provenance:** self-pilot (operator = chính tác giả, đổi phạm vi 2026-09-17) — mọi đánh giá severity/impact là tự đánh giá, mang author-bias; M5 decision record phải ghi rõ provisional.

## 1. Phân loại (checkable, không cảm tính)

| Loại | Định nghĩa kiểm tra được | Xử lý |
|---|---|---|
| **Blocker** | Chặn lớp học thật: KHÔNG điểm danh/buổi học thao tác được, MẤT dữ liệu đã xác nhận, KHÔNG đăng nhập được. Test: có workflow dạy học thật nào bị đứng hoàn toàn và không có cách lách trong app? | SLA fix **≤ 1 ngày làm việc** (mục 2); mở entry trong bảng blocker của pilot log với timestamp mở. |
| **Defect** | Phiền nhưng lách được: sai hiển thị, lưu được nhưng phải thao tác lại, chậm chịu được. Test: workflow vẫn chạy end-to-end bằng cách khác? | Ghi log; tổng hợp trong [weekly check-in](./weekly-check-in.md); không fix ngay trừ khi lặp lại gây blocker. |
| **Feature request** | Mong muốn có thêm / đổi hành vi thuộc CHƯA DÙNG ĐƯỢC tại M4 (assignment, report, settings persist, …). | CHỈ ghi log — scope khóa theo roadmap M4. Nếu pilot evidence chứng minh mục này chặn vận hành thật → **Decision required** với user, không tự làm. |

## 2. SLA blocker — "mở tối đa 1 ngày làm việc"

- **Đồng hồ:** từ timestamp **mở** (ghi ngay khi biết blocker) tới timestamp **đóng** (fix đã merge `main` → deploy tự động xong → post-deploy smoke pass → xác nhận dùng được).
- **Ngày làm việc:** Thứ 2–Thứ 6, loại ngày nghỉ theo **Lịch tuần** đã ghi trong [pilot log](./pilot-log.md) (lịch làm việc thật của operator). Thứ 7/Chủ nhật không tính vào đồng hồ, kể cả khi có hoạt động.
- **Công thức:** `ngày làm việc trôi qua` = số ngày làm việc (theo định nghĩa trên) có mặt trong khoảng từ ngày mở (đặc) đến ngày đóng (kể cả). Ví dụ: mở T6 → đóng T7/CN = 0; mở T6 → đóng T2 = 1; mở và đóng cùng ngày = 0.
- **Pass:** ≤ 1. **Fail (vi phạm DOD-5):** > 1 — ghi rõ `FAIL` trong bảng blocker, kèm nguyên nhân; milestone **NO-GO** cho tới khi có review nguyên nhân (mục 4). Không chỉnh sửa timestamp, không xóa dòng FAIL.

## 3. Mất dữ liệu xác nhận sau reload (DOD-4)

- **Định nghĩa "mất dữ liệu xác nhận":** dữ liệu do operator đã tạo/sửa và app đã báo thành công, nhưng **biến mất hoặc sai sau hard reload** (F5 / Cmd-Shift-R) trên production.
- **Xử lý:** ưu tiên cao nhất — dừng việc khác, điều tra theo [runbook Support triage](../../docs/production-release-runbook.md), khắc phục. **Mỗi case là NO-GO cho milestone** cho tới khi có kết luận nguyên nhân + xác nhận đã xử lý + ghi kết luận vào entry tương ứng trong pilot log.
- **Ghi nhận bình thường (không có sự cố):** mỗi lần kiểm tra reload định kỳ / sau deploy, thêm 1 dòng vào bảng "Xác nhận reload" của pilot log (ngày — thao tác tạo/sửa — kết quả — xác nhận). DOD-4 đạt khi xuyên suốt pilot mọi dòng đều "giữ nguyên" và 0 case mất dữ liệu chưa kết luận.

## 4. Quá SLA / NO-GO review

Khi blocker FAIL SLA hoặc có case mất dữ liệu: pilot vẫn có thể chạy tiếp, nhưng milestone không đóng. Cần: (1) entry log ghi rõ sự kiện; (2) review nguyên nhân (trễ đầu vào? fix quá lâu? deploy đỏ?); (3) hành động phòng lại; (4) user quyết định chấp nhận rủi ro hay kéo dài pilot. Không giấu, không bỏ dòng.

## 5. Đường fix blocker (production)

1. Tái hiện (nếu tái hiện được) trên production, ghi entry pilot log.
2. Branch fix → PR → tests + `pnpm check-types` + biome xanh → merge `main` (deploy tự động theo runbook).
3. Xác nhận Deploy Production workflow xanh → post-deploy smoke theo [runbook](../../docs/production-release-runbook.md).
4. Xác nhận operator dùng được → đóng blocker với timestamp đóng trong bảng pilot log.

## 6. Quy tắc ghi an toàn (áp dụng mọi artifact pilot)

- Không ghi tên/email/số điện thoại học viên hay giáo viên — dùng mã ẩn danh (VD: `HV-01`, `Lớp A`).
- Không dán raw Worker log, URL/query chứa token, cookie, hay giá trị env — chỉ trích dẫn đã làm sạch.
- Secret không bao giờ vào log/issue/PR/commit (ràng buộc chung của plan M4).

## Trạng thái

Template — chưa có phản hồi nào được phân loại (pilot chưa bắt đầu).
