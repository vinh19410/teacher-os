# reverse-gaps — attendance

Nhãn: OQ = câu hỏi mở cho BA/user · GAP = khoảng trống bằng chứng · CF = Conflict · INF = Inferred (🟡 — code không nói).

## OQ (Open Questions)

- **OQ-01 — Xếp hạng ưu tiên P0/P1 cho FR/NFR và Severity lỗi.** Code/test không mang thông tin ưu tiên; cột Priority/Severity trong spec là đề xuất. Cần BA chủ trì chốt. 🟡
- **OQ-02 — Mục tiêu nghiệp vụ của cửa "chưa điểm danh".** Bộ đếm dashboard + CTA chỉ là cơ chế (apps/server/src/routes/dashboard-reminders.ts:64-149); không biết quy trình back-office nào phụ thuộc (điểm chuyên cần? học phí? thông báo PH?). 🟡
- **OQ-03 — Số phận setting tombstone `unexcused_deduct`.** contracts.ts:1329-1331: "Setting cũ `unexcused_deduct` trong `workspace_settings` là tombstone (#321) và chưa từng được enforce (chỉ echo ở form Cài đặt, commit `603e05b3`) — không đọc lại". Cột vẫn tồn tại với default "Có, trừ 1 buổi" (packages/db/src/schema/settings.ts:32). Negative-search: grep `unexcusedDeduct|unexcused_deduct` toàn repo (ngoài test) chỉ thấy settings.ts:32 + comment contracts.ts:1329 + DDL khai báo cột ở packages/db/src/migrations/0016_real_butterfly.sql:8 — không thấy bất kỳ chỗ đọc giá trị này nào sau khi tìm. Cần quyết: gỡ cột + form hay giữ nguyên. 🟡
- **OQ-04 — Định hướng dài hạn cho lớp legacy.** `mode: "legacy"` chỉ xem (apps/server/src/routes/daily-attendance.ts:251-281), không PUT được (UI chặn apps/web/src/components/attendance/attendance-session-row.tsx:137,230-274). Chờ gắn lịch ngày hay vĩnh viễn? 🟡
- **OQ-05 — Hành vi mong muốn khi sửa ca đã recorded.** CR-Bugs F3 cố ý tắt auto-advance/thông báo (apps/web/src/routes/_auth/attendance.tsx:187-192); đây là giữ hành vi TOS-7 hay cần feedback nhẹ? 🟡
- **OQ-06 — Wording UI cho 409 `holiday-locked`.** Throw tại apps/server/src/routes/kernel.ts:1996-2000 và kernel.ts:2206-2210 (feature schedule); cách hiển thị cho GV chưa tra trong nguồn feature này. 🟡
- **OQ-07 — Ước tính kích thước apply trong preview.** Trần 500 câu (apps/server/src/routes/holidays.ts:40-41) chỉ lộ khi đã 422; preview không trả số câu dự kiến. Cần không? 🟡
- **OQ-08 — Ghi chú học vụ có cần lộ cho học viên không.** "Teacher-only — không bao giờ chiếu vào /api/student" (packages/db/src/schema/lesson.ts:67-68). 🟡
- **OQ-09 — Giới hạn khoảng xem của GET daily.** Chỉ chặn format + năm 2000–2100 (packages/api/src/skeleton.ts:84-99). 🟡
- **OQ-10 — Khóa sửa điểm danh sau N ngày.** PUT cho phép re-save không hạn chế (apps/server/src/routes/kernel.ts:2993-3028 — guard chỉ loại cancelled/holiday/future). 🟡
- **OQ-11 — Chính sách bù cho mode cancel.** Không sinh bù, không kéo dài khóa (packages/api/src/holiday-plan.ts:201-214) — ai chấp nhận học viên mất buổi? 🟡
- **OQ-12 — Có cần i18n/catalog không.** Xem GAP-1. 🟡

## Gap

- **GAP-1 (R2) — Không tồn tại catalog i18n.** Negative-search: `find` theo `*i18n*/*locale*/*messages*` và `grep -rln "i18n|useTranslation"` trên apps/web/src — không thấy sau khi tìm. Hệ quả: mọi wording trong Error Matrix chỉ có MỘT nguồn (throw-site/component), không đối chiếu được với catalog. Các wording đã trích nguyên văn kèm cite.
- **GAP-2 — 415 `content-type must be application/json` của holiday routes chưa có test.** `grep -c "415" apps/server/src/routes/holidays.test.ts` = 0; handler tồn tại (apps/server/src/routes/holidays.ts:472-481). Rule vẫn ✅ theo code, nhưng không có R1.
- **GAP-3 — Không có test dedicated cho GET daily khi `?date=` ở tương lai.** Server vẫn trả danh sách (không chặn) — hành vi suy từ code (apps/server/src/routes/daily-attendance.ts:310-320) + UI chặn ghi phía client/server (PUT future-session); không thấy test khẳng định GET future OK. Rule "GET future = xem được, không ghi được" là 🔵 suy từ 2 phía chứ không có test thẳng.

## Conflict

- Không phát hiện conflict code-vs-code trong phạm vi nguồn đã đọc. (Các điểm dễ nhầm đã đối chiếu khớp: bucket legacy `(classId, time)` giữa GET daily và computeReminders; quy ước coerce `completed+NULL` giữa server contract comment và UI; `MAX_APPLY_STATEMENTS` dùng chung apply/undo.)

## Inferred (🟡 — cần xác nhận)

- **INF-1 — Actor nghiệp vụ thật:** code chứng minh actor hệ thống là teacher (gate 403 student/admin) nhưng không nói ai hưởng lợi (học viên/PH/trung tâm) và cửa điểm danh phục vụ quy trình nào (liên quan OQ-02).
- **INF-2 — Success metrics là ngưỡng test, không phải KPI production:** các con số ≤2s/≤120s là assert E2E; chưa có bằng chứng đo thực tế.
- **INF-3 — Priority của FR-29 (cửa dashboard):** chỉ là điều hướng hỗ trợ, nghi P1/P2 — đề xuất, không có nguồn.
- **INF-4 — Hệ quả tài chính của BR-01:** unexcused trừ buổi ⇒ ảnh hưởng số buổi còn lại của gói (invariant 6) ⇒ có thể ảnh hưởng gia hạn/học phí; code không nối tiếp bước đó trong feature này.
- **INF-5 — Thông báo `holiday_created` fail-open:** emit lỗi không làm vỡ apply (apps/server/src/routes/holidays.ts:634-637 comment "#454 D9 ... emit tự fail-open nên không đổi response 200") — mức độ chấp nhận rủi ro mất thông báo là quyết định nghiệp vụ.
- **INF-6 — Severity của E-07 (future-session):** code giải thích chọn 422 để client không hiểu nhầm là stale snapshot (apps/server/src/routes/kernel.ts:326-330); mức độ nghiêm trọng người dùng cuối vẫn do BA chốt.
