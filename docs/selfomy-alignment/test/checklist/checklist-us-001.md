#1. Bảng điều khiển — Việc cần làm hôm nay
##1.1. Hiển thị thẻ nhắc việc
[1] [Yes] CHK-selfomy-alignment-001 → FR-selfomy-alignment-004 · Verify Giáo viên độc lập mở Bảng điều khiển thấy khu vực "Việc cần làm hôm nay" hiển thị đủ 3 thẻ: "Ca học hôm nay chưa điểm danh", "Bài tập quá hạn chấm > 24h", "Học phí đến hạn / quá hạn thu"
[1] [Yes] CHK-selfomy-alignment-002 → FR-selfomy-alignment-004 · Verify thẻ "Ca học hôm nay chưa điểm danh" hiển thị đúng số ca học trong ngày hiện tại chưa hoàn tất điểm danh
[2] [Yes] CHK-selfomy-alignment-003 → FR-selfomy-alignment-004 · Verify thẻ "Ca học hôm nay chưa điểm danh" chỉ liệt kê tối đa 3 ca học kèm khung giờ và tên lớp khi trong ngày có từ 4 ca chưa điểm danh
[1] [No] CHK-selfomy-alignment-004 → FR-selfomy-alignment-004 · Verify thẻ "Bài tập quá hạn chấm > 24h" đếm đúng số bài Writing/Speaking thuộc 3 trạng thái {Chờ chấm tay, AI đã chấm nháp, Đang rà soát} đã quá 24 giờ kể từ lúc nộp
[2] [No] CHK-selfomy-alignment-005 → FR-selfomy-alignment-004 · Verify bài nộp mới 23 giờ 59 phút không được tính vào thẻ "Bài tập quá hạn chấm > 24h"
[2] [No] CHK-selfomy-alignment-006 → FR-selfomy-alignment-004 · Verify bài đã "Chốt trả bài" không được tính vào thẻ "Bài tập quá hạn chấm > 24h"
[2] [Yes] CHK-selfomy-alignment-007 → FR-selfomy-alignment-004 · Verify bấm "Làm mới dữ liệu" cập nhật bộ đếm "Ca học hôm nay chưa điểm danh" theo ca vừa được điểm danh ở tab khác
##1.2. Điều hướng 1 chạm
[1] [Yes] CHK-selfomy-alignment-008 → FR-selfomy-alignment-004 · Verify bấm "Mở Điểm danh ngày ->" chuyển sang màn Điểm danh tổng theo ngày với URL "?date={hôm nay}&status=pending"
[1] [Yes] CHK-selfomy-alignment-009 → FR-selfomy-alignment-004 · Verify màn Điểm danh mở từ thẻ nhắc việc chỉ hiển thị các ca học "Chưa điểm danh" của ngày hôm nay
[2] [No] CHK-selfomy-alignment-010 → FR-selfomy-alignment-004 · Verify bấm "Mở Không gian chấm ->" chuyển sang Không gian chấm bài đã lọc sẵn bài nộp quá hạn > 24h chưa trả điểm
[2] [Yes] CHK-selfomy-alignment-011 → — · Verify bấm "Mở Sổ công nợ ->" chuyển sang Sổ công nợ với URL "?status=overdue,due_soon"
##1.3. Trạng thái hoàn tất
[3] [Yes] CHK-selfomy-alignment-012 → FR-selfomy-alignment-004 · Verify thẻ "Ca học hôm nay chưa điểm danh" có bộ đếm 0 hiển thị nhãn "Đã hoàn tất hôm nay"
[3] [Yes] CHK-selfomy-alignment-013 → FR-selfomy-alignment-004 · Verify thẻ có bộ đếm 0 đổi nút hành động thành "Xem lịch sử"
#2. Điểm danh tổng theo ngày — chọn ngày và lọc ca học
##2.1. Chọn ngày
[1] [Yes] CHK-selfomy-alignment-014 → FR-selfomy-alignment-005 · Verify mở màn từ menu "Điểm danh ngày" (không có tham số date) mặc định chọn ngày hôm nay
[1] [Yes] CHK-selfomy-alignment-015 → FR-selfomy-alignment-005 · Verify truy cập URL "?date=2026-10-26" hiển thị đủ ca học của mọi lớp có lịch trong ngày 26/10/2026
[2] [Yes] CHK-selfomy-alignment-016 → FR-selfomy-alignment-005 · Verify đổi ngày trên bộ chọn ngày cập nhật tham số "date" trên URL theo ngày mới
[2] [Yes] CHK-selfomy-alignment-017 → FR-selfomy-alignment-005 · Verify bấm "Hôm nay" đưa bộ chọn ngày về ngày hiện tại
##2.2. Loại trừ Lịch nghỉ chung
[1] [Yes] CHK-selfomy-alignment-018 → FR-selfomy-alignment-005 · Verify buổi học rơi vào Lịch nghỉ chung không xuất hiện trong danh sách ca học của ngày đó
[2] [Yes] CHK-selfomy-alignment-019 → FR-selfomy-alignment-005 · Verify lớp không thuộc phạm vi Lịch nghỉ chung chọn lọc vẫn xuất hiện trong danh sách ca học của ngày đó
##2.3. Lọc và tìm kiếm
[1] [Yes] CHK-selfomy-alignment-020 → FR-selfomy-alignment-005 · Verify chọn chip "Chưa điểm danh" chỉ hiển thị các ca học chưa lưu điểm danh
[2] [Yes] CHK-selfomy-alignment-021 → FR-selfomy-alignment-005 · Verify chọn chip "Đã điểm danh" chỉ hiển thị các ca học đã lưu điểm danh
[2] [Yes] CHK-selfomy-alignment-022 → FR-selfomy-alignment-005 · Verify số đếm trên 3 chip "Tất cả", "Chưa điểm danh", "Đã điểm danh" khớp số ca học tương ứng của ngày đang chọn
[2] [Yes] CHK-selfomy-alignment-023 → FR-selfomy-alignment-005 · Verify chọn chip trạng thái cập nhật tham số "status" trên URL
[2] [Yes] CHK-selfomy-alignment-024 → FR-selfomy-alignment-005 · Verify nhập tên lớp vào ô "Tìm lớp/HV" chỉ hiển thị ca học của lớp khớp từ khoá
[3] [Yes] CHK-selfomy-alignment-025 → FR-selfomy-alignment-005 · Verify nhập tên học viên vào ô "Tìm lớp/HV" chỉ hiển thị ca học có học viên khớp từ khoá
[3] [Yes] CHK-selfomy-alignment-026 → FR-selfomy-alignment-005 · Verify từ khoá tìm kiếm chỉ được đẩy lên URL "?q=" sau khi ngừng gõ khoảng 300ms
[2] [Yes] CHK-selfomy-alignment-027 → FR-selfomy-alignment-005 · Verify Chủ trung tâm chọn 1 giáo viên ở bộ lọc "Giáo viên" chỉ hiển thị ca học do giáo viên đó phụ trách
[3] [Yes] CHK-selfomy-alignment-028 → FR-selfomy-alignment-005 · Verify mở lại URL có sẵn "date", "status", "q" khôi phục đúng toàn bộ bộ lọc tương ứng
#3. Điểm danh inline và lưu ca học
##3.1. Mở rộng ca học
[1] [Yes] CHK-selfomy-alignment-029 → FR-selfomy-alignment-005 · Verify bấm thẻ tiêu đề ca học mở rộng danh sách học viên ngay tại chỗ mà không chuyển trang
[2] [Yes] CHK-selfomy-alignment-030 → FR-selfomy-alignment-005 · Verify thẻ tiêu đề ca học hiển thị đủ khung giờ, tên lớp, phòng học/link học, giáo viên phụ trách, sĩ số và nhãn trạng thái điểm danh
[2] [Yes] CHK-selfomy-alignment-031 → FR-selfomy-alignment-005 · Verify số học viên trong danh sách mở rộng bằng sĩ số trên thẻ tiêu đề ca học
##3.2. Chọn trạng thái và ghi chú
[1] [Yes] CHK-selfomy-alignment-032 → FR-selfomy-alignment-005 · Verify mỗi học viên có đủ 4 lựa chọn "Có mặt", "Vắng có phép", "Vắng không phép", "Đi muộn"
[1] [Yes] CHK-selfomy-alignment-033 → FR-selfomy-alignment-005 · Verify chọn trạng thái mới cho 1 học viên tự bỏ chọn trạng thái cũ của học viên đó
[2] [Yes] CHK-selfomy-alignment-034 → FR-selfomy-alignment-005 · Verify "Ghi chú học vụ" đã nhập được lưu kèm bản ghi điểm danh của học viên sau khi bấm "Lưu điểm danh ca học"
##3.3. Đánh dấu tất cả Có mặt
[1] [Yes] CHK-selfomy-alignment-035 → FR-selfomy-alignment-005 · Verify bấm "Đánh dấu tất cả Có mặt" gán "Có mặt" cho mọi học viên chưa chọn trạng thái trong ca học đang mở
[2] [Yes] CHK-selfomy-alignment-036 → FR-selfomy-alignment-005 · Verify bấm "Đánh dấu tất cả Có mặt" giữ nguyên trạng thái của học viên đã chọn trước đó (vd "Vắng có phép")
[2] [Yes] CHK-selfomy-alignment-037 → FR-selfomy-alignment-005 · Verify bấm "Đánh dấu tất cả Có mặt" không thay đổi trạng thái của ca học khác trong ngày
[1] [Yes] CHK-selfomy-alignment-038 → FR-selfomy-alignment-005 · Verify sau "Đánh dấu tất cả Có mặt", chỉnh "Trần Hoàng Nam" sang "Vắng có phép" rồi lưu thì hệ thống ghi nhận "Trần Hoàng Nam" là "Vắng có phép" và các học viên còn lại là "Có mặt"
##3.4. Lưu điểm danh ca học
[1] [Yes] CHK-selfomy-alignment-039 → FR-selfomy-alignment-005 · Verify bấm "Lưu điểm danh ca học" ghi nhận trạng thái của toàn bộ học viên (mở lại ca học thấy đúng trạng thái đã chọn)
[1] [Yes] CHK-selfomy-alignment-040 → FR-selfomy-alignment-005 · Verify lưu điểm danh thành công vẫn giữ nguyên màn Điểm danh tổng theo ngày (không chuyển trang)
[2] [No] CHK-selfomy-alignment-041 → FR-selfomy-alignment-005 · Verify lưu thành công hiển thị thông báo Toast thành công
[1] [Yes] CHK-selfomy-alignment-042 → FR-selfomy-alignment-005 · Verify sau khi lưu, nhãn trạng thái ca học đổi sang "Đã điểm danh"
[1] [Yes] CHK-selfomy-alignment-043 → FR-selfomy-alignment-004 · Verify sau khi lưu 1 ca học, bộ đếm "Ca học hôm nay chưa điểm danh" trên Bảng điều khiển giảm đúng 1
[2] [Yes] CHK-selfomy-alignment-044 → FR-selfomy-alignment-005 · Verify sau khi lưu 1 ca học, số đếm trên chip "Chưa điểm danh" giảm đúng 1
[3] [Yes] CHK-selfomy-alignment-045 → FR-selfomy-alignment-005 · Verify thẻ ca học đã lưu khi thu gọn hiển thị tỷ lệ chuyên cần dạng "{số Có mặt}/{sĩ số} Có mặt"
[2] [Yes] CHK-selfomy-alignment-046 → FR-selfomy-alignment-004 · Verify lưu xong mọi ca học trong ngày thì bộ đếm "Ca học hôm nay chưa điểm danh" về 0
#4. Validation & Error handling
[2] [Yes] CHK-selfomy-alignment-047 → FR-selfomy-alignment-005 · Verify "Ghi chú học vụ" dài đúng 255 ký tự được lưu nguyên vẹn
[2] [Yes] CHK-selfomy-alignment-048 → FR-selfomy-alignment-005 · Verify để trống "Ghi chú học vụ" vẫn lưu điểm danh thành công
#5. Phân quyền & cô lập dữ liệu
[1] [Yes] CHK-selfomy-alignment-049 → FR-selfomy-alignment-029 · Verify Trợ giảng phụ trách lớp "IELTS 6.5A" mở Bảng điều khiển chỉ được đếm ca học thuộc lớp "IELTS 6.5A"
[1] [No] CHK-selfomy-alignment-050 → FR-selfomy-alignment-029 · Verify Trợ giảng phụ trách lớp "IELTS 6.5A" mở Bảng điều khiển chỉ được đếm bài nộp thuộc lớp "IELTS 6.5A"
[1] [Yes] CHK-selfomy-alignment-051 → FR-selfomy-alignment-029 · Verify Trợ giảng không thấy thẻ "Học phí đến hạn / quá hạn thu" trên Bảng điều khiển
[1] [No] CHK-selfomy-alignment-052 → NFR-selfomy-alignment-005 · Verify dữ liệu Bảng điều khiển trả về trình duyệt của Trợ giảng không chứa dữ liệu công nợ học viên
[1] [Yes] CHK-selfomy-alignment-053 → FR-selfomy-alignment-029 · Verify Trợ giảng mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công
[2] [Yes] CHK-selfomy-alignment-054 → FR-selfomy-alignment-029 · Verify bộ lọc "Giáo viên" bị khoá vào phạm vi lớp được phân công khi Trợ giảng đăng nhập
[1] [Yes] CHK-selfomy-alignment-055 → FR-selfomy-alignment-029 · Verify Giáo viên đứng lớp mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công
[1] [Yes] CHK-selfomy-alignment-056 → FR-selfomy-alignment-029 · Verify Giáo viên đứng lớp mở Bảng điều khiển chỉ được đếm ca học thuộc lớp được phân công
[1] [No] CHK-selfomy-alignment-057 → NFR-selfomy-alignment-005 · Verify Trợ giảng truy cập trực tiếp ca học của lớp không được phân công bị chặn xem danh sách học viên
[1] [No] CHK-selfomy-alignment-058 → — · Verify người dùng chưa đăng nhập truy cập URL Điểm danh tổng theo ngày bị chuyển về màn đăng nhập
[2] [Yes] CHK-selfomy-alignment-059 → FR-selfomy-alignment-004 · Verify Giáo vụ (Admin/Staff) mở Bảng điều khiển thấy đủ 3 thẻ nhắc việc
#6. Loading & hiệu năng
[3] [No] CHK-selfomy-alignment-060 → NFR-selfomy-alignment-001 · Verify khu vực "Việc cần làm hôm nay" hiển thị trạng thái đang tải trong lúc tải bộ đếm
[3] [No] CHK-selfomy-alignment-061 → NFR-selfomy-alignment-001 · Verify danh sách ca học hiển thị trạng thái đang tải khi đổi ngày
[2] [No] CHK-selfomy-alignment-062 → NFR-selfomy-alignment-001 · Verify khu vực "Việc cần làm hôm nay" tải xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên
[2] [No] CHK-selfomy-alignment-063 → NFR-selfomy-alignment-001 · Verify danh sách ca học theo ngày tải/lọc xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên
[2] [No] CHK-selfomy-alignment-064 → NFR-selfomy-alignment-001 · Verify thao tác "Lưu điểm danh ca học" hoàn tất trong ≤ 2 giây
[2] [No] CHK-selfomy-alignment-065 → NFR-selfomy-alignment-008 · Verify giáo viên hoàn tất điểm danh toàn bộ ngày có ≥ 5 lớp trong ≤ 2 phút
#7. Accessibility cơ bản
[3] [Yes] CHK-selfomy-alignment-066 → NFR-selfomy-alignment-008 · Verify dùng bàn phím (Tab + Enter) mở rộng được thẻ tiêu đề ca học
[3] [Yes] CHK-selfomy-alignment-067 → NFR-selfomy-alignment-008 · Verify dùng bàn phím chọn được trạng thái điểm danh cho từng học viên
[3] [No] CHK-selfomy-alignment-068 → NFR-selfomy-alignment-008 · Verify thứ tự focus đi lần lượt bộ chọn ngày, ô tìm kiếm, chip trạng thái, bộ lọc giáo viên, danh sách ca học
[3] [Yes] CHK-selfomy-alignment-069 → NFR-selfomy-alignment-008 · Verify nhóm trạng thái điểm danh của mỗi học viên có nhãn truy cập chứa tên học viên đó
[4] [Yes] CHK-selfomy-alignment-070 → FR-selfomy-alignment-005 · Verify huy hiệu số đếm trên chip trạng thái mang thuộc tính aria-hidden="true"
#8. Responsive cơ bản
[2] [Yes] CHK-selfomy-alignment-071 → NFR-selfomy-alignment-008 · Verify ở 375×812 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc
[2] [Yes] CHK-selfomy-alignment-072 → NFR-selfomy-alignment-008 · Verify ở 375×812 bốn nút trạng thái điểm danh hiển thị dạng lưới 2×2
[3] [Yes] CHK-selfomy-alignment-073 → NFR-selfomy-alignment-008 · Verify ở 768×1024 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc
[3] [No] CHK-selfomy-alignment-074 → NFR-selfomy-alignment-008 · Verify ở 1440×900 ba thẻ nhắc việc nằm trên cùng một hàng
[3] [Yes] CHK-selfomy-alignment-075 → NFR-selfomy-alignment-008 · Verify ở 375×812 màn Điểm danh tổng theo ngày không xuất hiện thanh cuộn ngang
#9. Edge cases
[1] [Yes] CHK-selfomy-alignment-076 → FR-selfomy-alignment-005 · Verify bấm "Lưu điểm danh ca học" 2 lần liên tiếp chỉ làm bộ đếm "Ca học hôm nay chưa điểm danh" giảm đúng 1
[2] [Yes] CHK-selfomy-alignment-077 → FR-selfomy-alignment-005 · Verify tải lại trang khi đã chọn trạng thái nhưng chưa lưu thì ca học vẫn ở trạng thái "Chưa điểm danh"
[2] [Yes] CHK-selfomy-alignment-078 → FR-selfomy-alignment-004 · Verify bấm Back từ màn Điểm danh về Bảng điều khiển sau khi lưu thì bộ đếm phản ánh số ca chưa điểm danh mới nhất
[2] [No] CHK-selfomy-alignment-079 → — · Verify phiên đăng nhập hết hạn khi bấm "Lưu điểm danh ca học" thì điểm danh không được ghi nhận (ca học vẫn "Chưa điểm danh")
[3] [Yes] CHK-selfomy-alignment-080 → FR-selfomy-alignment-005 · Verify chuyển sang ngày khác rồi quay lại ngày đã lưu vẫn thấy ca học ở trạng thái "Đã điểm danh"
