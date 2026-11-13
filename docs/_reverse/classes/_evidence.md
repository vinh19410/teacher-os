# classes — Evidence base (truy vết code → luồng)

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| GET | /api/classes | Màn Danh sách lớp (tab lớp) | Session teacher (bootstrap + gate 403) | Đọc snapshot danh sách lớp cho org | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1628 |
| POST | /api/classes | Modal "Tạo lớp mới" | Session teacher | Tạo lớp (kèm copy giáo trình nếu chọn template) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1641 |
| POST | /api/classes/:id/notes | Tab Ghi chú | Session teacher | Lưu ghi chú lớp | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1717 |
| POST | /api/classes/:id/tuition-fee | Modal "Sửa học phí lớp" | Session teacher | Thiết lập/sửa/xóa học phí mỗi học viên | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1738 |
| POST | /api/classes/:id/enroll | Modal "+ Thêm học viên vào lớp" | Session teacher | Gán học viên (có sẵn hoặc tạo nhanh) vào lớp | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1385 |
| POST | /api/classes/:id/sessions | Modal "+ Thêm buổi học" (lớp manual) | Session teacher | Thêm buổi học vật lý + materialize bài theo học viên | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2416 |
| POST | /api/classes/:id/sessions/:date/edit | Modal "Điều chỉnh buổi" | Session teacher | Sửa/dời cả ca buổi học (bucket lớp+ngày) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2110 |
| DELETE | /api/classes/:id/sessions/:date | Modal "Điều chỉnh buổi" (nút Xóa) | Session teacher | Xóa buổi chưa diễn ra của lớp manual | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2642 |
| POST | /api/classes/:id/sessions/:date/check-in | Modal "Điều chỉnh buổi" (Hoàn thành) | Session teacher | Check-in cả ca: mọi dòng "sắp tới" → hoàn thành | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2869 |
| POST | /api/classes/:id/sessions/:date/cancel | Modal "Điều chỉnh buổi" (Hủy) | Session teacher | Hủy cả ca + thông báo học viên trong buổi | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2889 |
| PUT | /api/classes/:id/sessions/:date/attendance | Surface điểm danh cả ca | Session teacher | Lưu điểm danh chi tiết một lượt cho roster buổi | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2909 |
| POST | /api/lessons/:id/check-in | (luồng từng học viên — path legacy) | Session teacher | Đổi trạng thái 1 dòng bài → hoàn thành | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1947 |
| POST | /api/lessons/:id/cancel | (luồng từng học viên — path legacy) | Session teacher | Đổi trạng thái 1 dòng bài → đã hủy | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1951 |
| POST | /api/lessons/:id/edit | (luồng từng học viên — path legacy có ngày bị chặn chuyển sang endpoint occurrence) | Session teacher | Sửa 1 dòng bài (undated legacy vẫn dùng) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1969 |
| (ranh giới) POST | /api/classes/:id/assignments | Tab Buổi học & luyện tập (phần giao bài) | Session teacher | Giao bài tập trên lớp — feature khác, chỉ liệt kê để định ranh giới | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1511 |

