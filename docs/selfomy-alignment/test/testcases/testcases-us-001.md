---
**STT:** 01
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-001 — Verify Giáo viên độc lập mở Bảng điều khiển thấy khu vực "Việc cần làm hôm nay" hiển thị đủ 3 thẻ: "Ca học hôm nay chưa điểm danh", "Bài tập quá hạn chấm > 24h", "Học phí đến hạn / quá hạn thu"
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** Giáo viên độc lập thấy đủ 3 thẻ nhắc việc trên Bảng điều khiển
**Description:** Vai trò không bị giới hạn phạm vi phải thấy đủ 3 thẻ; thiếu thẻ nào là lỗi phân quyền ngược (ẩn nhầm thẻ Học phí vốn chỉ ẩn với Trợ giảng).
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherOnly) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Truy cập /dashboard
**Expected:** Thẻ "Bài tập quá hạn chấm > 24h" hiển thị
**Test Data:** —

**Step:** 3
**Action:** Truy cập /dashboard
**Expected:** Thẻ "Học phí đến hạn / quá hạn thu" hiển thị
**Test Data:** —
---
**STT:** 02
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-002 — Verify thẻ "Ca học hôm nay chưa điểm danh" hiển thị đúng số ca học trong ngày hiện tại chưa hoàn tất điểm danh
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** Bộ đếm "Ca học hôm nay chưa điểm danh" khớp số ca chưa điểm danh khi đã có ca đã lưu
**Description:** Bộ đếm chỉ tính ca trong ngày hiện tại chưa hoàn tất điểm danh; dữ liệu trộn ca đã lưu và chưa lưu để bắt lỗi đếm cả ca đã xong.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học, trong đó 1 ca đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay → mở Điểm danh tổng theo ngày, điểm danh 1 ca và bấm "Lưu điểm danh ca học"; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3, US-001 AC-002)

**Step:** 1
**Action:** Mở Bảng điều khiển
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị bộ đếm 2 ca học
**Test Data:** 3 ca học hôm nay, 1 ca đã lưu điểm danh
---
**STT:** 03
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-003 — Verify thẻ "Ca học hôm nay chưa điểm danh" chỉ liệt kê tối đa 3 ca học kèm khung giờ và tên lớp khi trong ngày có từ 4 ca chưa điểm danh
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Thẻ ca học chưa điểm danh cắt danh sách ở 3 ca khi có 4 ca chờ
**Description:** Boundary của danh sách rút gọn trong thẻ: bộ đếm vẫn là 4 nhưng chỉ liệt kê 3 ca kèm khung giờ và tên lớp.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 4 ca học chưa điểm danh (seed: teacherToday4) (dựng: đăng nhập tài khoản test → tạo 4 lớp có lịch học trong ngày hiện tại; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "4 ca" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Truy cập /dashboard
**Expected:** Dòng "IELTS 6.5A (18:00 – 19:30)" hiển thị
**Test Data:** —
---
**STT:** 04
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-004 — Verify thẻ "Bài tập quá hạn chấm > 24h" đếm đúng số bài Writing/Speaking thuộc 3 trạng thái {Chờ chấm tay, AI đã chấm nháp, Đang rà soát} đã quá 24 giờ kể từ lúc nộp
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** Thẻ bài quá hạn chấm đếm đủ cả 3 trạng thái chờ đã quá 24 giờ
**Description:** Oracle là tổng số bài Writing/Speaking ở "Chờ chấm tay", "AI đã chấm nháp", "Đang rà soát" nộp quá 24 giờ; thiếu 1 trạng thái là lọt việc tồn đọng.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Mở Bảng điều khiển
**Expected:** Thẻ "Bài tập quá hạn chấm > 24h" hiển thị bộ đếm bằng tổng số bài ở 3 trạng thái đã quá 24 giờ kể từ lúc nộp
**Test Data:** TBD (cần BA cấp)
---
**STT:** 05
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-005 — Verify bài nộp mới 23 giờ 59 phút không được tính vào thẻ "Bài tập quá hạn chấm > 24h"
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Bài nộp chưa đủ 24 giờ không bị tính là quá hạn chấm
**Description:** Boundary dưới của ngưỡng 24 giờ; cần điều khiển thời gian nộp nên chạy tay.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Mở Bảng điều khiển khi bài nộp đạt 23 giờ 59 phút kể từ lúc nộp
**Expected:** Bộ đếm thẻ "Bài tập quá hạn chấm > 24h" không bao gồm bài nộp đó
**Test Data:** 1 bài Writing ở trạng thái "Chờ chấm tay", nộp cách thời điểm kiểm 23 giờ 59 phút
---
**STT:** 06
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-006 — Verify bài đã "Chốt trả bài" không được tính vào thẻ "Bài tập quá hạn chấm > 24h"
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Bài đã "Chốt trả bài" bị loại khỏi thẻ quá hạn chấm dù nộp quá 24 giờ
**Description:** Thẻ chỉ đếm bài chưa bấm "Chốt trả bài"; bài đã trả điểm còn bị đếm sẽ tạo việc ảo.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Mở Bảng điều khiển
**Expected:** Bộ đếm thẻ "Bài tập quá hạn chấm > 24h" không bao gồm bài đã "Chốt trả bài"
**Test Data:** TBD (cần BA cấp)
---
**STT:** 07
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Hiển thị thẻ nhắc việc
**Checklist:** CHK-selfomy-alignment-007 — Verify bấm "Làm mới dữ liệu" cập nhật bộ đếm "Ca học hôm nay chưa điểm danh" theo ca vừa được điểm danh ở tab khác
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Nút "Làm mới dữ liệu" kéo bộ đếm mới sau khi điểm danh ở tab khác
**Description:** Bảng điều khiển mở sẵn không tự biết thay đổi ở tab khác; "Làm mới dữ liệu" phải tải lại bộ đếm.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở Bảng điều khiển ở tab 1
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị bộ đếm 3
**Test Data:** —

**Step:** 2
**Action:** Ở tab 2 mở Điểm danh tổng theo ngày, mở 1 ca học, bấm "Đánh dấu tất cả Có mặt" rồi bấm "Lưu điểm danh ca học"
**Expected:** Ca học đó đổi nhãn sang "Đã điểm danh"
**Test Data:** —

**Step:** 3
**Action:** Quay lại tab 1, bấm "Làm mới dữ liệu"
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị bộ đếm 2
**Test Data:** —
---
**STT:** 08
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Điều hướng 1 chạm
**Checklist:** CHK-selfomy-alignment-008 — Verify bấm "Mở Điểm danh ngày ->" chuyển sang màn Điểm danh tổng theo ngày với URL "?date={hôm nay}&status=pending"
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** "Mở Điểm danh ngày ->" mở màn Điểm danh với tham số ngày hôm nay và trạng thái pending
**Description:** Điều hướng 1 chạm phải mang sẵn bộ lọc trên URL (US-001 AC-001); thiếu tham số thì người dùng phải lọc lại bằng tay.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có ca học chưa điểm danh (seed: teacherToday3) (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click link "Ca học hôm nay chưa điểm danh — Mở Điểm danh ngày"
**Expected:** Chuyển hướng tới URL /attendance
**Test Data:** —
---
**STT:** 09
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Điều hướng 1 chạm
**Checklist:** CHK-selfomy-alignment-009 — Verify màn Điểm danh mở từ thẻ nhắc việc chỉ hiển thị các ca học "Chưa điểm danh" của ngày hôm nay
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** Màn Điểm danh mở từ thẻ nhắc việc chỉ còn ca chưa điểm danh hôm nay
**Description:** Dữ liệu trộn ca đã lưu và ca chưa lưu; oracle là danh sách chỉ còn ca chưa lưu của hôm nay.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 2 ca chưa điểm danh và 1 ca đã lưu (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay → điểm danh và lưu 1 ca; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3)

**Step:** 1
**Action:** Mở Bảng điều khiển, bấm "Mở Điểm danh ngày ->"
**Expected:** Danh sách ca học chỉ gồm 2 ca chưa điểm danh của hôm nay; ca đã lưu không xuất hiện
**Test Data:** —
---
**STT:** 10
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Điều hướng 1 chạm
**Checklist:** CHK-selfomy-alignment-010 — Verify bấm "Mở Không gian chấm ->" chuyển sang Không gian chấm bài đã lọc sẵn bài nộp quá hạn > 24h chưa trả điểm
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** "Mở Không gian chấm ->" mở Không gian chấm với bộ lọc quá hạn > 24h
**Description:** Điều hướng 1 chạm sang màn chấm bài phải áp sẵn bộ lọc bài quá hạn chưa trả điểm; nhãn/tham số bộ lọc chưa có trong tài liệu.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Mở Bảng điều khiển, bấm nút "Mở Không gian chấm ->"
**Expected:** Màn Không gian chấm bài mở, danh sách chỉ gồm bài nộp quá hạn > 24h chưa trả điểm; nhãn/tham số URL của bộ lọc: TBD (cần BA cấp)
**Test Data:** —
---
**STT:** 11
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Điều hướng 1 chạm
**Checklist:** CHK-selfomy-alignment-011 — Verify bấm "Mở Sổ công nợ ->" chuyển sang Sổ công nợ với URL "?status=overdue,due_soon"
**Ref:** —
**Priority:** 2
**Title:** "Mở Sổ công nợ ->" mở Sổ công nợ với bộ lọc quá hạn và sắp đến hạn
**Description:** Nguồn là mô tả nút số 12 màn dashboard-reminders; tham số URL phải đủ cả 2 giá trị overdue và due_soon.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherOnly) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click link "Học phí đến hạn / quá hạn thu — Mở Sổ học phí"
**Expected:** Chuyển hướng tới URL /debts
**Test Data:** —
---
**STT:** 12
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Trạng thái hoàn tất
**Checklist:** CHK-selfomy-alignment-012 — Verify thẻ "Ca học hôm nay chưa điểm danh" có bộ đếm 0 hiển thị nhãn "Đã hoàn tất hôm nay"
**Ref:** FR-selfomy-alignment-004
**Priority:** 3
**Title:** Thẻ ca học chuyển sang "Đã hoàn tất hôm nay" khi mọi ca đã điểm danh
**Description:** Trạng thái Zero Inbox của thẻ khi bộ đếm bằng 0.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; mọi ca học hôm nay đã lưu điểm danh (seed: teacherToday1) (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay → điểm danh và lưu toàn bộ ca hôm nay; nguồn: UC-daily-attendance-and-holiday bước 3)


**Step:** 1
**Action:** Truy cập /attendance
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Truy cập /dashboard
**Expected:** Có đúng 3 chỗ hiển thị "Đã hoàn tất hôm nay"
**Test Data:** —
---
**STT:** 13
**Category:** Bảng điều khiển — Việc cần làm hôm nay
**Sub-Category:** Trạng thái hoàn tất
**Checklist:** CHK-selfomy-alignment-013 — Verify thẻ có bộ đếm 0 đổi nút hành động thành "Xem lịch sử"
**Ref:** FR-selfomy-alignment-004
**Priority:** 3
**Title:** Thẻ có bộ đếm 0 đổi nút hành động sang "Xem lịch sử"
**Description:** Ở trạng thái Zero Inbox, nút "Mở Điểm danh ngày ->" được thay bằng "Xem lịch sử".
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; mọi ca học hôm nay đã lưu điểm danh (seed: teacherToday1) (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay → điểm danh và lưu toàn bộ ca hôm nay; nguồn: UC-daily-attendance-and-holiday bước 3)


**Step:** 1
**Action:** Truy cập /attendance
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** —
**Test Data:** —

**Step:** 5
**Action:** Truy cập /dashboard
**Expected:** Có đúng 3 chỗ hiển thị "Đã hoàn tất hôm nay"
**Test Data:** —
---
**STT:** 14
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Chọn ngày
**Checklist:** CHK-selfomy-alignment-014 — Verify mở màn từ menu "Điểm danh ngày" (không có tham số date) mặc định chọn ngày hôm nay
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Mở Điểm danh từ menu không có tham số date thì mặc định ngày hôm nay
**Description:** Giá trị mặc định của bộ chọn ngày khi URL không mang "date".
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Bấm menu "Điểm danh ngày" ở thanh điều hướng bên
**Expected:** Màn Điểm danh tổng theo ngày mở; bộ chọn ngày hiển thị ngày hôm nay
**Test Data:** —
---
**STT:** 15
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Chọn ngày
**Checklist:** CHK-selfomy-alignment-015 — Verify truy cập URL "?date=2026-10-26" hiển thị đủ ca học của mọi lớp có lịch trong ngày 26/10/2026
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** URL "?date=2026-10-26" liệt kê đủ ca học của mọi lớp có lịch ngày đó
**Description:** Danh sách theo ngày phải đủ mọi lớp có ca, không sót lớp nào (US-001 AC-002).
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca học lớp "IELTS 6.5A" (18:00 - 19:30) và "IELTS 5.0B" (19:30 - 21:00) (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học ngày 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Ca "IELTS 6.5A" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Ca "IELTS 5.0B" hiển thị
**Test Data:** —
---
**STT:** 16
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Chọn ngày
**Checklist:** CHK-selfomy-alignment-016 — Verify đổi ngày trên bộ chọn ngày cập nhật tham số "date" trên URL theo ngày mới
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Đổi ngày trên bộ chọn đẩy ngày mới lên tham số "date" của URL
**Description:** Bộ lọc sống trong URL để chia sẻ/khôi phục được.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherDated2) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Field "Chọn ngày điểm danh" có giá trị "2026-10-26"
**Test Data:** —

**Step:** 2
**Action:** Nhập field "Chọn ngày điểm danh"
**Expected:** URL chứa "date=2026-10-27"
**Test Data:** 2026-10-27
---
**STT:** 17
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Chọn ngày
**Checklist:** CHK-selfomy-alignment-017 — Verify bấm "Hôm nay" đưa bộ chọn ngày về ngày hiện tại
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Nút "Hôm nay" đưa bộ chọn từ ngày khác về ngày hiện tại
**Description:** Nút nhanh cạnh bộ chọn ngày.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherDated2) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Field "Chọn ngày điểm danh" có giá trị "2026-10-26"
**Test Data:** —

