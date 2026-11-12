# classes — Gaps & Open Questions

## 1. Open Questions

* [ ] OQ-1: Lớp chỉ có một trạng thái ghi được là "active" (mọi lớp mới chèn kèm trạng thái này, không có luồng nào ghi trạng thái khác — negative-search tại /root/projects/teacher-os/apps/server/src) nhưng màn danh sách vẫn có badge "Tạm dừng" (/root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.tsx:123-129). Ý đồ là "lớp sống mãi" hay thiếu chức năng kết thúc/tạm dừng lớp? — *(liên quan: Mục 1, Mục 5 BR-019, Mục 11 · cần: PO quyết)*
* [ ] OQ-2: Không tồn tại hành vi sửa thông tin lớp (tên/lịch/ngày/tổng buổi) hay xóa lớp sau khi tạo; cap 52 buổi được chốt kèm chú giải "không có endpoint sửa lớp" (/root/projects/teacher-os/packages/api/src/contracts.ts:121). Có cần FR "Sửa lớp" (ít nhất tên lớp) cho phiên bản tới không? — *(liên quan: Mục 1, Mục 3 FR-classes-030 · cần: PO/dev quyết)*
* [ ] OQ-3: Chỉ màn hình web chặn ngày bắt đầu <= hôm nay (/root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.tsx:192; chú giải e2e "schema has no future-only guard" tại /root/projects/teacher-os/apps/e2e/specs/class-operations.spec.ts:137-138). Server chấp nhận có chủ ý (để seed/test) hay cần đồng bộ chặn cả hai đầu? — *(liên quan: Mục 3 FR-classes-010 · cần: dev quyết)*
* [ ] OQ-4: Điểm danh có nhánh "scope lớp được gán" chuẩn bị cho vai trò trợ giảng nhưng hiện mọi giáo viên đều toàn org (/root/projects/teacher-os/apps/server/src/routes/dashboard-reminders.ts:275-279 luôn trả kind "org"; nhánh "assigned" tại /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2916-2919 là nhánh chết). Khi nào kích hoạt vai trò trợ giảng và ai được gán lớp? — *(liên quan: Mục 2 · cần: PO quyết)*
* [ ] OQ-5: `session_package.enrollmentId` đang là "attachment tùy chọn" (parked — /root/projects/teacher-os/packages/db/src/schema/session-package.ts:14-18). Khi nào gói bắt buộc gắn đăng ký, và điều gì xảy ra với gói legacy không gắn khi thêm/xóa buổi (sync theo enrollmentId nên gói legacy sẽ bỏ sót)? — *(liên quan: Mục 8 · cần: PO/dev quyết)*
* [ ] OQ-6: Cột `sessions_done` (số buổi đã học) vẫn tồn tại trong bảng lớp và DTO nhưng mọi điểm đọc đã derive từ dòng bài (/root/projects/teacher-os/packages/api/src/contracts.ts:1602-1606 chú giải "không tin dùng"; /root/projects/teacher-os/apps/web/src/lib/repos/classes.ts:39-55). Có kế hoạch drop cột legacy này không? — *(liên quan: Mục 8 · cần: dev quyết)*
* [ ] OQ-7: Cảnh báo trùng lịch chỉ chạy trên client và không chặn nộp; server KHÔNG kiểm tra trùng lịch khi tạo lớp (tạo lớp chỉ validate schema). Lớp trùng lịch vẫn được tạo — chấp nhận (giáo viên có thể dạy song song) hay cần chặn/ghi nhận server-side? — *(liên quan: Mục 3 FR-classes-011, Mục 5 BR-010 · cần: PO quyết)*
* [ ] OQ-8: Lớp legacy với lịch dạng chữ tự do (free-text schedule) hoặc lưu ngược giờ không bao giờ tham gia cảnh báo trùng lịch và không có projection buổi (/root/projects/teacher-os/apps/web/src/lib/schedule-conflicts.ts:87-88; test fallback tại /root/projects/teacher-os/apps/web/src/routes/_auth/classes/$classId.test.tsx:299). Chấp nhận vĩnh viễn hay cần migration dữ liệu cũ? — *(liên quan: Mục 5 BR-009 · cần: PO/dev quyết)*
* [ ] OQ-9: THÊM buổi học thủ công không phát thông báo cho học viên (không có lời gọi notify trong /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2416-2639; thông báo chỉ phát khi dời/đổi giờ :2372, hủy :2851-2907 (điểm danh không phát thông báo)). Học viên có cần biết lịch mới không? — *(liên quan: Mục 9 Flow 3 · cần: PO quyết)*
* [ ] OQ-10: Học phí = 0 bị từ chối ("Học phí phải là số nguyên dương." — /root/projects/teacher-os/apps/web/src/components/modals/edit-class-fee-modal.tsx:39), tức không có khái niệm "lớp miễn phí 0đ" — chỉ có "chưa thiết lập". Đúng nghiệp vụ không? — *(liên quan: Mục 5 BR-008 · cần: PO quyết)*
* [ ] OQ-11: Cột Priority (bảng FR/NFR) và Severity (Error Matrix) là phân loại của nhà phân tích, không nguồn code/test nào phát biểu — có cần PO chốt lại thứ tự ưu tiên/độ nghiêm trọng không? — *(liên quan: Mục 3, 4, 6 · cần: PO)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| Mục 3 (FR) | FR "Sửa lớp" / "Xóa lớp" / "Tạm dừng lớp" — negative-search: toàn bộ route `/classes` tại /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1385-2909 không có PUT/DELETE trên dòng lớp; không có writer trạng thái nào ngoài "active" khi chèn | Không thể đổi tên/sửa lỗi nhập liệu của lớp; lớp chấm dứt vẫn hiện "Đang học" mãi | PO (quyết có cần không) → dev |
| Mục 3 FR-classes-011 | Chặn trùng lịch server-side (hiện chỉ cảnh báo client, BR-010) | Dữ liệu trùng lịch vẫn vào DB nếu gọi API trực tiếp | PO |
| Mục 0 / Mục 2 | Định nghĩa "giáo viên của lớp" — brief nhắc "gán giáo viên" nhưng bảng lớp không có cột giáo viên; giáo viên hiển thị cho học viên = giáo viên sở hữu org (/root/projects/teacher-os/docs/project-overview-pdr.md:25, /root/projects/teacher-os/apps/server/src/routes/student-class.ts:71) | Nếu yêu cầu thật là nhiều giáo viên/lớp thì toàn bộ mô hình cần `/cr` (cột mới + luồng gán + phân quyền) | PO |
| Mục 9 Flow 3 | Thông báo khi thêm buổi (xem OQ-9) | Học viên không nhận biết buổi mới giữa khóa | PO |
| Mục 8 | Dọn dẹp cột legacy `sessions_done` (xem OQ-6) | Giá trị chết trong DB + DTO, dễ đọc nhầm nếu người mới trust cột | dev |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú (ngày/độ tin cậy) |
|------|-------------|-------------|---------------------------|
| Gán giáo viên cho lớp | Brief reverse (đầu vào nhiệm vụ) liệt kê "gán giáo viên" là một năng lực của feature | Code + PDR: bảng lớp không có cột/trường giáo viên; giáo viên lớp = giáo viên sở hữu org (/root/projects/teacher-os/docs/project-overview-pdr.md:25; negative-search schema /root/projects/teacher-os/packages/db/src/schema/class.ts:10-41) | Không chế luồng gán GV. Ghi hiện trạng vào spec + OQ cho PO. Nguồn code/PDR mới hơn và cụ thể hơn brief |
| Trạng thái lớp hiển thị | Màn danh sách render 2 badge "Đang học"/"Tạm dừng" (/root/projects/teacher-os/apps/web/src/routes/_auth/classes/index.tsx:123-129) | Backend chỉ ever ghi "active" khi tạo (/root/projects/teacher-os/apps/server/src/routes/kernel.ts:1704; negative-search không có writer khác) | Nhánh "Tạm dừng" là dead state — UI conflict với dữ liệu thật; đưa OQ-1 |
| Giới hạn tổng số buổi | Schema cho phép tối đa 52 (cap chống batch phồng — /root/projects/teacher-os/packages/api/src/contracts.ts:121-122) | Không có văn bản nghiệp vụ nào nói khóa học tối đa 52 buổi | Chấp nhận 52 là ràng buộc kỹ thuật hiện hành; nêu trong Mục 11 Constraints |