Auth chung: mọi route trên đăng ký sau middleware bootstrap — student bị 403 `ACCOUNT_STUDENT_ROLE` (/root/projects/teacher-os/apps/server/src/app.ts:224-231), admin bị 403 `ACCOUNT_ADMIN_ROLE` (/root/projects/teacher-os/apps/server/src/app.ts:233-239), email giáo viên không trong allowlist bị chặn (/root/projects/teacher-os/apps/server/src/app.ts:240-263); POST/PUT/DELETE kiểm Origin + JSON (/root/projects/teacher-os/apps/e2e/specs/helpers-dated-class.ts:42-43; /root/projects/teacher-os/apps/server/src/routes/kernel.ts:368-394).

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| Tên lớp | Bắt buộc, không rỗng | min 1 ký tự | Client: "Vui lòng nhập tên lớp."; server 400 schema | /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:172 · /root/projects/teacher-os/packages/api/src/contracts.ts:98-127 | ✅ |
| Loại lớp | Enum | "ielts" (mặc định) / "communication" | 400 schema | /root/projects/teacher-os/packages/api/src/contracts.ts:85-86 · :98-127 | ✅ |
| Kỹ năng (IELTS) | Chọn 1-4 trong 4 kỹ năng, không trùng; Giao tiếp không chọn | writing/speaking/reading/listening | "Lớp IELTS cần ít nhất một kỹ năng" · "Lớp Giao tiếp không chọn kỹ năng" · client "Chọn ít nhất một kỹ năng." | /root/projects/teacher-os/packages/api/src/contracts.ts:88-93 · :139-152 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:176 | ✅ |
| Thứ học | Mảng 1-7 số nguyên 0-6 duy nhất (0=T2 … 6=CN); từ chối chuỗi lịch tự do | [0..6] | 400 (thiếu thứ / sai miền / trùng / quá dài) | /root/projects/teacher-os/packages/api/src/contracts.ts:111-120 · /root/projects/teacher-os/apps/server/src/kernel.test.ts:472 · :485 | ✅ |
| Giờ học | Định dạng HH:mm 24h; kết thúc phải sau bắt đầu (không cho bằng) | regex HH:mm | "Giờ kết thúc phải sau giờ bắt đầu" · client "Nhập giờ bắt đầu và giờ kết thúc." / "Giờ kết thúc phải sau giờ bắt đầu." | /root/projects/teacher-os/packages/api/src/contracts.ts:96 · :128-138 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:184 · :188 | ✅ |
| Tổng số buổi | Số nguyên 1-52, mặc định 12 | 1-52 (default 12) | 400 khi 0 (không tự nâng lên 12); client "Tổng số buổi phải từ 1 đến 52." / "Tổng số buổi tối đa là 52." | /root/projects/teacher-os/packages/api/src/contracts.ts:121-122 · /root/projects/teacher-os/apps/server/src/kernel.test.ts:530 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:200 · :204 | ✅ |
| Ngày bắt đầu | ISO nghiêm ngặt (roundtrip + miền năm); client yêu cầu > hôm nay VN | yyyy-mm-dd | 400 invalid date; client "Vui lòng chọn ngày bắt đầu sau hôm nay." | /root/projects/teacher-os/packages/api/src/skeleton.ts:84-91 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:192 · /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:137-138 | ✅ |
| Học phí | Số nguyên dương VND hoặc null (trống) | >= 1 | Client: "Học phí phải là số nguyên dương." | /root/projects/teacher-os/packages/api/src/contracts.ts:123-124 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:209 · /root/projects/teacher-os/apps/web/src/components/modals/edit-class-fee-modal.tsx:39 | ✅ |
| Template giáo trình | Tùy chọn; phải là template cùng org (không phải bản copy của lớp); <= 500 nút | 500 nút tối đa | 404 "syllabus not found"; 422 "Template quá lớn để import" | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1663-1671 · /root/projects/teacher-os/apps/server/src/lib/syllabus-curriculum.ts:119 | ✅ |
| Ghi chú lớp | Text | — | 400 schema | /root/projects/teacher-os/packages/api/src/contracts.ts:169-172 | ✅ |
| Ngày buổi (thêm buổi) | ISO nghiêm ngặt; không trùng ngày đã có buổi trong lớp | yyyy-mm-dd | 400 invalid date; 409 "date already has a session" (reason date-occupied); client "Lớp đã có buổi học vào ngày này." | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2485-2490 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:150 | ✅ |
| Giờ buổi | HH:mm | regex HH:mm | "Giờ học phải theo định dạng HH:mm (00:00–23:59)" · client "Vui lòng chọn giờ học hợp lệ (HH:mm)." | /root/projects/teacher-os/packages/api/src/contracts.ts:1750-1752 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:136 | ✅ |
| Thời lượng (phút) | 15-360 | mặc định 90 (client) | 400 schema | /root/projects/teacher-os/packages/api/src/contracts.ts:1748-1766 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:55-57 | ✅ |
| Chủ đề buổi | Bắt buộc, <= 500 ký tự | 1-500 | "Chủ đề không được để trống" · client "Vui lòng nhập tên hoặc chủ đề buổi học." | /root/projects/teacher-os/packages/api/src/contracts.ts:1754 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:145 | ✅ |
| Link Zoom | Rỗng hoặc URL bắt đầu https:// | "" hoặc https://… | "Link Zoom phải là URL https:// hoặc để trống" (thêm buổi) · "zoom phải là URL https:// hoặc rỗng" (điều chỉnh) | /root/projects/teacher-os/packages/api/src/contracts.ts:1755-1761 · :1448 · :1481 | ✅ |
| Tài liệu gắn buổi | Tùy chọn; tối đa 20 id, phải tồn tại trong org | 20 | 422 material-not-found (kèm id thiếu) | /root/projects/teacher-os/packages/api/src/contracts.ts:256 · :271 · /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2496-2509 · :2604-2621 | ✅ |
| Điều chỉnh cả ca | Ít nhất một trường để chỉnh; moveDate là ngày lịch thật | >= 1 trường | "cần ít nhất một trường để chỉnh" · 400 invalid date | /root/projects/teacher-os/packages/api/src/contracts.ts:1464-1495 (điều kiện tại :1490-1493) · /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2122-2125 | ✅ |
| Hành động trạng thái | Thân yêu cầu phải rỗng (strict) | {} | 400 schema | /root/projects/teacher-os/packages/api/src/contracts.ts:1322 | ✅ |
| Điểm danh (một lượt) | Đủ roster, lessonId không trùng, ghi chú <= 255, trạng thái trong enum 4 giá trị | present/late/excused/unexcused | "lessonId trùng" · 422 unknown-lesson / incomplete-roster (kèm danh sách thiếu) | /root/projects/teacher-os/packages/api/src/contracts.ts:1365-1382 (trùng id tại :1380) · /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2960-2985 | ✅ |

