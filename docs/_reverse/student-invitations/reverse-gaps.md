```markdown
# student-invitations — Gaps & Open Questions

## 1. Open Questions

* [ ] OQ-1: Lời mời `pending` có cần thời hạn hết hạn (TTL) + job dọn dẹp? Hiện không có cơ chế hết hạn trong repo — lời mời sống vô hạn cho tới khi được chấp nhận/từ chối/thu hồi. — *(liên quan: Mục 5 BR, Mục 9 Flows · cần: PO/dev quyết)*
* [ ] OQ-2: `GET /api/students/invitations` không gọi `canManageStudentInvites` (mọi role kernel đọc được, kể cả `ta`), trong khi invite/resend/cancel đều gate. Chủ ý để TA xem danh sách, hay thiếu? — *(liên quan: Mục 3 FR-021 · cần: dev/PO quyết)*
* [ ] OQ-3: Có cần chặn GV mời chính email tài khoản của mình, hoặc mời email thuộc tài khoản giáo viên/owner khác không? Code hiện không có guard nào — nếu chấp nhận, HV accept sẽ tạo hồ sơ học viên trùng email giáo viên trong org. — *(liên quan: Mục 5 · cần: PO quyết)*
* [ ] OQ-4: GV có cần nhận thông báo khi HV chấp nhận/từ chối lời mời không? Hiện không có notify nào trong handler accept/reject — GV chỉ biết bằng cách tải lại danh sách. — *(liên quan: Mục 9 Flow 4/5 · cần: PO quyết)*
* [ ] OQ-5: Cooldown mời lại chỉ quét các dòng `canceled`; mời lại sau `rejected` không bị chặn 60s. Chủ ý (khuyến khích mời lại sau khi HV từ chối) hay thiếu? — *(liên quan: Mục 5 BR-012 · cần: PO quyết)*
* [ ] OQ-6: Khi gửi email lần đầu thất bại, dòng lời mời bị XÓA hẳn — có cần giữ lịch sử "gửi thất bại" để GV/GV hỗ trợ truy vết không? — *(liên quan: Mục 6 E-005 · cần: PO quyết)*
* [ ] OQ-7: Endpoint accept/reject cập nhật status không kèm điều kiện `status='pending'` trong WHERE (khác với resend có CAS). Race 2 request accept đồng thời có thể cùng đi qua select và Update; hồ sơ không nhân bản nhờ unique index nhưng response có thể 500 (unique violation không được catch). — *(liên quan: Mục 5 BR-004 · cần: dev xác nhận)*
* [ ] OQ-8: Có cần trần số org một email được tham gia không? Schema + route không có giới hạn. — *(liên quan: Mục 3 FR-022 · cần: PO quyết)*
* [ ] OQ-9: UI giáo viên chỉ hiện lời mời `pending`; lịch sử `rejected`/`canceled` không có chỗ xem dù API trả đủ. Có cần màn lịch sử không? — *(liên quan: Mục 10 Screens · cần: PO/design quyết)*
* [ ] OQ-10: Đếm "Lời mời đang chờ" gộp cả hồ sơ chưa portalLinked (không có lời mời email nào) —có ổn định nghiệp vụ khi org có nhiều HV offline chưa có email? — *(liên quan: Mục 3 FR-019 · cần: PO xác nhận)*
* [ ] OQ-11: Toàn bộ mức ưu tiên P0/P1/P2 của FR/NFR và "Mức độ" use case là phán đoán BA suy từ code (repo không có nguồn priority sản phẩm) — cần PO duyệt trước khi dùng lập kế hoạch. — *(liên quan: Mục 3/4 · cần: PO quyết)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| Mục 7 SC | Metric acceptance rate / time-to-accept không được đo ở đâu trong code | Không đánh giá được hiệu quả mời học viên | PO + dev (thêm thống kê hoặc log sự kiện) |
| Mục 10 Screens | Không có UI lịch sử lời mời đã xử lý (accepted/rejected/canceled) cho GV dù API trả đủ trạng thái | GV không truy vết được "tại sao HV chưa vào" sau khi HV từ chối | Design + dev |
| Test portal | Không có unit/integration test cho component `NotificationBell` (accept/reject UI) trong `apps/student/src` — chỉ có e2e accept; e2e KHÔNG có kịch bản "Từ chối" | Regression UI từ chối lời mời có thể lọt | dev student portal |
| E2E | E2E chỉ accept 1 org duy nhất; kịch bản UI switch giữa 2 org sau accept không có (API test đã phủ) | Multi-org switch UI ít được bảo vệ ở tầng browser | dev e2e |
| Thông báo GV | Không có bất kỳ notification cho GV khi accept/reject (grep `emitNotifications|notify` trong 2 handler: không có) | GV chỉ phát hiện qua refresh thủ công | PO |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú (ngày/độ tin cậy) |
|------|-------------|-------------|---------------------------|
| Cách HV nhận thông báo lời mời | "real-time notifications in their portal bell icon" (PDR `docs/project-overview-pdr.md:48`) | Polling định kỳ 15 giây (`apps/student/src/lib/repos/student.ts:729`) | Code là nguồn hành vi thật; PDR cần chỉnh wording (cùng 2026-11) |
| Giáo viên có tạo học viên thủ công không | "teachers no longer create students manually" (PDR `docs/project-overview-pdr.md:23`) | Vẫn có: nút "Thêm học viên" + `POST /api/students` + test active (`apps/web/src/routes/_auth/students/index.test.tsx:61`, `apps/server/src/routes/kernel.ts:463`) | Code + test mới hơn intent ghi trong PDR → OQ cho PO xác nhận hướng sản phẩm |
| Thông báo lời mời là "notification" | Tên endpoint `GET /api/student/notifications` gợi ý hệ thống notification | Dữ liệu trả về là bảng `student_invitation` (join org + user), KHÔNG phải `notification_record` (`apps/server/src/routes/student.ts:553-574`) | Chỉ là đặt tên; không phải lỗi — ghi chú để tránh nhầm với inbox in-app |

## 4. Inferred assumptions (suy đoán cần verify)

* Accept đồng thời 2 request không nhân bản hồ sơ nhờ unique index (org, email); response thứ hai có thể 500 nếu insert đụng constraint. — *validate: viết race test 2 request accept · nếu sai: HV thấy lỗi 500 nhưng vẫn accept thành công (cần UX xử lý).*
* Mời lại sau `rejected` không có cooldown là hành vi chấp nhận được (không test phủ). — *validate: test mời lại sau rejected liên tiếp · nếu sai: rủi ro spam email khi HV từ chối nhiều lần.*
* Idempotency key mailer (`student_invite:{id}` / `...:resend:{token}`) được hạ tầng mailer dùng để chống gửi trùng khi retry. — *validate: đọc contract `Mailer`/Resend adapter · nếu sai: email có thể gửi trùng khi network retry.*
* Không giới hạn số org cho 1 email là chấp nhận được về hiệu năng (guard load MỌI dòng student theo email mỗi request rồi filter trong bộ nhớ). — *validate: đo p99 `/api/student/me` với email thuộc nhiều org · nếu sai: cần giới hạn hoặc tối ưu truy vấn.*
* `portalLinked` là chỉ dấu "đã tham gia portal" duy nhất cho UI giáo viên (không có trạng thái riêng cho lời mời org đã accept nhưng chưa onboarding — UI vẫn coi là "Chờ xác nhận" nếu hồ sơ có email mà chưa onboarding). — *validate: hỏi PO về kỳ vọng hiển thị · nếu sai: GV có thể gửi lại mời portal nhầm cho HV đã accept org qua lời mời.*
```
