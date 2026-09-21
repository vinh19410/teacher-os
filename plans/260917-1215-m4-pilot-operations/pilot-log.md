# Pilot log — M4 (self-pilot)

Log vận hành pilot, **append-only**: chỉ thêm entry/bảng dòng mới ở dưới, không sửa/xóa dòng đã ghi (sửa admin chỉ cho lỗi chính tả, giữ nguyên nội dung sự kiện).

**Provenance:** self-pilot — operator = chính tác giả (đổi phạm vi 2026-09-17, [#53]). Evidence là tự ghi, mang **author-bias**: friction UX mà chỉ người ngoài mới gặp có thể bị bỏ sót → M5 decision record phải ghi rõ provisional.

**Trạng thái:** template rỗng — pilot chưa bắt đầu. Mọi bảng dưới đây chưa có dòng nào; điền khi pilot chạy thật, không tạo dòng mẫu có ngày.

Quy ước phân loại phản hồi + SLA: [triage-convention.md](./triage-convention.md). Tổng kết tuần: [weekly-check-in.md](./weekly-check-in.md). Bối cảnh: [plan M4](./plan.md) · [roadmap M4](../../docs/project-roadmap.md).

## Quy tắc ghi an toàn

- Không ghi tên/email/số điện thoại học viên — dùng mã ẩn danh (`HV-01`, `Lớp A`).
- Không dán raw Worker log, URL/query chứa token, cookie, giá trị env — chỉ trích dẫn đã làm sạch.
- Secret không bao giờ vào log.

## Format entry (3 trường bắt buộc)

Mỗi phản hồi/quan sát = 1 entry, id tăng dần `PL-NNN`, gồm:

| Trường | Giá trị cho phép |
|---|---|
| `ngày` | YYYY-MM-DD |
| `nguồn` | self-observation / post-deploy smoke / reload check / weekly check-in |
| `mô tả` | hiện tượng + workflow nào bị ảnh hưởng (đã ẩn danh) |
| `severity` (bắt buộc) | `blocker` / `defect` / `feature-request` — định nghĩa [triage](./triage-convention.md) |
| `frequency` (bắt buộc) | `mỗi buổi` / `hằng ngày` / `thỉnh thoảng` / `một lần` |
| `workflow impact` (bắt buộc) | `chặn lớp học` / `phiền nhưng lách được` / `mong muốn` |
| `hành động` | ghi log / Decision required / link PR fix / đã kết luận … |

Định dạng dòng (không dùng bullet lồng):

```text
PL-001 · 2026-09-XX · self-observation · <mô tả đã ẩn danh>
  severity: blocker · frequency: mỗi buổi · workflow impact: chặn lớp học
  hành động: <link PR / ghi log / kết luận>
```

## Lịch tuần (working schedule)

Ghi lịch làm việc thật của operator **ngay buổi đầu pilot** (mỗi tuần 1 dòng, cập nhật khi đổi lịch). "Ngày làm việc" cho tally và SLA đối chiếu mục này — không tự suy (thứ 7/CN mặc định không phải ngày làm việc trừ khi lịch tuần ghi rõ).

| Tuần (T2→CN) | Ngày làm việc | Ghi chú |
|---|---|---|

_Chưa có dòng — pilot chưa bắt đầu._

## Tally hằng ngày (DOD-2: ≥8/10 ngày làm việc, liên tục ≥2 tuần)

| Ngày | Ngày làm việc? (theo Lịch tuần) | Có dùng app | Lớp đã vận hành | Ghi chú |
|---|---|---|---|---|

_Chưa có dòng — pilot chưa bắt đầu._

## Blocker SLA tracking (DOD-5: 0 blocker mở quá 1 ngày làm việc)

Công thức đếm ngày làm việc + quy tắc FAIL/NO-GO: [triage-convention.md mục 2](./triage-convention.md).

| # (link entry) | Mở (YYYY-MM-DD HH:MM) | Đóng (YYYY-MM-DD HH:MM) | Ngày làm việc trôi qua | SLA | Nguyên nhân nếu FAIL |
|---|---|---|---|---|---|

_Chưa có dòng — pilot chưa bắt đầu._

## Xác nhận reload (DOD-4: 0 mất dữ liệu xác nhận sau reload)

Định nghĩa "mất dữ liệu xác nhận" + quy trình sự cố: [triage-convention.md mục 3](./triage-convention.md). Thủ tục kiểm tra chi tiết 3 lớp evidence sẽ do phase-02 umbrella bổ sung (reload-checklist, khi chuẩn bị onboard); đến lúc đó chỉ cần link từ đây.

| Ngày | Thao tác tạo/sửa | Kết quả hard reload | Xác nhận |
|---|---|---|---|

_Chưa có dòng — pilot chưa bắt đầu._

## Weekly check-in

Kết quả tuần nằm tại [weekly-check-in.md](./weekly-check-in.md) (mỗi tuần 1 section). Chốt mỗi tuần bằng 1 dòng con trỏ tại đây (sau khi section tuần đã điền):

_Chưa có dòng — pilot chưa bắt đầu._

## Entries (append-only)

Thêm entry mới ở dưới cùng. Không entry nào được thiếu 3 trường bắt buộc.

_Chưa có entry — pilot chưa bắt đầu._