## §3. Errors (lỗi + wording thật)

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + catalog (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-----------------------------------|------|
| E-classes-003 | Tạo lớp Giao tiếp kèm kỹ năng | "Lớp Giao tiếp không chọn kỹ năng" | Bỏ kỹ năng | throw/catalog: /root/projects/teacher-os/packages/api/src/contracts.ts:146-152 · test: /root/projects/teacher-os/apps/server/src/kernel.test.ts:578 | ✅ |
| E-classes-004 | Giờ kết thúc <= giờ bắt đầu | "Giờ kết thúc phải sau giờ bắt đầu" | Sửa giờ | /root/projects/teacher-os/packages/api/src/contracts.ts:132-138 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:188 | ✅ |
| E-classes-008 | Không chọn thứ nào | 400 schema (client: "Chọn ít nhất một ngày học.") | Chọn thứ | /root/projects/teacher-os/apps/server/src/kernel.test.ts:472 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:180 | ✅ |
| E-classes-007 | sessionsTotal = 0 | 400 (client: "Tổng số buổi phải từ 1 đến 52.") | Nhập 1-52 | /root/projects/teacher-os/apps/server/src/kernel.test.ts:530 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:200 | ✅ |
| E-classes-010 | Template lạ/khác org | "syllabus not found" (404) | Chọn template khác | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1663-1667 | ✅ |
| E-classes-011 | Template > 500 nút | "Template quá lớn để import" (422) | Chọn template nhỏ hơn | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1669-1671 | ✅ |
| E-classes-012 | Lớp lạ / khác org | "class not found" (404) · UI "Lớp này không tồn tại hoặc dữ liệu demo đã được reset." | Về danh sách | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1394-1397 · :2117-2120 · /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.tsx:75-88 | ✅ |
| E-classes-015 | Ngày đã có buổi | "date already has a session" (409, reason date-occupied) · client "Lớp đã có buổi học vào ngày này." | Chọn ngày khác | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2485-2490 · /root/projects/teacher-os/apps/web/src/components/modals/add-class-session-modal.tsx:150 | ✅ |
| E-classes-016 | Thêm buổi vào lớp có giáo trình | "cannot add manual session to class with syllabus" (409, class-has-syllabus) | Gỡ giáo trình hoặc dùng giáo trình | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2425-2433 · test /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:393 | ✅ |
| E-classes-017 | Lớp có dòng buổi legacy nhưng không manual | "class is not in manual sessions mode" (409) | — | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2441-2458 · :2667-2675 · test /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:345 | ✅ |
| E-classes-018 | Tài liệu lạ | "material-not-found" (422, kèm materialId) | Bỏ tài liệu lạ | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2496-2509 · :2604-2621 · test /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:826 | ✅ |
| E-classes-019 | Bucket rỗng khi ghi | "occurrence not found" (404) · toast "Buổi không còn tồn tại — đã tải lại." | Thao tác lại sau khi trang tải mới | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2174-2181 · :2700-2707 · :2826-2831 · /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:160 · test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:364 | ✅ |
| E-classes-020 | Ngày đích đã có buổi | 409 date-occupied · toast "Ngày đích đã có buổi khác — chọn ngày khác rồi lưu lại." | Chọn ngày khác | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2130-2149 · :2354-2412 · /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:150-153 · test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:263 | ✅ |
| E-classes-021 | Buổi nghỉ lễ bị khóa | "holiday occurrence is locked" (409, holiday-locked) | Điều chỉnh qua Lịch nghỉ | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1995-2000 · :2204-2212 | ✅ |
| E-classes-022 | Hoàn thành/điểm danh buổi tương lai | "future-session" (422) · toast "Chưa tới ngày học — chưa thể điểm danh." · UI "Buổi diễn ra sau hôm nay — Hoàn thành mở khi đến buổi." | Chờ đến buổi | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:331-333 · :2832-2834 · :2925-2928 · /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:13 · /root/projects/teacher-os/apps/web/src/components/class-detail/session-actions-modal.tsx:236 · e2e /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:80-83 | ✅ |
| E-classes-023 | Xóa buổi đã hoàn thành/điểm danh | "cannot-delete-completed" (409) · client "Không thể xóa buổi học đã điểm danh hoặc hoàn thành." | Hủy thay vì xóa | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2709-2719 · /root/projects/teacher-os/apps/web/src/components/class-detail/session-actions-modal.tsx:136 · test /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:519 | ✅ |
| E-classes-024 | Xóa buổi trên lớp có giáo trình | "cannot delete session from class with syllabus" (409) | Gỡ giáo trình trước | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2651-2659 · :2800-2808 | ✅ |
| E-classes-025 | Điểm danh thiếu / lessonId lạ | "unknown lesson" (422, unknown-lesson) · "incomplete-roster" (422, kèm missing[]) · "lessonId trùng" | Hoàn tất điểm danh | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2960-2985 · /root/projects/teacher-os/packages/api/src/contracts.ts:1380 | ✅ |
| E-classes-026 | Roster đổi giữa lúc lưu | 409 roster-changed (batch cập nhật 0 dòng) | Tải lại rồi lưu | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2987-3037 | ✅ |
| E-classes-027 | Đổi thứ trên dòng bài có ngày | "day change requires the occurrence endpoint" (409, use-occurrence-endpoint) · toast "Bước này đổi thứ/buổi theo từng học viên — hãy dùng nút Điều chỉnh buổi." | Dùng Điều chỉnh buổi | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1985-1993 · /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:144-148 · test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:425 | ✅ |
| E-classes-028 | Bài lệch lớp với đăng ký | "lesson enrollment mismatch" (409) | Kiểm tra dữ liệu | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1897-1899 · :1981-1983 | ✅ |
| E-classes-029 | Học viên đã trong lớp | "student already enrolled" (409) | Đóng modal, tải lại roster | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1407-1418 · test /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:113 | ✅ |
| E-classes-030 | Ghi không thành công | "Không lưu được — dữ liệu chưa được ghi lên máy chủ." | Thử lại | /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:76 · :164 | ✅ |
| E-classes-031 | Kết quả không xác định | "Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…" | Hệ thống tự tải lại | /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:83 · :170 | ✅ |
| E-classes-032 | Sai Content-Type / JSON hỏng | "content-type must be application/json" (415) · "invalid json" (400) | Gửi lại đúng JSON | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:368-389 · test /root/projects/teacher-os/apps/server/src/kernel.test.ts:1627 | ✅ |
| E-classes-033 | Ngày không hợp lệ | 400 (reason invalid-date) | Nhập ngày hợp lệ | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1801-1803 · :2122-2125 · /root/projects/teacher-os/packages/api/src/skeleton.ts:84-91 | ✅ |
| E-classes-036 | Sai vai trò tài khoản | 403 `ACCOUNT_STUDENT_ROLE` / `ACCOUNT_ADMIN_ROLE` / `ACCOUNT_TEACHER_NOT_ALLOWED` / `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` | Đăng nhập đúng vai trò | /root/projects/teacher-os/apps/server/src/app.ts:224-263 · /root/projects/teacher-os/packages/api/src/contracts.ts:1981-1998 | ✅ |
| — | Buổi đã chốt không ghi lại | Không lỗi — server đếm "skipped" và trả `{updated, skipped}`; toast đính "(x/y học viên — z đã chốt trước đó)" | Không cần | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2869-2887 · /root/projects/teacher-os/apps/web/src/lib/kernel-outcome.ts:126-130 · test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:275 | ✅ |

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Loại lớp enum | Tạo lớp | "ielts" / "communication" | có (/root/projects/teacher-os/apps/server/src/kernel.test.ts:456) | /root/projects/teacher-os/packages/api/src/contracts.ts:85-86 | ✅ |
| Bộ kỹ năng IELTS | Tạo lớp IELTS | writing/speaking/reading/listening | có (:573, :578) | /root/projects/teacher-os/packages/api/src/contracts.ts:88-93 | ✅ |
| Định dạng giờ | Tạo lớp/thêm buổi | regex HH:mm | có (:506, :619 region manual-sessions) | /root/projects/teacher-os/packages/api/src/contracts.ts:96 · :1750-1752 | ✅ |
| Cap tổng số buổi | Tạo lớp | 1-52, default 12 | có (:530; e2e :54-63 region) | /root/projects/teacher-os/packages/api/src/contracts.ts:121-122 | ✅ |
| Chế độ lớp do server suy ra | Tạo lớp | templateId khác rỗng → "auto"; không → "manual" + 0 buổi | có (manual-sessions.test.ts:995) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1682-1687 · :1702 | ✅ |
| Định nghĩa lớp manual | Thêm/xóa buổi | KHÔNG có bản copy giáo trình VÀ (manual HOẶC >= 1 dòng buổi) | có (manual-sessions.test.ts:345) | /root/projects/teacher-os/apps/server/src/lib/class-mode.ts:19-41 | ✅ |
| 1 buổi/ngày/lớp | Thêm/dời buổi | unique (classId, date) | có (manual-sessions.test.ts:177) | /root/projects/teacher-os/packages/db/src/schema/class-session.ts:41 | ✅ |
| Buổi độc lập học viên | Mọi thao tác buổi | "0 students still keeps sessions" | có (manual-sessions.test.ts:110) | /root/projects/teacher-os/packages/db/src/schema/class-session.ts:15 | ✅ |
| Cap nút giáo trình | Chọn template | MAX_IMPORT_NODES = 500 | có (manual-sessions.test.ts:1340) | /root/projects/teacher-os/apps/server/src/lib/syllabus-curriculum.ts:119 | ✅ |
| Cap tài liệu/buổi | Thêm buổi | MATERIAL_LINKS_MAX = 20 | có (manual-sessions.test.ts:761) | /root/projects/teacher-os/packages/api/src/contracts.ts:256 · :271 | ✅ |
| Vắng có phép KHÔNG trừ buổi | Lưu điểm danh | UNEXCUSED_CONSUMES_SESSION = true (không có cấu hình org) | có (TOS-7 test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:521) | /root/projects/teacher-os/packages/api/src/contracts.ts:1333 · :1350-1358 | ✅ |
| Trạng thái điểm danh | Lưu điểm danh | present/late/excused/unexcused | có (:521) | /root/projects/teacher-os/packages/api/src/contracts.ts:1335-1341 | ✅ |
| Mapping điểm danh → trạng thái bài | Lưu điểm danh | excused → absent; còn lại → completed | có (:521) | /root/projects/teacher-os/packages/api/src/contracts.ts:1350-1358 | ✅ |
| Hoàn thành/hủy chỉ từ "sắp tới" | Check-in/hủy | 409 "lesson is not upcoming" | có (kernel-occurrence.test.ts:306) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1901 · :1930 · :2040 | ✅ |
| Không hoàn thành buổi tương lai | Check-in/điểm danh | ngày buổi > hôm nay VN → 422 | có (kernel-occurrence.test.ts:269 region e2e) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2832-2834 · :2925-2928 | ✅ |
| Xóa buổi an toàn | Xóa buổi | chặn khi có dòng hoàn thành/đã điểm danh; lớp phải manual, không giáo trình | có (manual-sessions.test.ts:457, :519) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2651-2675 · :2709-2719 | ✅ |
| Tổng gói đồng bộ theo dòng buổi | Thêm/xóa buổi | total = (SELECT count(*) FROM class_session …) | có (manual-sessions.test.ts:216, :457) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2585-2599 · :2770-2794 | ✅ |
| Chế độ lịch lớp chuyển đổi | Import/gỡ giáo trình | import → auto (backfill); remove lớp 0 buổi → manual/0; lớp có dòng buổi chặn import (409 has-manual-sessions) | có (manual-sessions.test.ts:995, :1232, :1421) | /root/projects/teacher-os/apps/server/src/routes/syllabus.ts:399-409 · :657-665 · /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2570-2583 (SQL đặt NULL khi có giáo trình) | ✅ |
| Buổi nghỉ lễ khóa sửa | Sửa/dời bucket holiday | holiday_rows > 0 hoặc có dòng hủy lịch nghỉ | có (TOS-11 test /root/projects/teacher-os/apps/server/src/kernel-occurrence.test.ts:544) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1762-1799 · :2204-2212 | ✅ |
| Cặp lớp↔đăng ký bất biến | Mọi ghi dòng bài | lesson.classId phải bằng enrollment.classId | có (kernel-occurrence.test.ts:306) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:420-446 · :1897-1899 | ✅ |
| Ghi occurrence có guard trong WHERE | Sửa/hủy/điểm danh | org + pairing + status guard trong cùng câu UPDATE | có (kernel-occurrence.test.ts:306) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1840-1874 | ✅ |
| Học phí = giá/học viên toàn khóa | Tạo/sửa học phí | null = chưa thiết lập; không derive từ hóa đơn | có (e2e class-tuition-fee.spec.ts:4) | /root/projects/teacher-os/packages/db/src/schema/class.ts:31-34 | ✅ |
| Số buổi đã học derive | Hiển thị | max completed per enrollment; cột cũ không tin | có (web test $classId.test.tsx:62 region index) | /root/projects/teacher-os/packages/api/src/contracts.ts:1602-1606 · /root/projects/teacher-os/apps/web/src/lib/repos/classes.ts:39-55 | ✅ |
| Cap bộ sinh khung buổi | Projection lớp auto | total*7+14 ngày | có ($classId.test.tsx:500) | /root/projects/teacher-os/packages/api/src/skeleton.ts:127-151 | ✅ |

**State transition (tóm tắt — chi tiết ở `srs/classes-reverse-states.md`):**

- Buổi dạy (dòng bài): `upcoming` → `completed` (check-in cả ca /learn từng dòng) · `upcoming` → `cancelled` (hủy cả ca) · `upcoming` → `absent` (điểm danh vắng, ranh giới attendance) · `holiday` (khóa, do lịch nghỉ đặt) — /root/projects/teacher-os/packages/db/src/schema/lesson.ts:49-57, /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2816-2907.
- Đăng ký (ranh giới enrollment-lifecycle): `invited` → `active` (kích hoạt), `invited` → xóa (hủy mời); chỉ `active` nhận dòng bài/gói — /root/projects/teacher-os/docs/project-overview-pdr.md:24, /root/projects/teacher-os/apps/server/src/routes/enrollment-activation.ts:490-500.
- Chế độ lớp: `manual` ⇄ `auto` (chỉ qua import/gỡ giáo trình; SQL có thể đặt NULL tạm khi có giáo trình — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2570-2583).

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| Lớp học | tên, loại, trình độ, kỹ năng, hình thức, lịch tuần (thứ+giờ), tổng buổi, trạng thái, ngày bắt đầu, chế độ lịch, học phí/học viên, ghi chú, con trỏ giáo trình | thuộc org; có nhiều buổi/dòng bài/đăng ký | /root/projects/teacher-os/packages/db/src/schema/class.ts:10-41 |
| Buổi học vật lý | lớp, ngày, giờ, thời lượng, chủ đề, zoom; duy nhất (lớp, ngày) | thuộc lớp; 0 học viên vẫn tồn tại | /root/projects/teacher-os/packages/db/src/schema/class-session.ts:15 · :19-41 |
| Buổi dạy theo học viên (bucket) | lớp + đăng ký + ngày định danh buổi + thứ + giờ + thời lượng + chủ đề + zoom + trạng thái + điểm danh + ghi chú | thuộc lớp + đăng ký; nhóm theo (lớp, ngày) thành một buổi vật lý | /root/projects/teacher-os/packages/db/src/schema/lesson.ts:29-80 |
| Đăng ký | học viên + lớp + trạng thái invited/active; duy nhất cặp | nối học viên ↔ lớp | /root/projects/teacher-os/packages/db/src/schema/enrollment.ts:17-47 |
| Gói buổi | quyền học của học viên; gắn đăng ký tùy chọn; tổng buổi do server đồng bộ | thuộc học viên (nguồn sự thật), gắn đăng ký tùy chọn | /root/projects/teacher-os/packages/db/src/schema/session-package.ts:14-52 |
| Tài liệu gắn buổi | (lớp, ngày, tài liệu) + vị trí | nối buổi vật lý ↔ tài liệu ngân hàng | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2556-2568 |
| Tổ chức | chủ thể scope mọi dữ liệu | chứa lớp/học viên/thành viên | /root/projects/teacher-os/packages/db/src/schema/class.ts:14-16 |
| Thành viên org | user + role (teacher/student); role teacher sớm nhất = giáo viên của lớp | thuộc org | /root/projects/teacher-os/apps/server/src/app.ts:264-289 · /root/projects/teacher-os/apps/server/src/routes/student-class.ts:71 |
| (ranh giới) Cặp lịch nghỉ gốc→bù | lớp, ngày gốc, ngày bù | khóa sửa bucket gốc, kéo theo khi dời | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1762-1799 · :2263 |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| Tạo lớp chọn template | Copy giáo trình cho lớp (đặt con trỏ + reset trạng thái bài) | Ghi (batch cùng dòng lớp) | Flow 1 Tạo lớp | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1649-1713 · /root/projects/teacher-os/apps/server/src/lib/syllabus-curriculum.ts:62-72 |
| Thêm buổi thủ công | Materialize dòng bài theo đăng ký active + gắn tài liệu + đồng bộ tổng gói | Ghi (một batch; lỗi giữa chừng = cả buổi biến mất) | Flow 3 Thêm buổi | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2512-2599 |
| Kích hoạt đăng ký (lớp manual) | Copy các dòng buổi vật lý sẵn có thành dòng bài cho học viên mới | Ghi (guarded CASE SQL) | Ranh giới enrollment-lifecycle | /root/projects/teacher-os/apps/server/src/routes/enrollment-activation.ts:490-500 · test /root/projects/teacher-os/apps/server/src/manual-sessions.test.ts:280 |
| Dời buổi khi có lịch nghỉ | Kéo cặp gốc→bù theo ngày mới | Ghi (update bảng lịch nghỉ trong batch) | Ranh giới holidays | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2263 · :1762-1799 |
| Hủy/dời buổi | Thông báo schedule_changed cho mọi học viên có dòng bài trong bucket | Gọi (fail-open, sau khi ghi thành công) | Thông báo | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:335-366 · :2372 · :2851 |
| Lưu điểm danh | Mapping trạng thái bài + trừ buổi (vắng không phép) | Ghi (guarded batch + roster count guard) | Ranh giới attendance | /root/projects/teacher-os/packages/api/src/contracts.ts:1350-1358 · /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2909-3040 |
| Tab Học viên — ô Học phí | Vòng đời hóa đơn của học viên trong lớp | Đọc (snapshot) | Ranh giới tuition | /root/projects/teacher-os/apps/web/src/components/class-detail/class-roster-tab.tsx:37-71 |
| Portal học viên — trang lớp | Giáo viên = membership teacher sớm nhất của org; chỉ trả cho đăng ký active | Đọc (route portal riêng) | Ranh giới student-portal | /root/projects/teacher-os/apps/server/src/routes/student-class.ts:71 · /root/projects/teacher-os/docs/project-overview-pdr.md:25 |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* Không có PUT/DELETE trên dòng lớp (sửa/xóa/lưu trữ lớp) — *(negative-search: toàn bộ route `/classes*` liệt kê tại /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1385-2909 chỉ có GET/POST/DELETE con của sessions · loại: code-câm → OQ-1, OQ-2)*
* Badge "Tạm dừng" trong UI không bao giờ xảy ra — không có writer trạng thái nào ngoài "active" khi chèn — *(negative-search: grep `status` trên mọi `update(classTable)` — chỉ syllabusId/schedulingMode/sessionsTotal/notes/tuitionFee tại /root/projects/teacher-os/apps/server/src/routes/syllabus.ts:399 · :529 · :657 và /root/projects/teacher-os/apps/server/src/lib/syllabus-curriculum.ts:62-72 · loại: dead-code-nghi → OQ-1)*
* Nhánh "scope lớp được gán" trong bộ lọc điểm danh là nhánh chết — resolver luôn trả "org" — *(nguồn: /root/projects/teacher-os/apps/server/src/routes/dashboard-reminders.ts:275-279 vs /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2916-2919 · loại: dead-code-nghi → OQ-4)*
* Thêm buổi không phát thông báo (không có lời gọi notify trong endpoint :2416-2639; notify chỉ tại :2372 dời, :2851-2907 hủy — điểm danh :2909-3040 KHÔNG phát thông báo) — *(nguồn: grep "notify(" toàn file kernel.ts · loại: code-câm → OQ-9)*
* Server không chặn ngày bắt đầu quá khứ (chỉ client) — *(nguồn: chú giải e2e /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:137-138 · loại: bất đối xứng client/server → OQ-3)*
* Server không kiểm tra trùng lịch khi tạo lớp (cảnh báo chỉ client, không chặn) — *(nguồn: POST /api/classes :1641-1715 không có bước so lịch; thuật toán trùng lịch chỉ ở /root/projects/teacher-os/apps/web/src/lib/schedule-conflicts.ts:63-110 · loại: code-câm → OQ-7)*
* `session_package.enrollmentId` parked tùy chọn; sync tổng gói theo enrollmentId nên gói legacy không gắn sẽ bỏ sót khi thêm/xóa buổi — *(nguồn: /root/projects/teacher-os/packages/db/src/schema/session-package.ts:14-18 · :31 · sync tại /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2585-2599 · loại: nghi ngờ thiết kế → OQ-5)*
* Cột `sessions_done` legacy còn trong bảng + DTO dù mọi điểm đọc derive — *(nguồn: /root/projects/teacher-os/packages/api/src/contracts.ts:1602-1606 · /root/projects/teacher-os/apps/web/src/lib/repos/classes.ts:39-55 · loại: kỹ thuật nợ → OQ-6)*


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
