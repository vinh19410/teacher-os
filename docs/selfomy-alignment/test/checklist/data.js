window.FEATURE = "selfomy-alignment";
window.UPDATED = "2026-10-27";
window.CHECKLISTS_DATA = [
  {
    "scope": "story",
    "target": "us-001",
    "file": "checklist-us-001.md",
    "items": [
      {
        "chk": "CHK-selfomy-alignment-001",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Giáo viên độc lập mở Bảng điều khiển thấy khu vực \"Việc cần làm hôm nay\" hiển thị đủ 3 thẻ: \"Ca học hôm nay chưa điểm danh\", \"Bài tập quá hạn chấm > 24h\", \"Học phí đến hạn / quá hạn thu\""
      },
      {
        "chk": "CHK-selfomy-alignment-002",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị đúng số ca học trong ngày hiện tại chưa hoàn tất điểm danh"
      },
      {
        "chk": "CHK-selfomy-alignment-003",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify thẻ \"Ca học hôm nay chưa điểm danh\" chỉ liệt kê tối đa 3 ca học kèm khung giờ và tên lớp khi trong ngày có từ 4 ca chưa điểm danh"
      },
      {
        "chk": "CHK-selfomy-alignment-004",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 1,
        "auto": "No",
        "text": "Verify thẻ \"Bài tập quá hạn chấm > 24h\" đếm đúng số bài Writing/Speaking thuộc 3 trạng thái {Chờ chấm tay, AI đã chấm nháp, Đang rà soát} đã quá 24 giờ kể từ lúc nộp"
      },
      {
        "chk": "CHK-selfomy-alignment-005",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 2,
        "auto": "No",
        "text": "Verify bài nộp mới 23 giờ 59 phút không được tính vào thẻ \"Bài tập quá hạn chấm > 24h\""
      },
      {
        "chk": "CHK-selfomy-alignment-006",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 2,
        "auto": "No",
        "text": "Verify bài đã \"Chốt trả bài\" không được tính vào thẻ \"Bài tập quá hạn chấm > 24h\""
      },
      {
        "chk": "CHK-selfomy-alignment-007",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm \"Làm mới dữ liệu\" cập nhật bộ đếm \"Ca học hôm nay chưa điểm danh\" theo ca vừa được điểm danh ở tab khác"
      },
      {
        "chk": "CHK-selfomy-alignment-008",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify bấm \"Mở Điểm danh ngày ->\" chuyển sang màn Điểm danh tổng theo ngày với URL \"?date={hôm nay}&status=pending\""
      },
      {
        "chk": "CHK-selfomy-alignment-009",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify màn Điểm danh mở từ thẻ nhắc việc chỉ hiển thị các ca học \"Chưa điểm danh\" của ngày hôm nay"
      },
      {
        "chk": "CHK-selfomy-alignment-010",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "priority": 2,
        "auto": "No",
        "text": "Verify bấm \"Mở Không gian chấm ->\" chuyển sang Không gian chấm bài đã lọc sẵn bài nộp quá hạn > 24h chưa trả điểm"
      },
      {
        "chk": "CHK-selfomy-alignment-011",
        "ref": [],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm \"Mở Sổ công nợ ->\" chuyển sang Sổ công nợ với URL \"?status=overdue,due_soon\""
      },
      {
        "chk": "CHK-selfomy-alignment-012",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Trạng thái hoàn tất",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify thẻ \"Ca học hôm nay chưa điểm danh\" có bộ đếm 0 hiển thị nhãn \"Đã hoàn tất hôm nay\""
      },
      {
        "chk": "CHK-selfomy-alignment-013",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Trạng thái hoàn tất",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify thẻ có bộ đếm 0 đổi nút hành động thành \"Xem lịch sử\""
      },
      {
        "chk": "CHK-selfomy-alignment-014",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify mở màn từ menu \"Điểm danh ngày\" (không có tham số date) mặc định chọn ngày hôm nay"
      },
      {
        "chk": "CHK-selfomy-alignment-015",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify truy cập URL \"?date=2026-10-26\" hiển thị đủ ca học của mọi lớp có lịch trong ngày 26/10/2026"
      },
      {
        "chk": "CHK-selfomy-alignment-016",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify đổi ngày trên bộ chọn ngày cập nhật tham số \"date\" trên URL theo ngày mới"
      },
      {
        "chk": "CHK-selfomy-alignment-017",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm \"Hôm nay\" đưa bộ chọn ngày về ngày hiện tại"
      },
      {
        "chk": "CHK-selfomy-alignment-018",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Loại trừ Lịch nghỉ chung",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify buổi học rơi vào Lịch nghỉ chung không xuất hiện trong danh sách ca học của ngày đó"
      },
      {
        "chk": "CHK-selfomy-alignment-019",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Loại trừ Lịch nghỉ chung",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify lớp không thuộc phạm vi Lịch nghỉ chung chọn lọc vẫn xuất hiện trong danh sách ca học của ngày đó"
      },
      {
        "chk": "CHK-selfomy-alignment-020",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify chọn chip \"Chưa điểm danh\" chỉ hiển thị các ca học chưa lưu điểm danh"
      },
      {
        "chk": "CHK-selfomy-alignment-021",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify chọn chip \"Đã điểm danh\" chỉ hiển thị các ca học đã lưu điểm danh"
      },
      {
        "chk": "CHK-selfomy-alignment-022",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify số đếm trên 3 chip \"Tất cả\", \"Chưa điểm danh\", \"Đã điểm danh\" khớp số ca học tương ứng của ngày đang chọn"
      },
      {
        "chk": "CHK-selfomy-alignment-023",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify chọn chip trạng thái cập nhật tham số \"status\" trên URL"
      },
      {
        "chk": "CHK-selfomy-alignment-024",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify nhập tên lớp vào ô \"Tìm lớp/HV\" chỉ hiển thị ca học của lớp khớp từ khoá"
      },
      {
        "chk": "CHK-selfomy-alignment-025",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify nhập tên học viên vào ô \"Tìm lớp/HV\" chỉ hiển thị ca học có học viên khớp từ khoá"
      },
      {
        "chk": "CHK-selfomy-alignment-026",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify từ khoá tìm kiếm chỉ được đẩy lên URL \"?q=\" sau khi ngừng gõ khoảng 300ms"
      },
      {
        "chk": "CHK-selfomy-alignment-027",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify Chủ trung tâm chọn 1 giáo viên ở bộ lọc \"Giáo viên\" chỉ hiển thị ca học do giáo viên đó phụ trách"
      },
      {
        "chk": "CHK-selfomy-alignment-028",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify mở lại URL có sẵn \"date\", \"status\", \"q\" khôi phục đúng toàn bộ bộ lọc tương ứng"
      },
      {
        "chk": "CHK-selfomy-alignment-029",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify bấm thẻ tiêu đề ca học mở rộng danh sách học viên ngay tại chỗ mà không chuyển trang"
      },
      {
        "chk": "CHK-selfomy-alignment-030",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify thẻ tiêu đề ca học hiển thị đủ khung giờ, tên lớp, phòng học/link học, giáo viên phụ trách, sĩ số và nhãn trạng thái điểm danh"
      },
      {
        "chk": "CHK-selfomy-alignment-031",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify số học viên trong danh sách mở rộng bằng sĩ số trên thẻ tiêu đề ca học"
      },
      {
        "chk": "CHK-selfomy-alignment-032",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify mỗi học viên có đủ 4 lựa chọn \"Có mặt\", \"Vắng có phép\", \"Vắng không phép\", \"Đi muộn\""
      },
      {
        "chk": "CHK-selfomy-alignment-033",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify chọn trạng thái mới cho 1 học viên tự bỏ chọn trạng thái cũ của học viên đó"
      },
      {
        "chk": "CHK-selfomy-alignment-034",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify \"Ghi chú học vụ\" đã nhập được lưu kèm bản ghi điểm danh của học viên sau khi bấm \"Lưu điểm danh ca học\""
      },
      {
        "chk": "CHK-selfomy-alignment-035",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify bấm \"Đánh dấu tất cả Có mặt\" gán \"Có mặt\" cho mọi học viên chưa chọn trạng thái trong ca học đang mở"
      },
      {
        "chk": "CHK-selfomy-alignment-036",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm \"Đánh dấu tất cả Có mặt\" giữ nguyên trạng thái của học viên đã chọn trước đó (vd \"Vắng có phép\")"
      },
      {
        "chk": "CHK-selfomy-alignment-037",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm \"Đánh dấu tất cả Có mặt\" không thay đổi trạng thái của ca học khác trong ngày"
      },
      {
        "chk": "CHK-selfomy-alignment-038",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify sau \"Đánh dấu tất cả Có mặt\", chỉnh \"Trần Hoàng Nam\" sang \"Vắng có phép\" rồi lưu thì hệ thống ghi nhận \"Trần Hoàng Nam\" là \"Vắng có phép\" và các học viên còn lại là \"Có mặt\""
      },
      {
        "chk": "CHK-selfomy-alignment-039",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify bấm \"Lưu điểm danh ca học\" ghi nhận trạng thái của toàn bộ học viên (mở lại ca học thấy đúng trạng thái đã chọn)"
      },
      {
        "chk": "CHK-selfomy-alignment-040",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify lưu điểm danh thành công vẫn giữ nguyên màn Điểm danh tổng theo ngày (không chuyển trang)"
      },
      {
        "chk": "CHK-selfomy-alignment-041",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 2,
        "auto": "No",
        "text": "Verify lưu thành công hiển thị thông báo Toast thành công"
      },
      {
        "chk": "CHK-selfomy-alignment-042",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify sau khi lưu, nhãn trạng thái ca học đổi sang \"Đã điểm danh\""
      },
      {
        "chk": "CHK-selfomy-alignment-043",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify sau khi lưu 1 ca học, bộ đếm \"Ca học hôm nay chưa điểm danh\" trên Bảng điều khiển giảm đúng 1"
      },
      {
        "chk": "CHK-selfomy-alignment-044",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify sau khi lưu 1 ca học, số đếm trên chip \"Chưa điểm danh\" giảm đúng 1"
      },
      {
        "chk": "CHK-selfomy-alignment-045",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify thẻ ca học đã lưu khi thu gọn hiển thị tỷ lệ chuyên cần dạng \"{số Có mặt}/{sĩ số} Có mặt\""
      },
      {
        "chk": "CHK-selfomy-alignment-046",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify lưu xong mọi ca học trong ngày thì bộ đếm \"Ca học hôm nay chưa điểm danh\" về 0"
      },
      {
        "chk": "CHK-selfomy-alignment-047",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Validation & Error handling",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify \"Ghi chú học vụ\" dài đúng 255 ký tự được lưu nguyên vẹn"
      },
      {
        "chk": "CHK-selfomy-alignment-048",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Validation & Error handling",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify để trống \"Ghi chú học vụ\" vẫn lưu điểm danh thành công"
      },
      {
        "chk": "CHK-selfomy-alignment-049",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Trợ giảng phụ trách lớp \"IELTS 6.5A\" mở Bảng điều khiển chỉ được đếm ca học thuộc lớp \"IELTS 6.5A\""
      },
      {
        "chk": "CHK-selfomy-alignment-050",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "No",
        "text": "Verify Trợ giảng phụ trách lớp \"IELTS 6.5A\" mở Bảng điều khiển chỉ được đếm bài nộp thuộc lớp \"IELTS 6.5A\""
      },
      {
        "chk": "CHK-selfomy-alignment-051",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Trợ giảng không thấy thẻ \"Học phí đến hạn / quá hạn thu\" trên Bảng điều khiển"
      },
      {
        "chk": "CHK-selfomy-alignment-052",
        "ref": [
          "NFR-selfomy-alignment-005"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "No",
        "text": "Verify dữ liệu Bảng điều khiển trả về trình duyệt của Trợ giảng không chứa dữ liệu công nợ học viên"
      },
      {
        "chk": "CHK-selfomy-alignment-053",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Trợ giảng mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công"
      },
      {
        "chk": "CHK-selfomy-alignment-054",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bộ lọc \"Giáo viên\" bị khoá vào phạm vi lớp được phân công khi Trợ giảng đăng nhập"
      },
      {
        "chk": "CHK-selfomy-alignment-055",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Giáo viên đứng lớp mở Điểm danh tổng theo ngày chỉ thấy ca học của lớp được phân công"
      },
      {
        "chk": "CHK-selfomy-alignment-056",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify Giáo viên đứng lớp mở Bảng điều khiển chỉ được đếm ca học thuộc lớp được phân công"
      },
      {
        "chk": "CHK-selfomy-alignment-057",
        "ref": [
          "NFR-selfomy-alignment-005"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "No",
        "text": "Verify Trợ giảng truy cập trực tiếp ca học của lớp không được phân công bị chặn xem danh sách học viên"
      },
      {
        "chk": "CHK-selfomy-alignment-058",
        "ref": [],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 1,
        "auto": "No",
        "text": "Verify người dùng chưa đăng nhập truy cập URL Điểm danh tổng theo ngày bị chuyển về màn đăng nhập"
      },
      {
        "chk": "CHK-selfomy-alignment-059",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify Giáo vụ (Admin/Staff) mở Bảng điều khiển thấy đủ 3 thẻ nhắc việc"
      },
      {
        "chk": "CHK-selfomy-alignment-060",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 3,
        "auto": "No",
        "text": "Verify khu vực \"Việc cần làm hôm nay\" hiển thị trạng thái đang tải trong lúc tải bộ đếm"
      },
      {
        "chk": "CHK-selfomy-alignment-061",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 3,
        "auto": "No",
        "text": "Verify danh sách ca học hiển thị trạng thái đang tải khi đổi ngày"
      },
      {
        "chk": "CHK-selfomy-alignment-062",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 2,
        "auto": "No",
        "text": "Verify khu vực \"Việc cần làm hôm nay\" tải xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên"
      },
      {
        "chk": "CHK-selfomy-alignment-063",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 2,
        "auto": "No",
        "text": "Verify danh sách ca học theo ngày tải/lọc xong trong ≤ 2 giây ở 95% lượt đo với tổ chức 50 lớp và 1.000 học viên"
      },
      {
        "chk": "CHK-selfomy-alignment-064",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 2,
        "auto": "No",
        "text": "Verify thao tác \"Lưu điểm danh ca học\" hoàn tất trong ≤ 2 giây"
      },
      {
        "chk": "CHK-selfomy-alignment-065",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Loading & hiệu năng",
        "subcategory": "",
        "priority": 2,
        "auto": "No",
        "text": "Verify giáo viên hoàn tất điểm danh toàn bộ ngày có ≥ 5 lớp trong ≤ 2 phút"
      },
      {
        "chk": "CHK-selfomy-alignment-066",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Accessibility cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify dùng bàn phím (Tab + Enter) mở rộng được thẻ tiêu đề ca học"
      },
      {
        "chk": "CHK-selfomy-alignment-067",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Accessibility cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify dùng bàn phím chọn được trạng thái điểm danh cho từng học viên"
      },
      {
        "chk": "CHK-selfomy-alignment-068",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Accessibility cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "No",
        "text": "Verify thứ tự focus đi lần lượt bộ chọn ngày, ô tìm kiếm, chip trạng thái, bộ lọc giáo viên, danh sách ca học"
      },
      {
        "chk": "CHK-selfomy-alignment-069",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Accessibility cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify nhóm trạng thái điểm danh của mỗi học viên có nhãn truy cập chứa tên học viên đó"
      },
      {
        "chk": "CHK-selfomy-alignment-070",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Accessibility cơ bản",
        "subcategory": "",
        "priority": 4,
        "auto": "Yes",
        "text": "Verify huy hiệu số đếm trên chip trạng thái mang thuộc tính aria-hidden=\"true\""
      },
      {
        "chk": "CHK-selfomy-alignment-071",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Responsive cơ bản",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify ở 375×812 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc"
      },
      {
        "chk": "CHK-selfomy-alignment-072",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Responsive cơ bản",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify ở 375×812 bốn nút trạng thái điểm danh hiển thị dạng lưới 2×2"
      },
      {
        "chk": "CHK-selfomy-alignment-073",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Responsive cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify ở 768×1024 danh sách học viên trong ca học hiển thị dạng thẻ xếp chồng dọc"
      },
      {
        "chk": "CHK-selfomy-alignment-074",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Responsive cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "No",
        "text": "Verify ở 1440×900 ba thẻ nhắc việc nằm trên cùng một hàng"
      },
      {
        "chk": "CHK-selfomy-alignment-075",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "category": "Responsive cơ bản",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify ở 375×812 màn Điểm danh tổng theo ngày không xuất hiện thanh cuộn ngang"
      },
      {
        "chk": "CHK-selfomy-alignment-076",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Edge cases",
        "subcategory": "",
        "priority": 1,
        "auto": "Yes",
        "text": "Verify bấm \"Lưu điểm danh ca học\" 2 lần liên tiếp chỉ làm bộ đếm \"Ca học hôm nay chưa điểm danh\" giảm đúng 1"
      },
      {
        "chk": "CHK-selfomy-alignment-077",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Edge cases",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify tải lại trang khi đã chọn trạng thái nhưng chưa lưu thì ca học vẫn ở trạng thái \"Chưa điểm danh\""
      },
      {
        "chk": "CHK-selfomy-alignment-078",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "category": "Edge cases",
        "subcategory": "",
        "priority": 2,
        "auto": "Yes",
        "text": "Verify bấm Back từ màn Điểm danh về Bảng điều khiển sau khi lưu thì bộ đếm phản ánh số ca chưa điểm danh mới nhất"
      },
      {
        "chk": "CHK-selfomy-alignment-079",
        "ref": [],
        "category": "Edge cases",
        "subcategory": "",
        "priority": 2,
        "auto": "No",
        "text": "Verify phiên đăng nhập hết hạn khi bấm \"Lưu điểm danh ca học\" thì điểm danh không được ghi nhận (ca học vẫn \"Chưa điểm danh\")"
      },
      {
        "chk": "CHK-selfomy-alignment-080",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "category": "Edge cases",
        "subcategory": "",
        "priority": 3,
        "auto": "Yes",
        "text": "Verify chuyển sang ngày khác rồi quay lại ngày đã lưu vẫn thấy ca học ở trạng thái \"Đã điểm danh\""
      }
    ]
  }
];