**Step:** 2
**Action:** Click nút "Hôm nay"
**Expected:** URL không chứa "date=2026-10-26"
**Test Data:** —
---
**STT:** 18
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Loại trừ Lịch nghỉ chung
**Checklist:** CHK-selfomy-alignment-018 — Verify buổi học rơi vào Lịch nghỉ chung không xuất hiện trong danh sách ca học của ngày đó
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Buổi học trùng Lịch nghỉ chung toàn tổ chức bị loại khỏi danh sách điểm danh
**Description:** Buổi đã chuyển "Nghỉ lễ" không được hiện để điểm danh nhầm; sai ở đây làm lệch số buổi trong gói học phí.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 nằm trong Lịch nghỉ chung toàn tổ chức có lớp "IELTS 6.5A" (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 → mở Lịch dạy, bấm "Tạo lịch nghỉ chung", khoảng ngày 26/10/2026, phạm vi toàn tổ chức, phương án "Dời lịch (+1 buổi)" → "Xác nhận áp dụng lịch nghỉ"; nguồn: UC-daily-attendance-and-holiday bước 4-7, BR-selfomy-alignment-003)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26"
**Expected:** Không có ca học nào của lớp "IELTS 6.5A" trong danh sách
**Test Data:** date=2026-10-26; Tên kỳ nghỉ "Nghỉ kiểm thử"
---
**STT:** 19
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Loại trừ Lịch nghỉ chung
**Checklist:** CHK-selfomy-alignment-019 — Verify lớp không thuộc phạm vi Lịch nghỉ chung chọn lọc vẫn xuất hiện trong danh sách ca học của ngày đó
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Lịch nghỉ chung chọn lọc chỉ loại lớp trong phạm vi, lớp ngoài phạm vi vẫn hiện
**Description:** Chống loại trừ quá tay: lớp không chọn trong phạm vi nghỉ vẫn phải điểm danh bình thường.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có Lịch nghỉ chung chỉ áp dụng lớp "IELTS 6.5A", lớp "IELTS 5.0B" cũng có ca ngày đó (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → "Tạo lịch nghỉ chung" khoảng ngày 26/10/2026, phạm vi lớp chọn lọc "IELTS 6.5A" → "Xác nhận áp dụng lịch nghỉ"; nguồn: UC-daily-attendance-and-holiday bước 4-7)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26"
**Expected:** Ca học "IELTS 5.0B" (19:30 - 21:00) có trong danh sách; ca "IELTS 6.5A" không có
**Test Data:** date=2026-10-26
---
**STT:** 20
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-020 — Verify chọn chip "Chưa điểm danh" chỉ hiển thị các ca học chưa lưu điểm danh
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Chip "Chưa điểm danh" ẩn ca đã lưu, chỉ giữ ca chưa lưu
**Description:** Bộ lọc cốt lõi của FR-005 để giáo viên không bỏ sót ca.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh và ca "IELTS 5.0B" đã lưu (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → điểm danh và lưu ca "IELTS 5.0B"; nguồn: UC-daily-attendance-and-holiday bước 3, US-001 AC-002)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 5.0B"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 5.0B" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Click nút "Chưa điểm danh"
**Expected:** Nút chứa "IELTS 6.5A" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Truy cập /attendance?date=2026-10-26&status=pending
**Expected:** Nút chứa "IELTS 5.0B" không hiển thị
**Test Data:** —
---
**STT:** 21
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-021 — Verify chọn chip "Đã điểm danh" chỉ hiển thị các ca học đã lưu điểm danh
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Chip "Đã điểm danh" chỉ giữ ca đã lưu
**Description:** Chiều ngược của bộ lọc trạng thái.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh và ca "IELTS 5.0B" đã lưu (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → điểm danh và lưu ca "IELTS 5.0B"; nguồn: UC-daily-attendance-and-holiday bước 3)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 5.0B"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 5.0B" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Click nút "Đã điểm danh"
**Expected:** Nút chứa "IELTS 5.0B" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Truy cập /attendance?date=2026-10-26&status=completed
**Expected:** Nút chứa "IELTS 6.5A" không hiển thị
**Test Data:** —
---
**STT:** 22
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-022 — Verify số đếm trên 3 chip "Tất cả", "Chưa điểm danh", "Đã điểm danh" khớp số ca học tương ứng của ngày đang chọn
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Số đếm 3 chip trạng thái khớp số ca thực tế của ngày đang chọn
**Description:** Dữ liệu 3 ca (2 chưa, 1 đã lưu) để số đếm 3 chip khác nhau, bắt lỗi hoán đổi số.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có 3 ca học, 1 ca đã lưu điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học 26/10/2026 → điểm danh và lưu 1 ca; nguồn: UC-daily-attendance-and-holiday bước 3)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút "Tất cả" chứa chữ "2"
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 5.0B"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 5.0B" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Nút "Chưa điểm danh" chứa chữ "1"
**Test Data:** —

