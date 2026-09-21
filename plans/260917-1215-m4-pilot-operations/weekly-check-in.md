# Weekly self check-in — M4 (self-pilot)

Mẫu **tự tổng kết tuần** theo [pilot log](./pilot-log.md). Operator (chính tác giả) điền cuối mỗi tuần pilot; mọi con số **dẫn xuất từ bảng pilot log** (tally, entries, blocker, reload), không nhớ lại cảm tính.

Quy ước phân loại + SLA: [triage-convention.md](./triage-convention.md). Bối cảnh: [plan M4](./plan.md) · [roadmap M4](../../docs/project-roadmap.md).

## Cách dùng

1. Cuối tuần: copy khối "Template tuần" dưới đây, đổi tiêu đề thành `## Tuần N (YYYY-MM-DD → YYYY-MM-DD)`, điền từ pilot log.
2. Mỗi mục ghi kèm nguồn: `(tally tuần)` / `(entries PL-xxx…PL-yyy)` / `(bảng blocker)` / `(bảng reload)` — để ai đọc cũng đối chiếu được.
3. Sau khi điền: thêm 1 dòng con trỏ vào mục "Weekly check-in" của pilot log (`Tuần N → weekly-check-in.md#tuần-n-…`).

Deviation note (so với umbrella phase-04 "ghi kết quả vào log"): nội dung tổng hợp tuần nằm tại file này, pilot log chỉ giữ con trỏ — tránh log phình to và giữ log thuần sự kiện.

**Author-bias reminder:** đây là self check-in — người vận hành tự đánh giá chính mình. Friction vô hình (thói quen lách lỗi mà không nhận ra) là rủi ro đã biết lớn nhất của self-pilot; mục "câu hỏi phản biện" dưới đây bắt buộc trả lời thật. M5 decision record dùng các tuần này làm evidence → phải ghi rõ **provisional**.

## Template tuần (copy khi dùng — không điền vào đây)

```markdown
## Tuần N (YYYY-MM-DD → YYYY-MM-DD)

### Hoạt động (tally tuần)
- Ngày dùng app / ngày làm việc: X/Y (Lịch tuần: …) — đối chiếu DOD-2 (≥8/10).
- Lớp đã vận hành: …

### Phản hồi mới trong tuần (entries)
| severity | frequency | workflow impact | số entry | entry ids |
|---|---|---|---|---|
| blocker | … | … | … | PL-… |
| defect | … | … | … | PL-… |
| feature-request | … | … | … | PL-… |

### Blocker & SLA (bảng blocker)
- Mở: … · Đóng: … · Ngày làm việc trôi qua: … · SLA: PASS/FAIL
- Nếu FAIL: nguyên nhân + hành động phòng lại (triage mục 4).

### Reload (bảng reload)
- Số lần xác nhận: … · Kết quả: giữ nguyên/mất dữ liệu (nếu có: link kết luận điều tra).

### Câu hỏi phản biện (trả lời lời thật, author-bias guard)
1. Tuần này có workflow nào mình đã "lách" mà đáng lẽ phải là blocker không?
2. Có thao tác nào mình lặp lại ≥2 lần vì app làm chậm/sai không (ứng viên defect)?
3. Nếu một giáo viên ngoài dùng hệ thống này tuần vừa rồi, họ sẽ kêu ca điều gì đầu tiên?

### Pain ranking (top 3, theo tần suất × độ ảnh hưởng)
1. … 2. … 3. …

### Focus tuần sau
- …

### Ghi chú cho M5 (provisional)
- …
```

## Các tuần đã điền

_Chưa có tuần nào — pilot chưa bắt đầu._