## 4. Inferred assumptions (suy đoán cần verify)

* Một org = một giáo viên chủ; mọi lớp của org thuộc một giáo viên duy nhất — *validate: hỏi PO về kế hoạch multi-teacher · nếu sai: cần cột giáo viên + luồng gán + phân quyền điểm danh (liên quan OQ-4)*
* Cảnh báo trùng lịch không chặn nộp là hành vi có chủ ý (e2e #315 assert nút Tạo vẫn bật khi có cảnh báo — /root/projects/teacher-os/apps/e2e/specs/create-class-schedule-conflict.spec.ts:36-58) — *validate: confirm với PO · nếu sai: cần chặn server-side (Gap Mục 3)*
* Mép giờ chạm nhau (19:00-20:30 và 20:30-22:00) KHÔNG tính là trùng — có test chốt (/root/projects/teacher-os/apps/web/src/components/modals/add-class-modal.conflict.test.tsx:110) — *validate: không cần, đã có test · nếu sai: đổi thuật toán `schedule-conflicts.ts`*
* Số buổi đã học trên KPI lấy max theo từng đăng ký là đúng ngữ nghĩa "tiến độ lớp" — *validate: quan sát với lớp có học viên vào muộn · nếu sai: đổi sang min hoặc đếm dòng buổi vật lý*
* Trạng thái `sessionsTotal` của lớp manual luôn bằng số dòng buổi vật lý (server đè bằng đếm SQL khi thêm/xóa buổi — /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2570-2583, /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2770-2794) — *validate: truy vấn DB lớp manual lâu năm · nếu sai: có drift giữa cột và dòng buổi*


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
