# students — Gaps & Open Questions

## 1. Open Questions

* [ ] OQ-1: `docs/project-overview-pdr.md:23` nói giáo viên không còn tạo học viên thủ công, nhưng `POST /api/students` vẫn sống, có nút "Thêm học viên" và 4 test active phủ (kernel.test.ts:4982, 4995, 5027, 7092; index.test.tsx:61-91). PDR hay code là ý định hiện hành? — *(liên quan: Mục 0.3, FR-012 · cần: PO/BA quyết)*
* [ ] OQ-2: Không tồn tại đường cập nhật/xóa hồ sơ học viên phía giáo viên: không `kernel.patch/put/delete("/students…")`, không modal sửa, không nút xóa (negative search — G-2). SĐT/email/entryScore nhập sai chỉ có thể "chữa" bằng cách học viên tự onboarding (entryScore) hoặc… không cách nào (SĐT). Chấp nhận hay cần FR mới? — *(liên quan: FR-022 · cần: PO/dev)*
* [ ] OQ-3: Chip lọc "Sắp hết buổi / Nợ học phí / Viết / Nói" lọc trên `s.tags` mà `mapStudents` luôn gán `tags: []` — mọi chip khác "Tất cả" đều cho danh sách rỗng. Feature chết hay chờ nối dữ liệu? — *(liên quan: FR-003, BR-016 · cần: PO/dev)*
* [ ] OQ-4: Khối "Ghi chú nội bộ" trang chi tiết đọc `student.notes` luôn `""` — không có nguồn ghi nào trong kernel. Cầm cứng hay bỏ? — *(liên quan: FR-007, BR-016 · cần: PO)*
* [ ] OQ-5: `targetBand/skills/examDate` cứng `"—"/[]/""` trong view model → kicker chi tiết luôn "Chưa đặt mục tiêu" (test $studentId.test.tsx:69-78 chốt hành vi này). Dữ liệu targetScore/examInterest của portal onboarding không được chiếu lên teacher view — cố ý hay thiếu? — *(liên quan: FR-007 · cần: PO/dev)*
* [ ] OQ-6: `POST /api/students` không có gate `canManageStudentInvites` (khác các route invite/resend có gate, kernel.ts:699,1076) — trợ giảng `ta` có được tạo hồ sơ học viên không? — *(liên quan: FR-012, BR-013 · cần: PO)*
* [ ] OQ-7: Entry score do giáo viên nhập chỉ khi tạo hồ sơ; sau đó học viên onboarding có thể ghi đè (nếu wizard điền). Nguồn chân lý nghiệp vụ của "điểm đầu vào" là ai? — *(liên quan: FR-014, BR-005 · cần: BA/PO)*
* [ ] OQ-8: Không có phân trang/tìm kiếm server-side cho GET /students — ngưỡng quy mô org chấp nhận được là bao nhiêu? — *(liên quan: NFR-006 · cần: PO/dev)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| FR-022 | API + UI cập nhật/xóa hồ sơ học viên | Không sửa được dữ liệu nhập sai; rủi ro hồ sơ "rác" tích tụ (negative search: `grep -rn "kernel\.(patch|put|delete)" apps/server/src` trả 4 route: PUT attendance 2909, DELETE invitations 1346, DELETE enrollments 1480, DELETE class-sessions 2642 — không cái nào là hồ sơ học viên) | PO/dev (quyết + implement) |
| FR-003 | Test hành vi lọc chip (hiện chỉ test danh sách chip, index.test.tsx:126-135) | Thay đổi logic lọc không bị test bắt | dev |
| FR-017 | Test UI cho cảnh báo `inviteEmailSent=false` (add-student-modal.tsx:106-110 chưa thấy test colocated) | Cảnh báo có thể trôi lệch khi refactor mà không bị test bắt | dev |
| Error matrix | Wording zod chi tiết (vd "Điểm đầu vào tối đa 50 ký tự") không bao giờ xuống wire — server trả "invalid body" chung | Người dùng không biết sai field nào khi server từ chối | PO/dev (chọn: surface message hay giữ chung) |
| Boundary | Tài liệu ranh giới với `student-invitations` / `enrollment-lifecycle` chưa tồn tại (các feature reverse cùng batch) | Trùng lặp hoặc hụt yêu cầu khi ghép SRS | BA (bộ này) |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú (ngày/độ tin cậy) |
|------|-------------|-------------|---------------------------|
| Tạo học viên thủ công | "teachers no longer create students manually" (docs/project-overview-pdr.md:23) | `POST /api/students` hoạt động + nút UI + 4 test active (kernel.ts:463; kernel.test.ts:4982-5034; index.test.tsx:61-91) | 2026-11, cả hai high-confidence — để OQ-1, spec ghi ✅ theo code kèm 🟡 mâu thuẫn |
| Đường gắn học viên vào lớp | "only enroll … via POST /api/classes/:id/enroll" (PDR:23) | `POST /api/students` nhận `classId` và tự tạo enrollment `invited` (kernel.ts:544-554, test 7092) | 2 đường ghi danh song song cùng kết quả `invited` — OQ-1 mở rộng |
| Trạng thái hồ sơ | Reverse-states mô tả "Chưa liên kết / Chờ xác nhận / Đã liên kết" là trạng thái **derive** | Không có cột trạng thái trong `student` schema | Không phải xung đột nguồn — ghi rõ trong states doc để tránh hiểu nhầm |

## 4. Inferred assumptions (suy đoán cần verify)

* Một user chỉ có 1 membership/org hiệu lực (kernelCtx lấy membership đầu tiên) — validate: hỏi chủ hệ thống về kịch bản multi-org giáo viên; nếu sai: toàn bộ route teacher API chỉ nhìn org đầu tiên. — *(nguồn app.ts:279-296)*
* `tags/notes/targetBand` rỗng là dỡ chuyển tiếp mock→kernel, không phải quyết định bỏ tính năng — validate: hỏi PO xem mock-data `Student` còn được dùng ở đâu; nếu sai: gỡ chip lọc + khối ghi chú. — *(nguồn repos/students.ts:70-86)*
* Mail luôn cấu hình trong prod nên nhánh `inviteEmailSent=false` là hiếm — validate: runbook mail; nếu sai: học viên tạo mới sẽ không bao giờ nhận mail mời nếu không ai bấm resend. — *(nguồn kernel.ts:575-615)*
