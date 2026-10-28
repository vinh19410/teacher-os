window.FEATURE = "selfomy-alignment";
window.UPDATED = "2026-10-27";
window.LANG    = "vi";
window.TESTCASES_DATA = [
  {
    "scope": "story",
    "target": "us-001",
    "file": "testcases-us-001.md",
    "testcases": [
      {
        "stt": "01",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-001",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Giáo viên độc lập thấy đủ 3 thẻ nhắc việc trên Bảng điều khiển",
        "description": "Vai trò không bị giới hạn phạm vi phải thấy đủ 3 thẻ; thiếu thẻ nào là lỗi phân quyền ngược (ẩn nhầm thẻ Học phí vốn chỉ ẩn với Trợ giảng).",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển từ menu \"Bảng điều khiển\"",
            "expected": "Khu vực \"Việc cần làm hôm nay\" hiển thị",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Quan sát các thẻ trong khu vực \"Việc cần làm hôm nay\"",
            "expected": "Hiển thị đủ 3 thẻ \"Ca học hôm nay chưa điểm danh\", \"Bài tập quá hạn chấm > 24h\", \"Học phí đến hạn / quá hạn thu\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "02",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-002",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học, trong đó 1 ca đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay → mở Điểm danh tổng theo ngày, điểm danh 1 ca và bấm \"Lưu điểm danh ca học\"; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3, US-001 AC-002)",
        "retired": false,
        "title": "Bộ đếm \"Ca học hôm nay chưa điểm danh\" khớp số ca chưa điểm danh khi đã có ca đã lưu",
        "description": "Bộ đếm chỉ tính ca trong ngày hiện tại chưa hoàn tất điểm danh; dữ liệu trộn ca đã lưu và chưa lưu để bắt lỗi đếm cả ca đã xong.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 2 ca học",
            "testData": "3 ca học hôm nay, 1 ca đã lưu điểm danh"
          }
        ]
      },
      {
        "stt": "03",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-003",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 4 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 4 lớp có lịch học trong ngày hiện tại; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Thẻ ca học chưa điểm danh cắt danh sách ở 3 ca khi có 4 ca chờ",
        "description": "Boundary của danh sách rút gọn trong thẻ: bộ đếm vẫn là 4 nhưng chỉ liệt kê 3 ca kèm khung giờ và tên lớp.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 4 ca học",
            "testData": "4 ca học chưa điểm danh hôm nay"
          },
          {
            "step": "2",
            "action": "Quan sát danh sách ca học trong thẻ",
            "expected": "Thẻ liệt kê đúng 3 ca học, mỗi dòng có khung giờ và tên lớp (vd \"IELTS 6.5A (18:00 - 19:30)\")",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "04",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-004",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Thẻ bài quá hạn chấm đếm đủ cả 3 trạng thái chờ đã quá 24 giờ",
        "description": "Oracle là tổng số bài Writing/Speaking ở \"Chờ chấm tay\", \"AI đã chấm nháp\", \"Đang rà soát\" nộp quá 24 giờ; thiếu 1 trạng thái là lọt việc tồn đọng.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Bài tập quá hạn chấm > 24h\" hiển thị bộ đếm bằng tổng số bài ở 3 trạng thái đã quá 24 giờ kể từ lúc nộp",
            "testData": "TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "05",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-005",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Bài nộp chưa đủ 24 giờ không bị tính là quá hạn chấm",
        "description": "Boundary dưới của ngưỡng 24 giờ; cần điều khiển thời gian nộp nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển khi bài nộp đạt 23 giờ 59 phút kể từ lúc nộp",
            "expected": "Bộ đếm thẻ \"Bài tập quá hạn chấm > 24h\" không bao gồm bài nộp đó",
            "testData": "1 bài Writing ở trạng thái \"Chờ chấm tay\", nộp cách thời điểm kiểm 23 giờ 59 phút"
          }
        ]
      },
      {
        "stt": "06",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-006",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Bài đã \"Chốt trả bài\" bị loại khỏi thẻ quá hạn chấm dù nộp quá 24 giờ",
        "description": "Thẻ chỉ đếm bài chưa bấm \"Chốt trả bài\"; bài đã trả điểm còn bị đếm sẽ tạo việc ảo.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Bộ đếm thẻ \"Bài tập quá hạn chấm > 24h\" không bao gồm bài đã \"Chốt trả bài\"",
            "testData": "TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "07",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Hiển thị thẻ nhắc việc",
        "checklist": "CHK-selfomy-alignment-007",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Nút \"Làm mới dữ liệu\" kéo bộ đếm mới sau khi điểm danh ở tab khác",
        "description": "Bảng điều khiển mở sẵn không tự biết thay đổi ở tab khác; \"Làm mới dữ liệu\" phải tải lại bộ đếm.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển ở tab 1",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 3",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Ở tab 2 mở Điểm danh tổng theo ngày, mở 1 ca học, bấm \"Đánh dấu tất cả Có mặt\" rồi bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca học đó đổi nhãn sang \"Đã điểm danh\"",
            "testData": "—"
          },
          {
            "step": "3",
            "action": "Quay lại tab 1, bấm \"Làm mới dữ liệu\"",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 2",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "08",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "checklist": "CHK-selfomy-alignment-008",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Mở Điểm danh ngày ->\" mở màn Điểm danh với tham số ngày hôm nay và trạng thái pending",
        "description": "Điều hướng 1 chạm phải mang sẵn bộ lọc trên URL (US-001 AC-001); thiếu tham số thì người dùng phải lọc lại bằng tay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, bấm nút \"Mở Điểm danh ngày ->\" trên thẻ \"Ca học hôm nay chưa điểm danh\"",
            "expected": "Màn Điểm danh tổng theo ngày mở; URL chứa tham số \"?date={ngày hôm nay dạng YYYY-MM-DD}&status=pending\"",
            "testData": "date = ngày hệ thống hiện tại"
          }
        ]
      },
      {
        "stt": "09",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "checklist": "CHK-selfomy-alignment-009",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 2 ca chưa điểm danh và 1 ca đã lưu (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay → điểm danh và lưu 1 ca; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3)",
        "retired": false,
        "title": "Màn Điểm danh mở từ thẻ nhắc việc chỉ còn ca chưa điểm danh hôm nay",
        "description": "Dữ liệu trộn ca đã lưu và ca chưa lưu; oracle là danh sách chỉ còn ca chưa lưu của hôm nay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, bấm \"Mở Điểm danh ngày ->\"",
            "expected": "Danh sách ca học chỉ gồm 2 ca chưa điểm danh của hôm nay; ca đã lưu không xuất hiện",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "10",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "checklist": "CHK-selfomy-alignment-010",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "\"Mở Không gian chấm ->\" mở Không gian chấm với bộ lọc quá hạn > 24h",
        "description": "Điều hướng 1 chạm sang màn chấm bài phải áp sẵn bộ lọc bài quá hạn chưa trả điểm; nhãn/tham số bộ lọc chưa có trong tài liệu.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, bấm nút \"Mở Không gian chấm ->\"",
            "expected": "Màn Không gian chấm bài mở, danh sách chỉ gồm bài nộp quá hạn > 24h chưa trả điểm; nhãn/tham số URL của bộ lọc: TBD (cần BA cấp)",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "11",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Điều hướng 1 chạm",
        "checklist": "CHK-selfomy-alignment-011",
        "ref": [],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Mở Sổ công nợ ->\" mở Sổ công nợ với bộ lọc quá hạn và sắp đến hạn",
        "description": "Nguồn là mô tả nút số 12 màn dashboard-reminders; tham số URL phải đủ cả 2 giá trị overdue và due_soon.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, bấm nút \"Mở Sổ công nợ ->\" trên thẻ \"Học phí đến hạn / quá hạn thu\"",
            "expected": "Màn Sổ công nợ mở; URL chứa tham số \"?status=overdue,due_soon\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "12",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Trạng thái hoàn tất",
        "checklist": "CHK-selfomy-alignment-012",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; mọi ca học hôm nay đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay → điểm danh và lưu toàn bộ ca hôm nay; nguồn: UC-daily-attendance-and-holiday bước 3)",
        "retired": false,
        "title": "Thẻ ca học chuyển sang \"Đã hoàn tất hôm nay\" khi mọi ca đã điểm danh",
        "description": "Trạng thái Zero Inbox của thẻ khi bộ đếm bằng 0.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" có bộ đếm 0 và hiển thị nhãn \"Đã hoàn tất hôm nay\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "13",
        "category": "Bảng điều khiển — Việc cần làm hôm nay",
        "subcategory": "Trạng thái hoàn tất",
        "checklist": "CHK-selfomy-alignment-013",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; mọi ca học hôm nay đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo lớp có lịch học hôm nay → điểm danh và lưu toàn bộ ca hôm nay; nguồn: UC-daily-attendance-and-holiday bước 3)",
        "retired": false,
        "title": "Thẻ có bộ đếm 0 đổi nút hành động sang \"Xem lịch sử\"",
        "description": "Ở trạng thái Zero Inbox, nút \"Mở Điểm danh ngày ->\" được thay bằng \"Xem lịch sử\".",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, quan sát nút hành động trên thẻ \"Ca học hôm nay chưa điểm danh\"",
            "expected": "Nút hành động hiển thị nhãn \"Xem lịch sử\"; không còn nút \"Mở Điểm danh ngày ->\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "14",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "checklist": "CHK-selfomy-alignment-014",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Mở Điểm danh từ menu không có tham số date thì mặc định ngày hôm nay",
        "description": "Giá trị mặc định của bộ chọn ngày khi URL không mang \"date\".",
        "steps": [
          {
            "step": "1",
            "action": "Bấm menu \"Điểm danh ngày\" ở thanh điều hướng bên",
            "expected": "Màn Điểm danh tổng theo ngày mở; bộ chọn ngày hiển thị ngày hôm nay",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "15",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "checklist": "CHK-selfomy-alignment-015",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca học lớp \"IELTS 6.5A\" (18:00 - 19:30) và \"IELTS 5.0B\" (19:30 - 21:00) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học ngày 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)",
        "retired": false,
        "title": "URL \"?date=2026-10-26\" liệt kê đủ ca học của mọi lớp có lịch ngày đó",
        "description": "Danh sách theo ngày phải đủ mọi lớp có ca, không sót lớp nào (US-001 AC-002).",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với tham số URL \"?date=2026-10-26\"",
            "expected": "Bộ chọn ngày hiển thị 26/10/2026; danh sách có đủ 2 ca \"IELTS 6.5A\" (18:00 - 19:30) và \"IELTS 5.0B\" (19:30 - 21:00)",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "16",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "checklist": "CHK-selfomy-alignment-016",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Đổi ngày trên bộ chọn đẩy ngày mới lên tham số \"date\" của URL",
        "description": "Bộ lọc sống trong URL để chia sẻ/khôi phục được.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Bộ chọn ngày hiển thị 26/10/2026",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Chọn ngày 27/10/2026 trên bộ chọn ngày",
            "expected": "URL đổi tham số thành \"date=2026-10-27\"",
            "testData": "27/10/2026"
          }
        ]
      },
      {
        "stt": "17",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Chọn ngày",
        "checklist": "CHK-selfomy-alignment-017",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Nút \"Hôm nay\" đưa bộ chọn từ ngày khác về ngày hiện tại",
        "description": "Nút nhanh cạnh bộ chọn ngày.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Bộ chọn ngày hiển thị 26/10/2026",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Bấm nút \"Hôm nay\"",
            "expected": "Bộ chọn ngày hiển thị ngày hiện tại; tham số \"date\" trên URL là ngày hiện tại",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "18",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Loại trừ Lịch nghỉ chung",
        "checklist": "CHK-selfomy-alignment-018",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 nằm trong Lịch nghỉ chung toàn tổ chức có lớp \"IELTS 6.5A\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 → mở Lịch dạy, bấm \"Tạo lịch nghỉ chung\", khoảng ngày 26/10/2026, phạm vi toàn tổ chức, phương án \"Dời lịch (+1 buổi)\" → \"Xác nhận áp dụng lịch nghỉ\"; nguồn: UC-daily-attendance-and-holiday bước 4-7, BR-selfomy-alignment-003)",
        "retired": false,
        "title": "Buổi học trùng Lịch nghỉ chung toàn tổ chức bị loại khỏi danh sách điểm danh",
        "description": "Buổi đã chuyển \"Nghỉ lễ\" không được hiện để điểm danh nhầm; sai ở đây làm lệch số buổi trong gói học phí.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Không có ca học nào của lớp \"IELTS 6.5A\" trong danh sách",
            "testData": "date=2026-10-26; Tên kỳ nghỉ \"Nghỉ kiểm thử\""
          }
        ]
      },
      {
        "stt": "19",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Loại trừ Lịch nghỉ chung",
        "checklist": "CHK-selfomy-alignment-019",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có Lịch nghỉ chung chỉ áp dụng lớp \"IELTS 6.5A\", lớp \"IELTS 5.0B\" cũng có ca ngày đó (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → \"Tạo lịch nghỉ chung\" khoảng ngày 26/10/2026, phạm vi lớp chọn lọc \"IELTS 6.5A\" → \"Xác nhận áp dụng lịch nghỉ\"; nguồn: UC-daily-attendance-and-holiday bước 4-7)",
        "retired": false,
        "title": "Lịch nghỉ chung chọn lọc chỉ loại lớp trong phạm vi, lớp ngoài phạm vi vẫn hiện",
        "description": "Chống loại trừ quá tay: lớp không chọn trong phạm vi nghỉ vẫn phải điểm danh bình thường.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Ca học \"IELTS 5.0B\" (19:30 - 21:00) có trong danh sách; ca \"IELTS 6.5A\" không có",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "20",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-020",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh và ca \"IELTS 5.0B\" đã lưu (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → điểm danh và lưu ca \"IELTS 5.0B\"; nguồn: UC-daily-attendance-and-holiday bước 3, US-001 AC-002)",
        "retired": false,
        "title": "Chip \"Chưa điểm danh\" ẩn ca đã lưu, chỉ giữ ca chưa lưu",
        "description": "Bộ lọc cốt lõi của FR-005 để giáo viên không bỏ sót ca.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", bấm chip \"Chưa điểm danh\"",
            "expected": "Danh sách chỉ có ca \"IELTS 6.5A\"; ca \"IELTS 5.0B\" không hiển thị",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "21",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-021",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh và ca \"IELTS 5.0B\" đã lưu (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 → điểm danh và lưu ca \"IELTS 5.0B\"; nguồn: UC-daily-attendance-and-holiday bước 3)",
        "retired": false,
        "title": "Chip \"Đã điểm danh\" chỉ giữ ca đã lưu",
        "description": "Chiều ngược của bộ lọc trạng thái.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", bấm chip \"Đã điểm danh\"",
            "expected": "Danh sách chỉ có ca \"IELTS 5.0B\"; ca \"IELTS 6.5A\" không hiển thị",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "22",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-022",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có 3 ca học, 1 ca đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học 26/10/2026 → điểm danh và lưu 1 ca; nguồn: UC-daily-attendance-and-holiday bước 3)",
        "retired": false,
        "title": "Số đếm 3 chip trạng thái khớp số ca thực tế của ngày đang chọn",
        "description": "Dữ liệu 3 ca (2 chưa, 1 đã lưu) để số đếm 3 chip khác nhau, bắt lỗi hoán đổi số.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Chip \"Tất cả\" hiển thị 3, \"Chưa điểm danh\" hiển thị 2, \"Đã điểm danh\" hiển thị 1",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "23",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-023",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Chọn chip \"Chưa điểm danh\" ghi \"status=pending\" lên URL",
        "description": "Bộ lọc sống trong URL; giá trị pending/completed theo mô tả chip ở màn daily-attendance.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", bấm chip \"Chưa điểm danh\"",
            "expected": "URL chứa tham số \"status=pending\"",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Bấm chip \"Đã điểm danh\"",
            "expected": "URL chứa tham số \"status=completed\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "24",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-024",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca học lớp \"IELTS 6.5A\" và \"IELTS 5.0B\" (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Tìm theo tên lớp chỉ giữ ca của lớp khớp từ khoá",
        "description": "Từ khoá \"6.5A\" phân biệt được 2 lớp mẫu.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", nhập từ khoá vào ô \"Tìm lớp/HV\"",
            "expected": "Danh sách chỉ còn ca \"IELTS 6.5A\"",
            "testData": "\"6.5A\""
          }
        ]
      },
      {
        "stt": "25",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-025",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" (có học viên \"Trần Hoàng Nam\") và ca \"IELTS 5.0B\" (không có học viên này) (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026, thêm \"Trần Hoàng Nam\" vào \"IELTS 6.5A\"; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-003)",
        "retired": false,
        "title": "Tìm theo tên học viên chỉ giữ ca có học viên đó",
        "description": "Học viên \"Trần Hoàng Nam\" chỉ thuộc lớp \"IELTS 6.5A\".",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", nhập từ khoá vào ô \"Tìm lớp/HV\"",
            "expected": "Danh sách chỉ còn ca \"IELTS 6.5A\"",
            "testData": "\"Trần Hoàng Nam\""
          }
        ]
      },
      {
        "stt": "26",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-026",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Từ khoá tìm kiếm chỉ lên URL \"q\" sau khi ngừng gõ khoảng 300ms",
        "description": "Debounce 300ms theo quy ước UI; URL không đổi theo từng phím gõ.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày, gõ liên tục từ khoá vào ô \"Tìm lớp/HV\" và kiểm URL ngay sau phím cuối",
            "expected": "URL chưa có tham số \"q\"",
            "testData": "\"IELTS\""
          },
          {
            "step": "2",
            "action": "Ngừng gõ, chờ khoảng 300ms",
            "expected": "URL chứa tham số \"q=IELTS\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "27",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-027",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Chủ trung tâm; ngày 26/10/2026 có ca \"IELTS 6.5A\" (GV \"Minh Tran\") và \"IELTS 5.0B\" (GV \"Lan Pham\") (dựng: đăng nhập tài khoản test Chủ trung tâm → mời 2 Giáo viên đứng lớp và phân công mỗi người 1 lớp có lịch học 26/10/2026; nguồn: FR-selfomy-alignment-029, UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Chủ trung tâm lọc theo giáo viên chỉ giữ ca của giáo viên đó",
        "description": "Bộ lọc \"Giáo viên\" dành cho Chủ trung tâm/Giáo vụ.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", chọn \"Minh Tran\" ở bộ lọc \"Giáo viên\"",
            "expected": "Danh sách chỉ còn ca \"IELTS 6.5A\" (GV: Minh Tran)",
            "testData": "Giáo viên = \"Minh Tran\""
          }
        ]
      },
      {
        "stt": "28",
        "category": "Điểm danh tổng theo ngày — chọn ngày và lọc ca học",
        "subcategory": "Lọc và tìm kiếm",
        "checklist": "CHK-selfomy-alignment-028",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh và ca \"IELTS 5.0B\" (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "URL có đủ \"date\", \"status\", \"q\" khôi phục cả 3 bộ lọc khi mở trực tiếp",
        "description": "Bộ lọc sống trong URL phải tái lập được từ link chia sẻ.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26&status=pending&q=6.5A\"",
            "expected": "Bộ chọn ngày là 26/10/2026, chip \"Chưa điểm danh\" đang chọn, ô \"Tìm lớp/HV\" chứa \"6.5A\"; danh sách chỉ còn ca \"IELTS 6.5A\"",
            "testData": "date=2026-10-26, status=pending, q=6.5A"
          }
        ]
      },
      {
        "stt": "29",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "checklist": "CHK-selfomy-alignment-029",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với học viên \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)",
        "retired": false,
        "title": "Bấm thẻ tiêu đề ca học mở danh sách học viên inline, URL giữ nguyên",
        "description": "Giá trị cốt lõi của US-001: điểm danh không phải vào từng trang lớp; oracle là danh sách hiện ra và URL không đổi.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", bấm thẻ tiêu đề ca \"IELTS 6.5A\"",
            "expected": "Danh sách học viên của ca hiển thị ngay dưới thẻ tiêu đề; URL vẫn là màn Điểm danh tổng theo ngày \"?date=2026-10-26\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "30",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "checklist": "CHK-selfomy-alignment-030",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" (18:00 - 19:30, Phòng 201, GV \"Minh Tran\", sĩ số 12) chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" phòng 201, GV \"Minh Tran\", 12 học viên, có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Thẻ tiêu đề ca học hiển thị đủ 6 thông tin",
        "description": "Đủ thông tin để giáo viên nhận ra ca mà không cần mở rộng.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", quan sát thẻ tiêu đề ca \"IELTS 6.5A\"",
            "expected": "Thẻ hiển thị khung giờ \"18:00 - 19:30\", tên lớp \"IELTS 6.5A\", \"Phòng 201\", \"GV: Minh Tran\", \"Sĩ số: 12 HV\" và nhãn trạng thái điểm danh của ca",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "31",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Mở rộng ca học",
        "checklist": "CHK-selfomy-alignment-031",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" sĩ số 12 chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" 12 học viên có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Số dòng học viên khi mở rộng bằng sĩ số trên thẻ tiêu đề",
        "description": "Lệch giữa sĩ số và danh sách là dấu hiệu sót học viên khi điểm danh.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", bấm thẻ tiêu đề ca \"IELTS 6.5A\"",
            "expected": "Danh sách mở rộng có đúng 12 học viên, bằng \"Sĩ số: 12 HV\" trên thẻ tiêu đề",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "32",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "checklist": "CHK-selfomy-alignment-032",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với học viên \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + US-001 AC-002)",
        "retired": false,
        "title": "Mỗi dòng học viên có đủ 4 trạng thái điểm danh chuẩn",
        "description": "Bộ 4 trạng thái chuẩn theo US-001 AC-002.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", mở rộng ca \"IELTS 6.5A\"",
            "expected": "Mỗi dòng học viên có đủ 4 lựa chọn \"Có mặt\", \"Vắng có phép\", \"Vắng không phép\", \"Đi muộn\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "33",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "checklist": "CHK-selfomy-alignment-033",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh có học viên \"Nguyễn Minh Anh\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Mỗi học viên chỉ giữ 1 trạng thái: chọn mới thì bỏ chọn cũ",
        "description": "Nhóm trạng thái là chọn-một; 2 trạng thái cùng lúc làm bản ghi điểm danh mơ hồ.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", chọn \"Có mặt\" cho \"Nguyễn Minh Anh\"",
            "expected": "\"Có mặt\" của \"Nguyễn Minh Anh\" ở trạng thái đã chọn",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Chọn \"Đi muộn\" cho \"Nguyễn Minh Anh\"",
            "expected": "\"Đi muộn\" đã chọn; \"Có mặt\" của \"Nguyễn Minh Anh\" không còn được chọn",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "34",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Chọn trạng thái và ghi chú",
        "checklist": "CHK-selfomy-alignment-034",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh có học viên \"Trần Hoàng Nam\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ghi chú học vụ còn nguyên khi mở lại ca đã lưu",
        "description": "Ghi chú phải đi kèm bản ghi điểm danh của đúng học viên (US-001 AC-002).",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", chọn \"Vắng có phép\" cho \"Trần Hoàng Nam\" và nhập ô \"Ghi chú học vụ\" của học viên này",
            "expected": "Ô \"Ghi chú học vụ\" của \"Trần Hoàng Nam\" hiển thị nội dung vừa nhập",
            "testData": "\"Xin nghỉ ốm\""
          },
          {
            "step": "2",
            "action": "Bấm \"Lưu điểm danh ca học\", tải lại trang rồi mở rộng lại ca \"IELTS 6.5A\"",
            "expected": "Ô \"Ghi chú học vụ\" của \"Trần Hoàng Nam\" hiển thị \"Xin nghỉ ốm\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "35",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "checklist": "CHK-selfomy-alignment-035",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Đánh dấu tất cả Có mặt\" gán \"Có mặt\" cho mọi học viên còn trống",
        "description": "Thao tác nhanh giúp đạt mục tiêu điểm danh nhanh của NFR-008.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\"",
            "expected": "Cả 3 học viên \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" ở trạng thái \"Có mặt\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "36",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "checklist": "CHK-selfomy-alignment-036",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Đánh dấu tất cả Có mặt\" không ghi đè học viên đã chọn trạng thái trước",
        "description": "Nút chỉ điền học viên chưa chọn; ghi đè sẽ xoá mất lựa chọn vắng của giáo viên.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", chọn \"Vắng có phép\" cho \"Trần Hoàng Nam\"",
            "expected": "\"Trần Hoàng Nam\" ở trạng thái \"Vắng có phép\"",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Bấm \"Đánh dấu tất cả Có mặt\"",
            "expected": "\"Trần Hoàng Nam\" vẫn \"Vắng có phép\"; \"Nguyễn Minh Anh\" và \"Lê Thu Hà\" là \"Có mặt\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "37",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "checklist": "CHK-selfomy-alignment-037",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" và \"IELTS 5.0B\" cùng chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Đánh dấu tất cả Có mặt\" chỉ tác động ca đang mở",
        "description": "Phạm vi thao tác nhanh là 1 ca; tràn sang ca khác sẽ điểm danh nhầm lớp.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\"",
            "expected": "Học viên ca \"IELTS 6.5A\" ở trạng thái \"Có mặt\"",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Mở rộng ca \"IELTS 5.0B\"",
            "expected": "Không học viên nào của ca \"IELTS 5.0B\" được chọn trạng thái; nhãn ca vẫn chưa điểm danh",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "38",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Đánh dấu tất cả Có mặt",
        "checklist": "CHK-selfomy-alignment-038",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: US-001 AC-003)",
        "retired": false,
        "title": "Đánh dấu tất cả rồi sửa 1 học viên vắng có phép, lưu ghi nhận đúng từng người",
        "description": "Kịch bản chính của US-001 AC-003; oracle là trạng thái đã lưu khi mở lại, không phải trạng thái trên form.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\"",
            "expected": "Cả 3 học viên ở trạng thái \"Có mặt\"",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Chọn \"Vắng có phép\" cho \"Trần Hoàng Nam\", bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca \"IELTS 6.5A\" đổi nhãn sang \"Đã điểm danh\"",
            "testData": "—"
          },
          {
            "step": "3",
            "action": "Tải lại trang, mở rộng lại ca \"IELTS 6.5A\"",
            "expected": "\"Trần Hoàng Nam\" là \"Vắng có phép\"; \"Nguyễn Minh Anh\" và \"Lê Thu Hà\" là \"Có mặt\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "39",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-039",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Lưu ca học ghi nhận đủ 4 loại trạng thái khác nhau cho từng học viên",
        "description": "Dùng trạng thái khác nhau cho mỗi học viên để bắt lỗi lưu lệch dòng.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", chọn trạng thái cho từng học viên rồi bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca \"IELTS 6.5A\" đổi nhãn sang \"Đã điểm danh\"",
            "testData": "\"Nguyễn Minh Anh\" = \"Có mặt\"; \"Trần Hoàng Nam\" = \"Vắng không phép\"; \"Lê Thu Hà\" = \"Đi muộn\""
          },
          {
            "step": "2",
            "action": "Tải lại trang, mở rộng lại ca \"IELTS 6.5A\"",
            "expected": "Trạng thái từng học viên đúng như đã chọn ở Step 1",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "40",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-040",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Lưu điểm danh xong vẫn ở màn Điểm danh tổng theo ngày",
        "description": "Giữ ngữ cảnh để điểm danh tiếp ca kế (US-001 AC-002 \"mà không chuyển trang\").",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "URL vẫn là màn Điểm danh tổng theo ngày \"?date=2026-10-26\"; danh sách ca học của ngày vẫn hiển thị",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "41",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-041",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Lưu điểm danh thành công hiện Toast thành công",
        "description": "Phản hồi xác nhận cho người dùng; wording Toast chưa có trong tài liệu nguồn.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "Hiển thị Toast thành công với nội dung: TBD (cần BA cấp)",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "42",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-042",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Nhãn ca học đổi từ chưa điểm danh sang \"Đã điểm danh\" sau khi lưu",
        "description": "Chuyển trạng thái ca học theo US-001 AC-002.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "Nhãn trạng thái trên thẻ tiêu đề ca \"IELTS 6.5A\" là \"Đã điểm danh\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "43",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-043",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Lưu 1 ca hôm nay làm bộ đếm Bảng điều khiển giảm đúng 1",
        "description": "Đồng bộ giữa 2 màn theo US-001 AC-002; dùng ca của ngày hiện tại vì bộ đếm chỉ tính hôm nay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 3",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Bấm \"Mở Điểm danh ngày ->\", mở rộng 1 ca, bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "Ca đó đổi nhãn sang \"Đã điểm danh\"",
            "testData": "—"
          },
          {
            "step": "3",
            "action": "Mở lại Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 2",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "44",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-044",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" và \"IELTS 5.0B\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Lưu 1 ca làm số đếm chip \"Chưa điểm danh\" giảm đúng 1",
        "description": "Số đếm chip phải cập nhật ngay trên cùng màn, không cần tải lại.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Chip \"Chưa điểm danh\" hiển thị 2",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "Chip \"Chưa điểm danh\" hiển thị 1",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "45",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-045",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Thẻ ca đã lưu khi thu gọn hiện tỷ lệ \"{số Có mặt}/{sĩ số} Có mặt\"",
        "description": "Với 1 học viên vắng trong 3, tỷ lệ phải là 2/3 để bắt lỗi đếm cả người vắng.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", chọn \"Vắng có phép\" cho \"Trần Hoàng Nam\", bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca đổi nhãn sang \"Đã điểm danh\"",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Bấm thẻ tiêu đề ca \"IELTS 6.5A\" để thu gọn",
            "expected": "Thẻ thu gọn hiển thị \"2/3 Có mặt\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "46",
        "category": "Điểm danh inline và lưu ca học",
        "subcategory": "Lưu điểm danh ca học",
        "checklist": "CHK-selfomy-alignment-046",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 2 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 2 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + bước 3)",
        "retired": false,
        "title": "Lưu hết mọi ca hôm nay đưa bộ đếm Bảng điều khiển về 0",
        "description": "Kết quả cuối của UC bước 3 (cập nhật số lớp chưa điểm danh về 0).",
        "steps": [
          {
            "step": "1",
            "action": "Mở Điểm danh tổng theo ngày của hôm nay, với từng ca: mở rộng, bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"",
            "expected": "Cả 2 ca có nhãn \"Đã điểm danh\"",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 0",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "47",
        "category": "Validation & Error handling",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-047",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh có học viên \"Nguyễn Minh Anh\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ghi chú học vụ dài đúng 255 ký tự lưu không bị cắt",
        "description": "Boundary trên của giới hạn 255 ký tự (mô tả ô Ghi chú học vụ, màn daily-attendance).",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", nhập ô \"Ghi chú học vụ\" của \"Nguyễn Minh Anh\", bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca đổi nhãn sang \"Đã điểm danh\"",
            "testData": "Chuỗi 255 ký tự \"a\" (sinh theo giới hạn 255 ký tự)"
          },
          {
            "step": "2",
            "action": "Tải lại trang, mở rộng lại ca \"IELTS 6.5A\"",
            "expected": "Ô \"Ghi chú học vụ\" của \"Nguyễn Minh Anh\" chứa đúng 255 ký tự đã nhập",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "48",
        "category": "Validation & Error handling",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-048",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ghi chú học vụ để trống không chặn việc lưu điểm danh",
        "description": "Ghi chú là tuỳ chọn; bắt buộc nhầm sẽ làm chậm điểm danh.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", không nhập \"Ghi chú học vụ\", bấm \"Lưu điểm danh ca học\"",
            "expected": "Ca \"IELTS 6.5A\" đổi nhãn sang \"Đã điểm danh\"",
            "testData": "Ghi chú học vụ = rỗng"
          }
        ]
      },
      {
        "stt": "49",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-049",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\"; hôm nay \"IELTS 6.5A\" và \"IELTS 5.0B\" (không phân công) đều có ca chưa điểm danh (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học hôm nay → mời nhân sự vai trò Trợ giảng qua Email → phân công Trợ giảng phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + US-001 AC-001)",
        "retired": false,
        "title": "Trợ giảng chỉ được đếm ca chưa điểm danh của lớp được phân công",
        "description": "Cô lập dữ liệu theo phân công (US-001 AC-001); tổ chức có thêm lớp không phân công để bắt lỗi đếm toàn tổ chức.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 1 và chỉ liệt kê ca \"IELTS 6.5A\"; không có \"IELTS 5.0B\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "50",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-050",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Trợ giảng chỉ được đếm bài quá hạn chấm của lớp được phân công",
        "description": "Thẻ \"Bài tập quá hạn chấm > 24h\" cũng phải cô lập theo phân công; cần bài nộp đã quá 24 giờ ở cả 2 lớp.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Bộ đếm thẻ \"Bài tập quá hạn chấm > 24h\" chỉ bằng số bài quá hạn của lớp \"IELTS 6.5A\"",
            "testData": "TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "51",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-051",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\" (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029)",
        "retired": false,
        "title": "Thẻ Học phí bị ẩn hoàn toàn với Trợ giảng",
        "description": "Trợ giảng chỉ thấy 2 thẻ ca học và bài chấm (quy tắc RBAC màn dashboard-reminders).",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Khu vực \"Việc cần làm hôm nay\" chỉ có thẻ \"Ca học hôm nay chưa điểm danh\" và \"Bài tập quá hạn chấm > 24h\"; không có thẻ \"Học phí đến hạn / quá hạn thu\" và nút \"Mở Sổ công nợ ->\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "52",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-052",
        "ref": [
          "NFR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "No",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\"; tổ chức có học viên đang nợ học phí (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + NFR-selfomy-alignment-005)",
        "retired": false,
        "title": "Phản hồi dữ liệu Bảng điều khiển của Trợ giảng không chứa công nợ",
        "description": "Ẩn trên giao diện chưa đủ; NFR-005 yêu cầu chặn cả ở truy vấn dữ liệu. Cần soi phản hồi mạng nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở công cụ nhà phát triển của trình duyệt (tab Network), mở Bảng điều khiển",
            "expected": "Bảng điều khiển tải xong",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Kiểm tra nội dung mọi phản hồi dữ liệu của Bảng điều khiển",
            "expected": "Không phản hồi nào chứa số học viên nợ, số tiền nợ hoặc danh sách công nợ",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "53",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-053",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\"; ngày 26/10/2026 có ca \"IELTS 6.5A\" và \"IELTS 5.0B\" (không phân công) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học 26/10/2026 → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + UC-daily-attendance-and-holiday 4a1)",
        "retired": false,
        "title": "Trợ giảng chỉ thấy ca của lớp được phân công trên màn Điểm danh",
        "description": "UC extension 4a1: cô lập áp cho cả màn Điểm danh tổng theo ngày.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Danh sách chỉ có ca \"IELTS 6.5A\"; không có ca \"IELTS 5.0B\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "54",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-054",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\" (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029)",
        "retired": false,
        "title": "Bộ lọc \"Giáo viên\" khoá theo phạm vi phân công của Trợ giảng",
        "description": "Trợ giảng không dùng bộ lọc để mở rộng ra lớp khác.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", mở bộ lọc \"Giáo viên\"",
            "expected": "Bộ lọc bị khoá vào phạm vi lớp được phân công; không chọn được giáo viên/lớp ngoài \"IELTS 6.5A\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "55",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-055",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên đứng lớp phụ trách \"IELTS 6.5A\"; ngày 26/10/2026 có ca \"IELTS 6.5A\" và \"IELTS 5.0B\" (không phân công) (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học 26/10/2026 → mời nhân sự vai trò Giáo viên đứng lớp qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản đó; nguồn: FR-selfomy-alignment-029 + UC-daily-attendance-and-holiday 4a1)",
        "retired": false,
        "title": "Giáo viên đứng lớp chỉ thấy ca của lớp mình trên màn Điểm danh",
        "description": "Cô lập theo phân công áp cho vai trò Giáo viên đứng lớp, không chỉ Trợ giảng.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\"",
            "expected": "Danh sách chỉ có ca \"IELTS 6.5A\"; không có ca \"IELTS 5.0B\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "56",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-056",
        "ref": [
          "FR-selfomy-alignment-029"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên đứng lớp phụ trách \"IELTS 6.5A\"; hôm nay \"IELTS 6.5A\" và \"IELTS 5.0B\" (không phân công) đều có ca chưa điểm danh (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học hôm nay → mời nhân sự vai trò Giáo viên đứng lớp qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản đó; nguồn: FR-selfomy-alignment-029)",
        "retired": false,
        "title": "Bộ đếm ca chưa điểm danh của Giáo viên đứng lớp chỉ tính lớp được phân công",
        "description": "Cô lập trên Bảng điều khiển cho vai trò Giáo viên đứng lớp.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 1 và chỉ liệt kê ca \"IELTS 6.5A\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "57",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-057",
        "ref": [
          "NFR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "No",
        "preconditions": "Đã đăng nhập Trợ giảng phụ trách \"IELTS 6.5A\"; lớp \"IELTS 5.0B\" không phân công có ca học (dựng: đăng nhập Chủ trung tâm → tạo 2 lớp có lịch học → mời nhân sự vai trò Trợ giảng qua Email → phân công phụ trách \"IELTS 6.5A\" → đăng nhập bằng tài khoản Trợ giảng; nguồn: FR-selfomy-alignment-029 + NFR-selfomy-alignment-005)",
        "retired": false,
        "title": "Trợ giảng mở link trực tiếp tới ca của lớp không phân công bị chặn",
        "description": "NFR-005 chặn cả truy vấn dữ liệu, không chỉ ẩn giao diện; đường dẫn trực tiếp và cách hệ thống báo chặn chưa có trong tài liệu.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập trực tiếp đường dẫn ca học của lớp \"IELTS 5.0B\"",
            "expected": "Không hiển thị danh sách học viên của \"IELTS 5.0B\"; cách báo chặn (thông báo/điều hướng): TBD (cần BA cấp)",
            "testData": "TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "58",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-058",
        "ref": [],
        "priority": 1,
        "auto": "No",
        "preconditions": "—",
        "retired": false,
        "title": "Người chưa đăng nhập mở URL Điểm danh bị đưa về màn đăng nhập",
        "description": "Tiền điều kiện UC là đã đăng nhập; truy cập ẩn danh không được lộ danh sách ca học.",
        "steps": [
          {
            "step": "1",
            "action": "Ở phiên trình duyệt chưa đăng nhập, truy cập URL màn Điểm danh tổng theo ngày",
            "expected": "Trình duyệt chuyển về màn đăng nhập; không hiển thị danh sách ca học",
            "testData": "TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "59",
        "category": "Phân quyền & cô lập dữ liệu",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-059",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo vụ (dựng: đăng nhập Chủ trung tâm → mời nhân sự vai trò Quản lý/Giáo vụ qua Email → đăng nhập bằng tài khoản Giáo vụ; nguồn: FR-selfomy-alignment-029 + US-001 AC-001)",
        "retired": false,
        "title": "Giáo vụ thấy đủ 3 thẻ nhắc việc kể cả thẻ Học phí",
        "description": "Giáo vụ thuộc nhóm thấy đủ thẻ theo US-001 AC-001; ẩn nhầm thẻ Học phí là lỗi phân quyền ngược.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển",
            "expected": "Hiển thị đủ 3 thẻ \"Ca học hôm nay chưa điểm danh\", \"Bài tập quá hạn chấm > 24h\", \"Học phí đến hạn / quá hạn thu\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "60",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-060",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "priority": 3,
        "auto": "No",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Khu vực nhắc việc hiện trạng thái đang tải trước khi có bộ đếm",
        "description": "Không để khu vực trống hoặc hiện số 0 giả trong lúc tải; dạng chỉ báo tải chưa được đặc tả.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển và quan sát khu vực \"Việc cần làm hôm nay\" trước khi bộ đếm xuất hiện",
            "expected": "Khu vực hiển thị chỉ báo đang tải (dạng chỉ báo: TBD cần BA cấp); không hiển thị bộ đếm 0 trong lúc tải",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "61",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-061",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "priority": 3,
        "auto": "No",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Danh sách ca học hiện trạng thái đang tải khi đổi sang ngày khác",
        "description": "Tránh hiển thị ca của ngày cũ dưới ngày mới trong lúc tải; dạng chỉ báo tải chưa được đặc tả.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", chọn ngày 27/10/2026 trên bộ chọn ngày và quan sát danh sách trước khi tải xong",
            "expected": "Danh sách ca học hiển thị chỉ báo đang tải (dạng chỉ báo: TBD cần BA cấp)",
            "testData": "27/10/2026"
          }
        ]
      },
      {
        "stt": "62",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-062",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Khu vực nhắc việc tải ≤ 2 giây ở 95% lượt đo với 50 lớp, 1.000 học viên",
        "description": "Ngưỡng NFR-001 đo trên bộ dữ liệu quy mô; cần bộ dữ liệu và công cụ đo nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Đo thời gian từ lúc mở Bảng điều khiển tới khi cả 3 thẻ hiển thị bộ đếm, lặp nhiều lượt",
            "expected": "≥ 95% lượt đo hoàn tất trong ≤ 2 giây",
            "testData": "Tổ chức 50 lớp, 1.000 học viên; số lượt đo: TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "63",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-063",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Danh sách ca học tải và lọc ≤ 2 giây ở 95% lượt đo với 50 lớp, 1.000 học viên",
        "description": "Ngưỡng NFR-001 cho thao tác tải và lọc trên màn Điểm danh; cần bộ dữ liệu quy mô nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Đo thời gian mở màn Điểm danh tổng theo ngày và bấm chip \"Chưa điểm danh\" tới khi danh sách cập nhật xong, lặp nhiều lượt",
            "expected": "≥ 95% lượt đo hoàn tất trong ≤ 2 giây",
            "testData": "Tổ chức 50 lớp, 1.000 học viên; số lượt đo: TBD (cần BA cấp)"
          }
        ]
      },
      {
        "stt": "64",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-064",
        "ref": [
          "NFR-selfomy-alignment-001"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" sĩ số 12 chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" 12 học viên có lịch học 26/10/2026; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "\"Lưu điểm danh ca học\" hoàn tất trong ≤ 2 giây",
        "description": "Ngưỡng lưu theo US-001 AC-002 và mô tả nút Lưu; đo bằng đồng hồ nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", bấm \"Lưu điểm danh ca học\" và đo tới khi nhãn đổi sang \"Đã điểm danh\"",
            "expected": "Thời gian đo ≤ 2 giây",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "65",
        "category": "Loading & hiệu năng",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-065",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 2,
        "auto": "No",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 5 lớp có ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 5 lớp có lịch học hôm nay kèm học viên; nguồn: NFR-selfomy-alignment-008 + UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Điểm danh trọn ngày 5 lớp hoàn tất trong ≤ 2 phút",
        "description": "Mục tiêu usability của NFR-008, đo thao tác người thật nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Bắt đầu bấm giờ từ Bảng điều khiển, bấm \"Mở Điểm danh ngày ->\", lần lượt điểm danh và \"Lưu điểm danh ca học\" cho cả 5 ca",
            "expected": "Cả 5 ca có nhãn \"Đã điểm danh\"; tổng thời gian ≤ 2 phút",
            "testData": "5 lớp, mỗi lớp 1 ca hôm nay"
          }
        ]
      },
      {
        "stt": "66",
        "category": "Accessibility cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-066",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Mở rộng thẻ tiêu đề ca học chỉ bằng Tab và Enter",
        "description": "NFR-008 yêu cầu điều hướng bàn phím; thẻ tiêu đề phải nhận focus và kích hoạt được.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", nhấn Tab tới khi thẻ tiêu đề ca \"IELTS 6.5A\" nhận focus",
            "expected": "Thẻ tiêu đề ca \"IELTS 6.5A\" hiển thị trạng thái focus",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Nhấn Enter",
            "expected": "Danh sách học viên của ca \"IELTS 6.5A\" mở rộng tại chỗ",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "67",
        "category": "Accessibility cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-067",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh có học viên \"Nguyễn Minh Anh\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Chọn trạng thái điểm danh của học viên chỉ bằng bàn phím",
        "description": "Nhóm trạng thái phải thao tác được không cần chuột.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", nhấn Tab tới nhóm trạng thái của \"Nguyễn Minh Anh\"",
            "expected": "Nhóm trạng thái của \"Nguyễn Minh Anh\" nhận focus",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Dùng phím mũi tên chuyển tới \"Đi muộn\" và nhấn Space",
            "expected": "\"Đi muộn\" của \"Nguyễn Minh Anh\" ở trạng thái đã chọn",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "68",
        "category": "Accessibility cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-068",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "No",
        "preconditions": "Đã đăng nhập Chủ trung tâm (dựng: đăng nhập tài khoản test vai trò Chủ trung tâm; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Thứ tự Tab đi theo bố cục bộ lọc rồi tới danh sách ca học",
        "description": "Thứ tự focus phải khớp thứ tự trực quan của màn daily-attendance; đánh giá bằng quan sát nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày, nhấn Tab liên tục từ đầu vùng nội dung",
            "expected": "Focus đi lần lượt: bộ chọn ngày, ô \"Tìm lớp/HV\", nhóm chip trạng thái, bộ lọc \"Giáo viên\", danh sách ca học",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "69",
        "category": "Accessibility cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-069",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với \"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\" (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Nhóm trạng thái của mỗi học viên mang nhãn truy cập có tên học viên",
        "description": "Trình đọc màn hình phải phân biệt được nhóm trạng thái của từng học viên.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", kiểm nhãn truy cập của nhóm trạng thái từng dòng học viên",
            "expected": "Nhãn truy cập của mỗi nhóm chứa đúng tên học viên của dòng đó (\"Nguyễn Minh Anh\", \"Trần Hoàng Nam\", \"Lê Thu Hà\")",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "70",
        "category": "Accessibility cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-070",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 4,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Huy hiệu số đếm trên chip trạng thái mang aria-hidden=\"true\"",
        "description": "Quy ước chip filter: số đếm không bị đọc lặp bởi trình đọc màn hình.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày, kiểm thuộc tính huy hiệu số đếm trên 3 chip \"Tất cả\", \"Chưa điểm danh\", \"Đã điểm danh\"",
            "expected": "Cả 3 huy hiệu số đếm có aria-hidden=\"true\"",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "71",
        "category": "Responsive cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-071",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ở 375×812 danh sách học viên chuyển sang thẻ xếp chồng dọc",
        "description": "Quy tắc responsive màn daily-attendance cho điện thoại.",
        "steps": [
          {
            "step": "1",
            "action": "Đặt khung nhìn 375×812, truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", mở rộng ca \"IELTS 6.5A\"",
            "expected": "Mỗi học viên hiển thị là 1 thẻ, các thẻ xếp chồng theo chiều dọc",
            "testData": "Viewport 375×812"
          }
        ]
      },
      {
        "stt": "72",
        "category": "Responsive cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-072",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ở 375×812 bốn nút trạng thái xếp lưới 2×2",
        "description": "Lưới 2×2 giúp chạm ngón tay dễ trên điện thoại.",
        "steps": [
          {
            "step": "1",
            "action": "Đặt khung nhìn 375×812, mở rộng ca \"IELTS 6.5A\", quan sát nhóm trạng thái của 1 học viên",
            "expected": "4 nút \"Có mặt\", \"Vắng có phép\", \"Vắng không phép\", \"Đi muộn\" xếp thành 2 hàng, mỗi hàng 2 nút",
            "testData": "Viewport 375×812"
          }
        ]
      },
      {
        "stt": "73",
        "category": "Responsive cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-073",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh với 3 học viên (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 và thêm 3 học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ở 768×1024 danh sách học viên chuyển sang thẻ xếp chồng dọc",
        "description": "Quy tắc responsive áp cả máy tính bảng.",
        "steps": [
          {
            "step": "1",
            "action": "Đặt khung nhìn 768×1024, truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", mở rộng ca \"IELTS 6.5A\"",
            "expected": "Mỗi học viên hiển thị là 1 thẻ, các thẻ xếp chồng theo chiều dọc",
            "testData": "Viewport 768×1024"
          }
        ]
      },
      {
        "stt": "74",
        "category": "Responsive cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-074",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "No",
        "preconditions": "Đã đăng nhập vai trò Giáo viên độc lập (dựng: đăng nhập tài khoản test vai trò Giáo viên độc lập; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ở 1440×900 ba thẻ nhắc việc nằm cùng một hàng",
        "description": "Bố cục desktop theo wireframe dashboard-reminders; đánh giá bố cục bằng mắt nên chạy tay.",
        "steps": [
          {
            "step": "1",
            "action": "Đặt khung nhìn 1440×900, mở Bảng điều khiển",
            "expected": "3 thẻ \"Ca học hôm nay chưa điểm danh\", \"Bài tập quá hạn chấm > 24h\", \"Học phí đến hạn / quá hạn thu\" nằm trên cùng một hàng ngang",
            "testData": "Viewport 1440×900"
          }
        ]
      },
      {
        "stt": "75",
        "category": "Responsive cơ bản",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-075",
        "ref": [
          "NFR-selfomy-alignment-008"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Ở 375×812 màn Điểm danh không cuộn ngang",
        "description": "Nội dung phải vừa bề rộng điện thoại, kể cả khi mở rộng ca học.",
        "steps": [
          {
            "step": "1",
            "action": "Đặt khung nhìn 375×812, truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", mở rộng ca \"IELTS 6.5A\"",
            "expected": "Bề rộng nội dung trang không vượt 375px; không có thanh cuộn ngang",
            "testData": "Viewport 375×812"
          }
        ]
      },
      {
        "stt": "76",
        "category": "Edge cases",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-076",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 1,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Bấm \"Lưu điểm danh ca học\" 2 lần liên tiếp không trừ bộ đếm 2 lần",
        "description": "Chống double-submit: lưu lặp 1 ca không được làm bộ đếm giảm quá 1.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Điểm danh tổng theo ngày của hôm nay, mở rộng 1 ca, bấm \"Đánh dấu tất cả Có mặt\" rồi bấm \"Lưu điểm danh ca học\" 2 lần liên tiếp",
            "expected": "Ca đó có nhãn \"Đã điểm danh\"",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Mở Bảng điều khiển",
            "expected": "Thẻ \"Ca học hôm nay chưa điểm danh\" hiển thị bộ đếm 2",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "77",
        "category": "Edge cases",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-077",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" chưa điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions + Minimal Guarantee)",
        "retired": false,
        "title": "Chọn trạng thái nhưng chưa lưu rồi tải lại trang thì ca vẫn chưa điểm danh",
        "description": "Minimal Guarantee của UC: thay đổi chưa bấm lưu không được ghi nhận.",
        "steps": [
          {
            "step": "1",
            "action": "Mở rộng ca \"IELTS 6.5A\", bấm \"Đánh dấu tất cả Có mặt\", không bấm lưu",
            "expected": "Học viên ca \"IELTS 6.5A\" ở trạng thái \"Có mặt\" trên form",
            "testData": "date=2026-10-26"
          },
          {
            "step": "2",
            "action": "Tải lại trang",
            "expected": "Ca \"IELTS 6.5A\" vẫn thuộc chip \"Chưa điểm danh\"; khi mở rộng, không học viên nào được chọn trạng thái",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "78",
        "category": "Edge cases",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-078",
        "ref": [
          "FR-selfomy-alignment-004"
        ],
        "priority": 2,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; hôm nay có 3 ca học chưa điểm danh (dựng: đăng nhập tài khoản test → tạo 3 lớp có lịch học hôm nay kèm học viên; nguồn: UC-daily-attendance-and-holiday Preconditions)",
        "retired": false,
        "title": "Back về Bảng điều khiển sau khi lưu không hiển thị bộ đếm cũ",
        "description": "Trang lấy từ lịch sử trình duyệt không được giữ số đếm trước khi lưu.",
        "steps": [
          {
            "step": "1",
            "action": "Mở Bảng điều khiển, bấm \"Mở Điểm danh ngày ->\"",
            "expected": "Màn Điểm danh tổng theo ngày mở",
            "testData": "—"
          },
          {
            "step": "2",
            "action": "Mở rộng 1 ca, bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\", sau đó bấm Back của trình duyệt",
            "expected": "Bảng điều khiển hiển thị thẻ \"Ca học hôm nay chưa điểm danh\" với bộ đếm 2",
            "testData": "—"
          }
        ]
      },
      {
        "stt": "79",
        "category": "Edge cases",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-079",
        "ref": [],
        "priority": 2,
        "auto": "No",
        "preconditions": "TBD (cần BA cấp)",
        "retired": false,
        "title": "Phiên đăng nhập hết hạn lúc bấm lưu thì điểm danh không được ghi nhận",
        "description": "Không có nguồn về thời hạn phiên nên chưa dựng được trạng thái hết hạn (xoá cookie là đăng xuất, khác hết hạn).",
        "steps": [
          {
            "step": "1",
            "action": "Ở ca \"IELTS 6.5A\" đã chọn trạng thái, khi phiên đăng nhập đã hết hạn thì bấm \"Lưu điểm danh ca học\"",
            "expected": "Điểm danh không được ghi nhận; sau khi đăng nhập lại, ca \"IELTS 6.5A\" vẫn \"Chưa điểm danh\"",
            "testData": "date=2026-10-26"
          }
        ]
      },
      {
        "stt": "80",
        "category": "Edge cases",
        "subcategory": "—",
        "checklist": "CHK-selfomy-alignment-080",
        "ref": [
          "FR-selfomy-alignment-005"
        ],
        "priority": 3,
        "auto": "Yes",
        "preconditions": "Đã đăng nhập Giáo viên độc lập; ngày 26/10/2026 có ca \"IELTS 6.5A\" đã lưu điểm danh (dựng: đăng nhập tài khoản test → tạo lớp \"IELTS 6.5A\" có lịch học 26/10/2026 → mở rộng ca, bấm \"Đánh dấu tất cả Có mặt\" rồi \"Lưu điểm danh ca học\"; nguồn: US-001 AC-002)",
        "retired": false,
        "title": "Đổi ngày rồi quay lại vẫn thấy ca đã lưu là \"Đã điểm danh\"",
        "description": "Trạng thái đã lưu không bị mất khi tải lại danh sách theo ngày.",
        "steps": [
          {
            "step": "1",
            "action": "Truy cập màn Điểm danh tổng theo ngày với \"?date=2026-10-26\", chọn ngày 27/10/2026 trên bộ chọn ngày",
            "expected": "Danh sách chuyển sang ca của ngày 27/10/2026",
            "testData": "27/10/2026"
          },
          {
            "step": "2",
            "action": "Chọn lại ngày 26/10/2026",
            "expected": "Ca \"IELTS 6.5A\" có nhãn \"Đã điểm danh\"",
            "testData": "26/10/2026"
          }
        ]
      }
    ]
  }
];