**Step:** 6
**Action:** Giữ nguyên trang
**Expected:** Nút "Đã điểm danh" chứa chữ "1"
**Test Data:** —
---
**STT:** 23
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-023 — Verify chọn chip trạng thái cập nhật tham số "status" trên URL
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Chọn chip "Chưa điểm danh" ghi "status=pending" lên URL
**Description:** Bộ lọc sống trong URL; giá trị pending/completed theo mô tả chip ở màn daily-attendance.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherDated2) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút "Chưa điểm danh"
**Expected:** URL chứa "status=pending"
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đã điểm danh"
**Expected:** URL chứa "status=completed"
**Test Data:** —
---
**STT:** 24
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-024 — Verify nhập tên lớp vào ô "Tìm lớp/HV" chỉ hiển thị ca học của lớp khớp từ khoá
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Tìm theo tên lớp chỉ giữ ca của lớp khớp từ khoá
**Description:** Từ khoá "6.5A" phân biệt được 2 lớp mẫu.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca học lớp "IELTS 6.5A" và "IELTS 5.0B" (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", nhập từ khoá vào ô "Tìm lớp/HV"
**Expected:** Danh sách chỉ còn ca "IELTS 6.5A"
**Test Data:** "6.5A"
---
**STT:** 25
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-025 — Verify nhập tên học viên vào ô "Tìm lớp/HV" chỉ hiển thị ca học có học viên khớp từ khoá
**Ref:** FR-selfomy-alignment-005
**Priority:** 3
**Title:** Tìm theo tên học viên chỉ giữ ca có học viên đó
**Description:** Học viên "Trần Hoàng Nam" chỉ thuộc lớp "IELTS 6.5A".
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" (có học viên "Trần Hoàng Nam") và ca "IELTS 5.0B" (không có học viên này) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026, thêm "Trần Hoàng Nam" vào "IELTS 6.5A"; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-003)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", nhập từ khoá vào ô "Tìm lớp/HV"
**Expected:** Danh sách chỉ còn ca "IELTS 6.5A"
**Test Data:** "Trần Hoàng Nam"
---
**STT:** 26
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-026 — Verify từ khoá tìm kiếm chỉ được đẩy lên URL "?q=" sau khi ngừng gõ khoảng 300ms
**Ref:** FR-selfomy-alignment-005
**Priority:** 3
**Title:** Từ khoá tìm kiếm chỉ lên URL "q" sau khi ngừng gõ khoảng 300ms
**Description:** Debounce 300ms theo quy ước UI; URL không đổi theo từng phím gõ.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày, gõ liên tục từ khoá vào ô "Tìm lớp/HV" và kiểm URL ngay sau phím cuối
**Expected:** URL chưa có tham số "q"
**Test Data:** "IELTS"

**Step:** 2
**Action:** Ngừng gõ, chờ khoảng 300ms
**Expected:** URL chứa tham số "q=IELTS"
**Test Data:** —
---
**STT:** 27
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-027 — Verify Chủ trung tâm chọn 1 giáo viên ở bộ lọc "Giáo viên" chỉ hiển thị ca học do giáo viên đó phụ trách
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Chủ trung tâm lọc theo giáo viên chỉ giữ ca của giáo viên đó
**Description:** Bộ lọc "Giáo viên" dành cho Chủ trung tâm/Giáo vụ.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Chủ trung tâm; ngày 26/10/2026 có ca "IELTS 6.5A" (GV "Minh Tran") và "IELTS 5.0B" (GV "Lan Pham") (dựng: đăng nhập tài khoản test Chủ trung tâm → mời 2 Giáo viên đứng lớp và phân công mỗi người 1 lớp có lịch học 26/10/2026; nguồn: FR-selfomy-alignment-029, UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", chọn "Minh Tran" ở bộ lọc "Giáo viên"
**Expected:** Danh sách chỉ còn ca "IELTS 6.5A" (GV: Minh Tran)
**Test Data:** Giáo viên = "Minh Tran"
---
**STT:** 28
**Category:** Điểm danh tổng theo ngày — chọn ngày và lọc ca học
**Sub-Category:** Lọc và tìm kiếm
**Checklist:** CHK-selfomy-alignment-028 — Verify mở lại URL có sẵn "date", "status", "q" khôi phục đúng toàn bộ bộ lọc tương ứng
**Ref:** FR-selfomy-alignment-005
**Priority:** 3
**Title:** URL có đủ "date", "status", "q" khôi phục cả 3 bộ lọc khi mở trực tiếp
**Description:** Bộ lọc sống trong URL phải tái lập được từ link chia sẻ.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh và ca "IELTS 5.0B" (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26&status=pending&q=6.5A"
**Expected:** Bộ chọn ngày là 26/10/2026, chip "Chưa điểm danh" đang chọn, ô "Tìm lớp/HV" chứa "6.5A"; danh sách chỉ còn ca "IELTS 6.5A"
**Test Data:** date=2026-10-26, status=pending, q=6.5A
---
**STT:** 29
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Mở rộng ca học
**Checklist:** CHK-selfomy-alignment-029 — Verify bấm thẻ tiêu đề ca học mở rộng danh sách học viên ngay tại chỗ mà không chuyển trang
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Bấm thẻ tiêu đề ca học mở danh sách học viên inline, URL giữ nguyên
**Description:** Giá trị cốt lõi của US-001: điểm danh không phải vào từng trang lớp; oracle là danh sách hiện ra và URL không đổi.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với học viên "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** Nút chứa "IELTS 6.5A" đã mở rộng
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** URL chứa "date=2026-10-26"
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Có đúng 3 nhóm trạng thái
**Test Data:** —
---
**STT:** 30
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Mở rộng ca học
**Checklist:** CHK-selfomy-alignment-030 — Verify thẻ tiêu đề ca học hiển thị đủ khung giờ, tên lớp, phòng học/link học, giáo viên phụ trách, sĩ số và nhãn trạng thái điểm danh
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Thẻ tiêu đề ca học hiển thị đủ 6 thông tin
**Description:** Đủ thông tin để giáo viên nhận ra ca mà không cần mở rộng.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" (18:00 - 19:30, Phòng 201, GV "Minh Tran", sĩ số 12) chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" phòng 201, GV "Minh Tran", 12 học viên, có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", quan sát thẻ tiêu đề ca "IELTS 6.5A"
**Expected:** Thẻ hiển thị khung giờ "18:00 - 19:30", tên lớp "IELTS 6.5A", "Phòng 201", "GV: Minh Tran", "Sĩ số: 12 HV" và nhãn trạng thái điểm danh của ca
**Test Data:** date=2026-10-26
---
**STT:** 31
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Mở rộng ca học
**Checklist:** CHK-selfomy-alignment-031 — Verify số học viên trong danh sách mở rộng bằng sĩ số trên thẻ tiêu đề ca học
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Số dòng học viên khi mở rộng bằng sĩ số trên thẻ tiêu đề
**Description:** Lệch giữa sĩ số và danh sách là dấu hiệu sót học viên khi điểm danh.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" sĩ số 12 chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" 12 học viên có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** Có đúng 3 nhóm trạng thái
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Nút chứa "IELTS 6.5A" và "Sĩ số 3 HV" hiển thị
**Test Data:** —
---
**STT:** 32
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Chọn trạng thái và ghi chú
**Checklist:** CHK-selfomy-alignment-032 — Verify mỗi học viên có đủ 4 lựa chọn "Có mặt", "Vắng có phép", "Vắng không phép", "Đi muộn"
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Mỗi dòng học viên có đủ 4 trạng thái điểm danh chuẩn
**Description:** Bộ 4 trạng thái chuẩn theo US-001 AC-002.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với học viên "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" hiển thị
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Radio "Vắng không phép" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Giữ nguyên trang
**Expected:** Radio "Đi muộn" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" hiển thị
**Test Data:** —
---
**STT:** 33
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Chọn trạng thái và ghi chú
**Checklist:** CHK-selfomy-alignment-033 — Verify chọn trạng thái mới cho 1 học viên tự bỏ chọn trạng thái cũ của học viên đó
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Mỗi học viên chỉ giữ 1 trạng thái: chọn mới thì bỏ chọn cũ
**Description:** Nhóm trạng thái là chọn-một; 2 trạng thái cùng lúc làm bản ghi điểm danh mơ hồ.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh có học viên "Nguyễn Minh Anh" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Chọn radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 4
**Action:** Chọn radio "Đi muộn" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh"
**Expected:** Radio "Đi muộn" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" chưa chọn
**Test Data:** —
---
**STT:** 34
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Chọn trạng thái và ghi chú
**Checklist:** CHK-selfomy-alignment-034 — Verify "Ghi chú học vụ" đã nhập được lưu kèm bản ghi điểm danh của học viên sau khi bấm "Lưu điểm danh ca học"
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Ghi chú học vụ còn nguyên khi mở lại ca đã lưu
**Description:** Ghi chú phải đi kèm bản ghi điểm danh của đúng học viên (US-001 AC-002).
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh có học viên "Trần Hoàng Nam" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Chọn radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam"
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 5
**Action:** Nhập field "Ghi chú học vụ của Trần Hoàng Nam"
**Expected:** Field "Ghi chú học vụ của Trần Hoàng Nam" có giá trị "Xin nghỉ ốm"
**Test Data:** Xin nghỉ ốm

**Step:** 6
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 7
**Action:** Tải lại trang
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 8
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 9
**Action:** Giữ nguyên trang
**Expected:** Field "Ghi chú học vụ của Trần Hoàng Nam" có giá trị "Xin nghỉ ốm"
**Test Data:** —
---
**STT:** 35
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Đánh dấu tất cả Có mặt
**Checklist:** CHK-selfomy-alignment-035 — Verify bấm "Đánh dấu tất cả Có mặt" gán "Có mặt" cho mọi học viên chưa chọn trạng thái trong ca học đang mở
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** "Đánh dấu tất cả Có mặt" gán "Có mặt" cho mọi học viên còn trống
**Description:** Thao tác nhanh giúp đạt mục tiêu điểm danh nhanh của NFR-008.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với 3 học viên (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Lê Thu Hà" đã chọn
**Test Data:** —
---
**STT:** 36
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Đánh dấu tất cả Có mặt
**Checklist:** CHK-selfomy-alignment-036 — Verify bấm "Đánh dấu tất cả Có mặt" giữ nguyên trạng thái của học viên đã chọn trước đó (vd "Vắng có phép")
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** "Đánh dấu tất cả Có mặt" không ghi đè học viên đã chọn trạng thái trước
**Description:** Nút chỉ điền học viên chưa chọn; ghi đè sẽ xoá mất lựa chọn vắng của giáo viên.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với 3 học viên (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Chọn radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam"
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 4
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 6
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Lê Thu Hà" đã chọn
**Test Data:** —
---
**STT:** 37
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Đánh dấu tất cả Có mặt
**Checklist:** CHK-selfomy-alignment-037 — Verify bấm "Đánh dấu tất cả Có mặt" không thay đổi trạng thái của ca học khác trong ngày
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** "Đánh dấu tất cả Có mặt" chỉ tác động ca đang mở
**Description:** Phạm vi thao tác nhanh là 1 ca; tràn sang ca khác sẽ điểm danh nhầm lớp.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" và "IELTS 5.0B" cùng chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở rộng ca "IELTS 6.5A", bấm "Đánh dấu tất cả Có mặt"
**Expected:** Học viên ca "IELTS 6.5A" ở trạng thái "Có mặt"
**Test Data:** date=2026-10-26

**Step:** 2
**Action:** Mở rộng ca "IELTS 5.0B"
**Expected:** Không học viên nào của ca "IELTS 5.0B" được chọn trạng thái; nhãn ca vẫn chưa điểm danh
**Test Data:** —
---
**STT:** 38
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Đánh dấu tất cả Có mặt
**Checklist:** CHK-selfomy-alignment-038 — Verify sau "Đánh dấu tất cả Có mặt", chỉnh "Trần Hoàng Nam" sang "Vắng có phép" rồi lưu thì hệ thống ghi nhận "Trần Hoàng Nam" là "Vắng có phép" và các học viên còn lại là "Có mặt"
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Đánh dấu tất cả rồi sửa 1 học viên vắng có phép, lưu ghi nhận đúng từng người
**Description:** Kịch bản chính của US-001 AC-003; oracle là trạng thái đã lưu khi mở lại, không phải trạng thái trên form.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: US-001 AC-003)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 4
**Action:** Chọn radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam"
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 5
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Tải lại trang
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 7
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 8
**Action:** Giữ nguyên trang
**Expected:** Radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam" đã chọn
**Test Data:** —

**Step:** 9
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 10
**Action:** Giữ nguyên trang
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Lê Thu Hà" đã chọn
**Test Data:** —
---
**STT:** 39
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-039 — Verify bấm "Lưu điểm danh ca học" ghi nhận trạng thái của toàn bộ học viên (mở lại ca học thấy đúng trạng thái đã chọn)
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Lưu ca học ghi nhận đủ 4 loại trạng thái khác nhau cho từng học viên
**Description:** Dùng trạng thái khác nhau cho mỗi học viên để bắt lỗi lưu lệch dòng.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà" (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở rộng ca "IELTS 6.5A", chọn trạng thái cho từng học viên rồi bấm "Lưu điểm danh ca học"
**Expected:** Ca "IELTS 6.5A" đổi nhãn sang "Đã điểm danh"
**Test Data:** "Nguyễn Minh Anh" = "Có mặt"; "Trần Hoàng Nam" = "Vắng không phép"; "Lê Thu Hà" = "Đi muộn"

**Step:** 2
**Action:** Tải lại trang, mở rộng lại ca "IELTS 6.5A"
**Expected:** Trạng thái từng học viên đúng như đã chọn ở Step 1
**Test Data:** —
---
**STT:** 40
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-040 — Verify lưu điểm danh thành công vẫn giữ nguyên màn Điểm danh tổng theo ngày (không chuyển trang)
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Lưu điểm danh xong vẫn ở màn Điểm danh tổng theo ngày
**Description:** Giữ ngữ cảnh để điểm danh tiếp ca kế (US-001 AC-002 "mà không chuyển trang").
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** URL chứa "date=2026-10-26"
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —
---
**STT:** 41
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-041 — Verify lưu thành công hiển thị thông báo Toast thành công
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Lưu điểm danh thành công hiện Toast thành công
**Description:** Phản hồi xác nhận cho người dùng; wording Toast chưa có trong tài liệu nguồn.
**Auto:** No
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở rộng ca "IELTS 6.5A", bấm "Đánh dấu tất cả Có mặt" rồi "Lưu điểm danh ca học"
**Expected:** Hiển thị Toast thành công với nội dung: TBD (cần BA cấp)
**Test Data:** date=2026-10-26
---
**STT:** 42
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-042 — Verify sau khi lưu, nhãn trạng thái ca học đổi sang "Đã điểm danh"
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Nhãn ca học đổi từ chưa điểm danh sang "Đã điểm danh" sau khi lưu
**Description:** Chuyển trạng thái ca học theo US-001 AC-002.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút chứa "IELTS 6.5A" và "Chưa điểm danh" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —
---
**STT:** 43
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-043 — Verify sau khi lưu 1 ca học, bộ đếm "Ca học hôm nay chưa điểm danh" trên Bảng điều khiển giảm đúng 1
**Ref:** FR-selfomy-alignment-004
**Priority:** 1
**Title:** Lưu 1 ca hôm nay làm bộ đếm Bảng điều khiển giảm đúng 1
**Description:** Đồng bộ giữa 2 màn theo US-001 AC-002; dùng ca của ngày hiện tại vì bộ đếm chỉ tính hôm nay.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (seed: teacherToday3) (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "3 ca" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Truy cập /attendance
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 5
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "2 ca" hiển thị
**Test Data:** —
---
**STT:** 44
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-044 — Verify sau khi lưu 1 ca học, số đếm trên chip "Chưa điểm danh" giảm đúng 1
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Lưu 1 ca làm số đếm chip "Chưa điểm danh" giảm đúng 1
**Description:** Số đếm chip phải cập nhật ngay trên cùng màn, không cần tải lại.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" và "IELTS 5.0B" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút "Chưa điểm danh" chứa chữ "2"
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Nút "Chưa điểm danh" chứa chữ "1"
**Test Data:** —
---
**STT:** 45
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-045 — Verify thẻ ca học đã lưu khi thu gọn hiển thị tỷ lệ chuyên cần dạng "{số Có mặt}/{sĩ số} Có mặt"
**Ref:** FR-selfomy-alignment-005
**Priority:** 3
**Title:** Thẻ ca đã lưu khi thu gọn hiện tỷ lệ "{số Có mặt}/{sĩ số} Có mặt"
**Description:** Với 1 học viên vắng trong 3, tỷ lệ phải là 2/3 để bắt lỗi đếm cả người vắng.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với 3 học viên (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Chọn radio "Vắng có phép" nhóm "Trạng thái điểm danh của Trần Hoàng Nam"
**Expected:** —
**Test Data:** —

**Step:** 5
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 6
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** Nút chứa "IELTS 6.5A" và "2/3" hiển thị
**Test Data:** —
---
**STT:** 46
**Category:** Điểm danh inline và lưu ca học
**Sub-Category:** Lưu điểm danh ca học
**Checklist:** CHK-selfomy-alignment-046 — Verify lưu xong mọi ca học trong ngày thì bộ đếm "Ca học hôm nay chưa điểm danh" về 0
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Lưu hết mọi ca hôm nay đưa bộ đếm Bảng điều khiển về 0
**Description:** Kết quả cuối của UC bước 3 (cập nhật số lớp chưa điểm danh về 0).
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 2 ca học chưa điểm danh (seed: teacherToday2) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3)


**Step:** 1
**Action:** Truy cập /attendance
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Nút chứa "IELTS 5.0B" đã mở rộng
**Test Data:** —

**Step:** 6
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 7
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 5.0B" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 8
**Action:** Truy cập /dashboard
**Expected:** Có đúng 3 chỗ hiển thị "Đã hoàn tất hôm nay"
**Test Data:** —
---
**STT:** 47
**Category:** Validation & Error handling
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-047 — Verify "Ghi chú học vụ" dài đúng 255 ký tự được lưu nguyên vẹn
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Ghi chú học vụ dài đúng 255 ký tự lưu không bị cắt
**Description:** Boundary trên của giới hạn 255 ký tự (mô tả ô Ghi chú học vụ, màn daily-attendance).
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh có học viên "Nguyễn Minh Anh" (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở rộng ca "IELTS 6.5A", bấm "Đánh dấu tất cả Có mặt", nhập ô "Ghi chú học vụ" của "Nguyễn Minh Anh", bấm "Lưu điểm danh ca học"
**Expected:** Ca đổi nhãn sang "Đã điểm danh"
**Test Data:** Chuỗi 255 ký tự "a" (sinh theo giới hạn 255 ký tự)

**Step:** 2
**Action:** Tải lại trang, mở rộng lại ca "IELTS 6.5A"
**Expected:** Ô "Ghi chú học vụ" của "Nguyễn Minh Anh" chứa đúng 255 ký tự đã nhập
**Test Data:** —
---
**STT:** 48
**Category:** Validation & Error handling
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-048 — Verify để trống "Ghi chú học vụ" vẫn lưu điểm danh thành công
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Ghi chú học vụ để trống không chặn việc lưu điểm danh
**Description:** Ghi chú là tuỳ chọn; bắt buộc nhầm sẽ làm chậm điểm danh.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —
---
**STT:** 49
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-049 — Verify Trợ giảng phụ trách lớp "IELTS 6.5A" mở Bảng điều khiển chỉ được đếm ca học thuộc lớp "IELTS 6.5A"
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Trợ giảng chỉ được đếm ca chưa điểm danh của lớp được phân công
**Description:** Cô lập dữ liệu theo phân công (US-001 AC-001); tổ chức có thêm lớp không phân công để bắt lỗi đếm toàn tổ chức.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A"; hôm nay "IELTS 6.5A" và "IELTS 5.0B" (không phân công) đều có ca chưa điểm danh (seed: taToday2) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học hôm nay → mời nhân sự vai trò Trợ giảng qua Email → phân công Trợ giảng phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + US-001 AC-001)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "1 ca" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Dòng "IELTS 6.5A (18:00 – 19:30)" hiển thị
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Dòng "IELTS 5.0B (19:30 – 21:00)" không hiển thị
**Test Data:** —
---
**STT:** 50
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-050 — Verify Trợ giảng phụ trách lớp "IELTS 6.5A" mở Bảng điều khiển chỉ được đếm bài nộp thuộc lớp "IELTS 6.5A"
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Trợ giảng chỉ được đếm bài quá hạn chấm của lớp được phân công
**Description:** Thẻ "Bài tập quá hạn chấm > 24h" cũng phải cô lập theo phân công; cần bài nộp đã quá 24 giờ ở cả 2 lớp.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Mở Bảng điều khiển
**Expected:** Bộ đếm thẻ "Bài tập quá hạn chấm > 24h" chỉ bằng số bài quá hạn của lớp "IELTS 6.5A"
**Test Data:** TBD (cần BA cấp)
---
**STT:** 51
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-051 — Verify Trợ giảng không thấy thẻ "Học phí đến hạn / quá hạn thu" trên Bảng điều khiển
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Thẻ Học phí bị ẩn hoàn toàn với Trợ giảng
**Description:** Trợ giảng chỉ thấy 2 thẻ ca học và bài chấm (quy tắc RBAC màn dashboard-reminders).
**Auto:** Yes
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A" (seed: taOnly) (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Thẻ "Bài tập quá hạn chấm > 24h" hiển thị
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Thẻ "Học phí đến hạn / quá hạn thu" không hiển thị
**Test Data:** —
---
**STT:** 52
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-052 — Verify dữ liệu Bảng điều khiển trả về trình duyệt của Trợ giảng không chứa dữ liệu công nợ học viên
**Ref:** NFR-selfomy-alignment-005
**Priority:** 1
**Title:** Phản hồi dữ liệu Bảng điều khiển của Trợ giảng không chứa công nợ
**Description:** Ẩn trên giao diện chưa đủ; NFR-005 yêu cầu chặn cả ở truy vấn dữ liệu. Cần soi phản hồi mạng nên chạy tay.
**Auto:** No
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A"; tổ chức có học viên đang nợ học phí (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + NFR-selfomy-alignment-005)

**Step:** 1
**Action:** Mở công cụ nhà phát triển của trình duyệt (tab Network), mở Bảng điều khiển
**Expected:** Bảng điều khiển tải xong
**Test Data:** —

**Step:** 2
**Action:** Kiểm tra nội dung mọi phản hồi dữ liệu của Bảng điều khiển
**Expected:** Không phản hồi nào chứa số học viên nợ, số tiền nợ hoặc danh sách công nợ
**Test Data:** —
---
**STT:** 53
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-053 — Verify Trợ giảng mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Trợ giảng chỉ thấy ca của lớp được phân công trên màn Điểm danh
**Description:** UC extension 4a1: cô lập áp cho cả màn Điểm danh tổng theo ngày.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A"; ngày 26/10/2026 có ca "IELTS 6.5A" và "IELTS 5.0B" (không phân công) (seed: taDated2) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học 26/10/2026 → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + UC-daily-attendance-and-holiday 4a1)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút chứa "IELTS 6.5A" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Nút chứa "IELTS 5.0B" không hiển thị
**Test Data:** —
---
**STT:** 54
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-054 — Verify bộ lọc "Giáo viên" bị khoá vào phạm vi lớp được phân công khi Trợ giảng đăng nhập
**Ref:** FR-selfomy-alignment-029
**Priority:** 2
**Title:** Bộ lọc "Giáo viên" khoá theo phạm vi phân công của Trợ giảng
**Description:** Trợ giảng không dùng bộ lọc để mở rộng ra lớp khác.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A" (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", mở bộ lọc "Giáo viên"
**Expected:** Bộ lọc bị khoá vào phạm vi lớp được phân công; không chọn được giáo viên/lớp ngoài "IELTS 6.5A"
**Test Data:** date=2026-10-26
---
**STT:** 55
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-055 — Verify Giáo viên đứng lớp mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Giáo viên đứng lớp chỉ thấy ca của lớp mình trên màn Điểm danh
**Description:** Cô lập theo phân công áp cho vai trò Giáo viên đứng lớp, không chỉ Trợ giảng.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên đứng lớp phụ trách "IELTS 6.5A"; ngày 26/10/2026 có ca "IELTS 6.5A" và "IELTS 5.0B" (không phân công) (seed: classTeacherDated2) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học 26/10/2026 → mời nhân sự vai trò Giáo viên đứng lớp qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản đó; nguồn: FR-selfomy-alignment-029 + UC-daily-attendance-and-holiday 4a1)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút chứa "IELTS 6.5A" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Nút chứa "IELTS 5.0B" không hiển thị
**Test Data:** —
---
**STT:** 56
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-056 — Verify Giáo viên đứng lớp mở Bảng điều khiển chỉ được đếm ca học thuộc lớp được phân công
**Ref:** FR-selfomy-alignment-029
**Priority:** 1
**Title:** Bộ đếm ca chưa điểm danh của Giáo viên đứng lớp chỉ tính lớp được phân công
**Description:** Cô lập trên Bảng điều khiển cho vai trò Giáo viên đứng lớp.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên đứng lớp phụ trách "IELTS 6.5A"; hôm nay "IELTS 6.5A" và "IELTS 5.0B" (không phân công) đều có ca chưa điểm danh (seed: classTeacherToday2) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học hôm nay → mời nhân sự vai trò Giáo viên đứng lớp qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản đó; nguồn: FR-selfomy-alignment-029)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "1 ca" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Dòng "IELTS 6.5A (18:00 – 19:30)" hiển thị
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Dòng "IELTS 5.0B (19:30 – 21:00)" không hiển thị
**Test Data:** —
---
**STT:** 57
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-057 — Verify Trợ giảng truy cập trực tiếp ca học của lớp không được phân công bị chặn xem danh sách học viên
**Ref:** NFR-selfomy-alignment-005
**Priority:** 1
**Title:** Trợ giảng mở link trực tiếp tới ca của lớp không phân công bị chặn
**Description:** NFR-005 chặn cả truy vấn dữ liệu, không chỉ ẩn giao diện; đường dẫn trực tiếp và cách hệ thống báo chặn chưa có trong tài liệu.
**Auto:** No
**Preconditions:** Đã đăng nhập Trợ giảng phụ trách "IELTS 6.5A"; lớp "IELTS 5.0B" không phân công có ca học (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách "IELTS 6.5A" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + NFR-selfomy-alignment-005)

**Step:** 1
**Action:** Truy cập trực tiếp đường dẫn ca học của lớp "IELTS 5.0B"
**Expected:** Không hiển thị danh sách học viên của "IELTS 5.0B"; cách báo chặn (thông báo/điều hướng): TBD (cần BA cấp)
**Test Data:** TBD (cần BA cấp)
---
**STT:** 58
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-058 — Verify người dùng chưa đăng nhập truy cập URL Điểm danh tổng theo ngày bị chuyển về màn đăng nhập
**Ref:** —
**Priority:** 1
**Title:** Người chưa đăng nhập mở URL Điểm danh bị đưa về màn đăng nhập
**Description:** Tiền điều kiện UC là đã đăng nhập; truy cập ẩn danh không được lộ danh sách ca học.
**Auto:** Yes
**Preconditions:** —

**Step:** 1
**Action:** Truy cập /attendance (phiên trình duyệt chưa đăng nhập)
**Expected:** Chuyển hướng về /login
**Test Data:** —
---
**STT:** 59
**Category:** Phân quyền & cô lập dữ liệu
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-059 — Verify Giáo vụ (Admin/Staff) mở Bảng điều khiển thấy đủ 3 thẻ nhắc việc
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Giáo vụ thấy đủ 3 thẻ nhắc việc kể cả thẻ Học phí
**Description:** Giáo vụ thuộc nhóm thấy đủ thẻ theo US-001 AC-001; ẩn nhầm thẻ Học phí là lỗi phân quyền ngược.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo vụ (seed: adminOnly) (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Quản lý/Giáo vụ qua Email → đăng nhập bằng tài khoản Giáo vụ; nguồn: FR-selfomy-alignment-029 + US-001 AC-001)


**Step:** 1
**Action:** Truy cập /dashboard
**Expected:** Thẻ "Ca học hôm nay chưa điểm danh" hiển thị
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Thẻ "Bài tập quá hạn chấm > 24h" hiển thị
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Thẻ "Học phí đến hạn / quá hạn thu" hiển thị
**Test Data:** —
---
**STT:** 60
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-060 — Verify khu vực "Việc cần làm hôm nay" hiển thị trạng thái đang tải trong lúc tải bộ đếm
**Ref:** NFR-selfomy-alignment-001
**Priority:** 3
**Title:** Khu vực nhắc việc hiện trạng thái đang tải trước khi có bộ đếm
**Description:** Không để khu vực trống hoặc hiện số 0 giả trong lúc tải; dạng chỉ báo tải chưa được đặc tả.
**Auto:** No
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở Bảng điều khiển và quan sát khu vực "Việc cần làm hôm nay" trước khi bộ đếm xuất hiện
**Expected:** Khu vực hiển thị chỉ báo đang tải (dạng chỉ báo: TBD cần BA cấp); không hiển thị bộ đếm 0 trong lúc tải
**Test Data:** —
---
**STT:** 61
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-061 — Verify danh sách ca học hiển thị trạng thái đang tải khi đổi ngày
**Ref:** NFR-selfomy-alignment-001
**Priority:** 3
**Title:** Danh sách ca học hiện trạng thái đang tải khi đổi sang ngày khác
**Description:** Tránh hiển thị ca của ngày cũ dưới ngày mới trong lúc tải; dạng chỉ báo tải chưa được đặc tả.
**Auto:** No
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", chọn ngày 27/10/2026 trên bộ chọn ngày và quan sát danh sách trước khi tải xong
**Expected:** Danh sách ca học hiển thị chỉ báo đang tải (dạng chỉ báo: TBD cần BA cấp)
**Test Data:** 27/10/2026
---
**STT:** 62
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-062 — Verify khu vực "Việc cần làm hôm nay" tải xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên
**Ref:** NFR-selfomy-alignment-001
**Priority:** 2
**Title:** Khu vực nhắc việc tải ≤ 2 giây ở 95% lượt đo với 50 lớp, 1.000 học viên
**Description:** Ngưỡng NFR-001 đo trên bộ dữ liệu quy mô; cần bộ dữ liệu và công cụ đo nên chạy tay.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Đo thời gian từ lúc mở Bảng điều khiển tới khi cả 3 thẻ hiển thị bộ đếm, lặp nhiều lượt
**Expected:** ≥ 95% lượt đo hoàn tất trong ≤ 2 giây
**Test Data:** Tổ chức 50 lớp, 1.000 học viên; số lượt đo: TBD (cần BA cấp)
---
**STT:** 63
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-063 — Verify danh sách ca học theo ngày tải/lọc xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên
**Ref:** NFR-selfomy-alignment-001
**Priority:** 2
**Title:** Danh sách ca học tải và lọc ≤ 2 giây ở 95% lượt đo với 50 lớp, 1.000 học viên
**Description:** Ngưỡng NFR-001 cho thao tác tải và lọc trên màn Điểm danh; cần bộ dữ liệu quy mô nên chạy tay.
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Đo thời gian mở màn Điểm danh tổng theo ngày và bấm chip "Chưa điểm danh" tới khi danh sách cập nhật xong, lặp nhiều lượt
**Expected:** ≥ 95% lượt đo hoàn tất trong ≤ 2 giây
**Test Data:** Tổ chức 50 lớp, 1.000 học viên; số lượt đo: TBD (cần BA cấp)
---
**STT:** 64
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-064 — Verify thao tác "Lưu điểm danh ca học" hoàn tất trong ≤ 2 giây
**Ref:** NFR-selfomy-alignment-001
**Priority:** 2
**Title:** "Lưu điểm danh ca học" hoàn tất trong ≤ 2 giây
**Description:** Ngưỡng lưu theo US-001 AC-002 và mô tả nút Lưu; đo bằng đồng hồ nên chạy tay.
**Auto:** No
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" sĩ số 12 chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" 12 học viên có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở rộng ca "IELTS 6.5A", bấm "Đánh dấu tất cả Có mặt", bấm "Lưu điểm danh ca học" và đo tới khi nhãn đổi sang "Đã điểm danh"
**Expected:** Thời gian đo ≤ 2 giây
**Test Data:** date=2026-10-26
---
**STT:** 65
**Category:** Loading & hiệu năng
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-065 — Verify giáo viên hoàn tất điểm danh toàn bộ ngày có ≥ 5 lớp trong ≤ 2 phút
**Ref:** NFR-selfomy-alignment-008
**Priority:** 2
**Title:** Điểm danh trọn ngày 5 lớp hoàn tất trong ≤ 2 phút
**Description:** Mục tiêu usability của NFR-008, đo thao tác người thật nên chạy tay.
**Auto:** No
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 5 lớp có ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 5 lớp có lịch học hôm nay kèm học viên; nguồn: NFR-selfomy-alignment-008 + UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Bắt đầu bấm giờ từ Bảng điều khiển, bấm "Mở Điểm danh ngày ->", lần lượt điểm danh và "Lưu điểm danh ca học" cho cả 5 ca
**Expected:** Cả 5 ca có nhãn "Đã điểm danh"; tổng thời gian ≤ 2 phút
**Test Data:** 5 lớp, mỗi lớp 1 ca hôm nay
---
**STT:** 66
**Category:** Accessibility cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-066 — Verify dùng bàn phím (Tab + Enter) mở rộng được thẻ tiêu đề ca học
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Mở rộng thẻ tiêu đề ca học chỉ bằng Tab và Enter
**Description:** NFR-008 yêu cầu điều hướng bàn phím; thẻ tiêu đề phải nhận focus và kích hoạt được.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Focus nút chứa "IELTS 6.5A"
**Expected:** Nút chứa "IELTS 6.5A" nhận focus
**Test Data:** —

**Step:** 3
**Action:** Nhấn phím "Enter"
**Expected:** Nút chứa "IELTS 6.5A" đã mở rộng
**Test Data:** —
---
**STT:** 67
**Category:** Accessibility cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-067 — Verify dùng bàn phím chọn được trạng thái điểm danh cho từng học viên
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Chọn trạng thái điểm danh của học viên chỉ bằng bàn phím
**Description:** Nhóm trạng thái phải thao tác được không cần chuột.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh có học viên "Nguyễn Minh Anh" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Focus radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" nhận focus
**Test Data:** —

**Step:** 4
**Action:** Nhấn phím "ArrowRight" 3 lần
**Expected:** —
**Test Data:** —

**Step:** 5
**Action:** Nhấn phím "Space"
**Expected:** Radio "Đi muộn" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —
---
**STT:** 68
**Category:** Accessibility cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-068 — Verify thứ tự focus đi lần lượt bộ chọn ngày, ô tìm kiếm, chip trạng thái, bộ lọc giáo viên, danh sách ca học
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Thứ tự Tab đi theo bố cục bộ lọc rồi tới danh sách ca học
**Description:** Thứ tự focus phải khớp thứ tự trực quan của màn daily-attendance; đánh giá bằng quan sát nên chạy tay.
**Auto:** No
**Preconditions:** Đã đăng nhập Chủ trung tâm (dựng: đăng nhập tài khoản test vai trò Chủ trung tâm; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Truy cập màn Điểm danh tổng theo ngày, nhấn Tab liên tục từ đầu vùng nội dung
**Expected:** Focus đi lần lượt: bộ chọn ngày, ô "Tìm lớp/HV", nhóm chip trạng thái, bộ lọc "Giáo viên", danh sách ca học
**Test Data:** —
---
**STT:** 69
**Category:** Accessibility cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-069 — Verify nhóm trạng thái điểm danh của mỗi học viên có nhãn truy cập chứa tên học viên đó
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Nhóm trạng thái của mỗi học viên mang nhãn truy cập có tên học viên
**Description:** Trình đọc màn hình phải phân biệt được nhóm trạng thái của từng học viên.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với "Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà" (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" hiển thị
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Nhóm "Trạng thái điểm danh của Trần Hoàng Nam" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Giữ nguyên trang
**Expected:** Nhóm "Trạng thái điểm danh của Lê Thu Hà" hiển thị
**Test Data:** —
---
**STT:** 70
**Category:** Accessibility cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-070 — Verify huy hiệu số đếm trên chip trạng thái mang thuộc tính aria-hidden="true"
**Ref:** FR-selfomy-alignment-005
**Priority:** 4
**Title:** Huy hiệu số đếm trên chip trạng thái mang aria-hidden="true"
**Description:** Quy ước chip filter: số đếm không bị đọc lặp bởi trình đọc màn hình.
**Auto:** Yes
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (seed: teacherDated2) (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** Nút "Tất cả" có phần tử aria-hidden
**Test Data:** —

**Step:** 2
**Action:** Giữ nguyên trang
**Expected:** Nút "Chưa điểm danh" có phần tử aria-hidden
**Test Data:** —

**Step:** 3
**Action:** Giữ nguyên trang
**Expected:** Nút "Đã điểm danh" có phần tử aria-hidden
**Test Data:** —
---
**STT:** 71
**Category:** Responsive cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-071 — Verify ở 375×812 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc
**Ref:** NFR-selfomy-alignment-008
**Priority:** 2
**Title:** Ở 375×812 danh sách học viên chuyển sang thẻ xếp chồng dọc
**Description:** Quy tắc responsive màn daily-attendance cho điện thoại.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Đặt khung nhìn 375×812, truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", mở rộng ca "IELTS 6.5A"
**Expected:** Mỗi học viên hiển thị là 1 thẻ, các thẻ xếp chồng theo chiều dọc
**Test Data:** Viewport 375×812
---
**STT:** 72
**Category:** Responsive cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-072 — Verify ở 375×812 bốn nút trạng thái điểm danh hiển thị dạng lưới 2×2
**Ref:** NFR-selfomy-alignment-008
**Priority:** 2
**Title:** Ở 375×812 bốn nút trạng thái xếp lưới 2×2
**Description:** Lưới 2×2 giúp chạm ngón tay dễ trên điện thoại.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Đặt viewport 375x812
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** Có đúng 3 nhóm trạng thái
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" xếp lưới 2x2
**Test Data:** —
---
**STT:** 73
**Category:** Responsive cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-073 — Verify ở 768×1024 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Ở 768×1024 danh sách học viên chuyển sang thẻ xếp chồng dọc
**Description:** Quy tắc responsive áp cả máy tính bảng.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Đặt khung nhìn 768×1024, truy cập màn Điểm danh tổng theo ngày với "?date=2026-10-26", mở rộng ca "IELTS 6.5A"
**Expected:** Mỗi học viên hiển thị là 1 thẻ, các thẻ xếp chồng theo chiều dọc
**Test Data:** Viewport 768×1024
---
**STT:** 74
**Category:** Responsive cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-074 — Verify ở 1440×900 ba thẻ nhắc việc nằm trên cùng một hàng
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Ở 1440×900 ba thẻ nhắc việc nằm cùng một hàng
**Description:** Bố cục desktop theo wireframe dashboard-reminders; đánh giá bố cục bằng mắt nên chạy tay.
**Auto:** No
**Preconditions:** Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Đặt khung nhìn 1440×900, mở Bảng điều khiển
**Expected:** 3 thẻ "Ca học hôm nay chưa điểm danh", "Bài tập quá hạn chấm > 24h", "Học phí đến hạn / quá hạn thu" nằm trên cùng một hàng ngang
**Test Data:** Viewport 1440×900
---
**STT:** 75
**Category:** Responsive cơ bản
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-075 — Verify ở 375×812 màn Điểm danh tổng theo ngày không xuất hiện thanh cuộn ngang
**Ref:** NFR-selfomy-alignment-008
**Priority:** 3
**Title:** Ở 375×812 màn Điểm danh không cuộn ngang
**Description:** Nội dung phải vừa bề rộng điện thoại, kể cả khi mở rộng ca học.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Đặt viewport 375x812
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Giữ nguyên trang
**Expected:** Không có thanh cuộn ngang
**Test Data:** —
---
**STT:** 76
**Category:** Edge cases
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-076 — Verify bấm "Lưu điểm danh ca học" 2 lần liên tiếp chỉ làm bộ đếm "Ca học hôm nay chưa điểm danh" giảm đúng 1
**Ref:** FR-selfomy-alignment-005
**Priority:** 1
**Title:** Bấm "Lưu điểm danh ca học" 2 lần liên tiếp không trừ bộ đếm 2 lần
**Description:** Chống double-submit: lưu lặp 1 ca không được làm bộ đếm giảm quá 1.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (seed: teacherToday3) (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)


**Step:** 1
**Action:** Truy cập /attendance
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click đúp nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Truy cập /dashboard
**Expected:** Bộ đếm "2 ca" hiển thị
**Test Data:** —
---
**STT:** 77
**Category:** Edge cases
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-077 — Verify tải lại trang khi đã chọn trạng thái nhưng chưa lưu thì ca học vẫn ở trạng thái "Chưa điểm danh"
**Ref:** FR-selfomy-alignment-005
**Priority:** 2
**Title:** Chọn trạng thái nhưng chưa lưu rồi tải lại trang thì ca vẫn chưa điểm danh
**Description:** Minimal Guarantee của UC: thay đổi chưa bấm lưu không được ghi nhận.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" chưa điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + Minimal Guarantee)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" đã chọn
**Test Data:** —

**Step:** 4
**Action:** Tải lại trang
**Expected:** Nút chứa "IELTS 6.5A" và "Chưa điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** Radio "Có mặt" nhóm "Trạng thái điểm danh của Nguyễn Minh Anh" chưa chọn
**Test Data:** —
---
**STT:** 78
**Category:** Edge cases
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-078 — Verify bấm Back từ màn Điểm danh về Bảng điều khiển sau khi lưu thì bộ đếm phản ánh số ca chưa điểm danh mới nhất
**Ref:** FR-selfomy-alignment-004
**Priority:** 2
**Title:** Back về Bảng điều khiển sau khi lưu không hiển thị bộ đếm cũ
**Description:** Trang lấy từ lịch sử trình duyệt không được giữ số đếm trước khi lưu.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)

**Step:** 1
**Action:** Mở Bảng điều khiển, bấm "Mở Điểm danh ngày ->"
**Expected:** Màn Điểm danh tổng theo ngày mở
**Test Data:** —

**Step:** 2
**Action:** Mở rộng 1 ca, bấm "Đánh dấu tất cả Có mặt" rồi "Lưu điểm danh ca học", sau đó bấm Back của trình duyệt
**Expected:** Bảng điều khiển hiển thị thẻ "Ca học hôm nay chưa điểm danh" với bộ đếm 2
**Test Data:** —
---
**STT:** 79
**Category:** Edge cases
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-079 — Verify phiên đăng nhập hết hạn khi bấm "Lưu điểm danh ca học" thì điểm danh không được ghi nhận (ca học vẫn "Chưa điểm danh")
**Ref:** —
**Priority:** 2
**Title:** Phiên đăng nhập hết hạn lúc bấm lưu thì điểm danh không được ghi nhận
**Description:** Không có nguồn về thời hạn phiên nên chưa dựng được trạng thái hết hạn (xoá cookie là đăng xuất, khác hết hạn).
**Auto:** No
**Preconditions:** TBD (cần BA cấp)

**Step:** 1
**Action:** Ở ca "IELTS 6.5A" đã chọn trạng thái, khi phiên đăng nhập đã hết hạn thì bấm "Lưu điểm danh ca học"
**Expected:** Điểm danh không được ghi nhận; sau khi đăng nhập lại, ca "IELTS 6.5A" vẫn "Chưa điểm danh"
**Test Data:** date=2026-10-26
---
**STT:** 80
**Category:** Edge cases
**Sub-Category:** —
**Checklist:** CHK-selfomy-alignment-080 — Verify chuyển sang ngày khác rồi quay lại ngày đã lưu vẫn thấy ca học ở trạng thái "Đã điểm danh"
**Ref:** FR-selfomy-alignment-005
**Priority:** 3
**Title:** Đổi ngày rồi quay lại vẫn thấy ca đã lưu là "Đã điểm danh"
**Description:** Trạng thái đã lưu không bị mất khi tải lại danh sách theo ngày.
**Auto:** Yes
**Preconditions:** Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca "IELTS 6.5A" đã lưu điểm danh (seed: teacherDated2) (dựng: đăng nhập tài khoản test → tạo lớp "IELTS 6.5A" có lịch học 26/10/2026 → mở rộng ca, bấm "Đánh dấu tất cả Có mặt" rồi "Lưu điểm danh ca học"; nguồn: US-001 AC-002)


**Step:** 1
**Action:** Truy cập /attendance?date=2026-10-26
**Expected:** —
**Test Data:** —

**Step:** 2
**Action:** Click nút chứa "IELTS 6.5A"
**Expected:** —
**Test Data:** —

**Step:** 3
**Action:** Click nút "Đánh dấu tất cả Có mặt"
**Expected:** —
**Test Data:** —

**Step:** 4
**Action:** Click nút "Lưu điểm danh ca học"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** —

**Step:** 5
**Action:** Nhập field "Chọn ngày điểm danh"
**Expected:** Nút chứa "IELTS 6.5A" không hiển thị
**Test Data:** 2026-10-27

**Step:** 6
**Action:** Nhập field "Chọn ngày điểm danh"
**Expected:** Nút chứa "IELTS 6.5A" và "Đã điểm danh" hiển thị
**Test Data:** 2026-10-26