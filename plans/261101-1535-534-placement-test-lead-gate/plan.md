---
title: "#534: Form thông tin cá nhân trước khi làm bài kiểm tra đầu vào"
description: "Thêm bước 'Thông tin của bạn' (họ tên, email, SĐT bắt buộc; các trường còn lại tuỳ chọn) giữa phần giới thiệu và Phần 1 của /kiem-tra-dau-vao/. Lead được tạo ngay khi học viên vào bài, điểm CEFR được gắn vào cùng lead khi nộp bài."
status: pending
priority: P2
effort: 8h
issue: 534
branch: feat/534-placement-lead-gate
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-11-01
---

# Plan: #534 — Form thông tin cá nhân trước bài kiểm tra đầu vào

## Outcome

Khi học viên bấm **Bắt đầu làm bài** ở `/kiem-tra-dau-vao/`, họ phải điền form thông tin cá nhân trước. **Họ tên, email, số điện thoại bắt buộc**; ngày sinh, khóa học quan tâm, hình thức lớp, ghi chú là tuỳ chọn. Gửi form thành công mới vào Phần 1. Cô Mỹ nhận được lead ngay cả khi học viên bỏ dở bài, và khi học viên nộp bài thì điểm/CEFR được ghi vào đúng lead đó (không sinh lead trùng).

## Hiện trạng (đã scout)

- Trang test là static JS thuần (`apps/profile/public/kiem-tra-dau-vao/test.js`), flow `intro → part1 → part2 → result`, trạng thái lưu `localStorage` khoá `msmy_placement_attempt_v1`. Hiện **không** tạo lead; nút "Đăng Ký Theo Kết Quả Này" chuyển sang trang chủ với `?ketqua=&khoa=` để học viên tự điền form tư vấn.
- Lead intake: `POST /public/leads` (`apps/server/src/routes/public-leads.ts`), schema `leadSubmitSchema` (`packages/api/src/lead-contracts.ts`): `name`+`phone` bắt buộc, `email` **tuỳ chọn**, `.strict()`, honeypot `website`, `elapsedMs >= 3000`.
- Dedupe theo SĐT trong 24h: gửi lại cập nhật lead cũ (tối đa 5 lần), **ghi đè** `birth_date/course/study_*/note/placement` bằng giá trị mới (rỗng nếu không gửi), chỉ điền `name/email` khi đang rỗng, **không gửi lại email báo lead**. Giới hạn IP: 3 lead mới/10 phút/IP, trần 100 lead/ngày.
- Cột `lead.source` có sẵn (default `profile`), route đang ghi cứng `'profile'`.
- Test hiện có phải đổi: `apps/e2e/specs/profile-placement-test.spec.ts` khẳng định "xem kết quả **không** tạo lead"; `apps/profile/tests/placement-test.test.mjs`; `apps/server/src/routes/public-leads.test.ts`; `apps/server/src/lead-catalog-drift.test.ts` (chỉ đọc `profile/public/index.html`).

## Quyết định thiết kế

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Khi nào tạo lead | **Lúc gửi form (trước Phần 1)**, rồi **cập nhật cùng lead** khi nộp bài bằng chính endpoint dedupe-theo-SĐT | Mục đích của form là giữ được người làm dở; không cần endpoint mới. |
| Ép email bắt buộc | Thêm `source` tuỳ chọn (`profile` \| `placement-test`) vào `leadSubmitSchema`; `source = placement-test` thì `email` bắt buộc (server kiểm bằng `superRefine`) | Form trang chủ giữ email tuỳ chọn như cũ; ràng buộc nằm ở server chứ không chỉ client; có luôn nguồn lead trong `/leads`. |
| Trường tuỳ chọn trong form | Ngày sinh, khóa học quan tâm, hình thức lớp, ghi chú (gói trong khối "Thông tin thêm") | Giữ form ngắn; lịch học/khung giờ vẫn điền được ở form tư vấn sau bài test. |
| Gate là UX, không phải bảo mật | Client không thể ngăn người sửa `localStorage`/bỏ qua bước; chấp nhận | Test miễn phí, đáp án chi tiết đã bị ẩn; mục tiêu là thu lead, không bảo vệ nội dung. |
| Lỗi mạng/429/5xx ở bước gửi form | **Chặn tiếp tục**, hiện thông báo + nút thử lại + link Zalo | Giữ đúng ý "điền trước"; xem câu hỏi mở 1 về IP dùng chung. |
| Đồng bộ điểm lúc nộp bài | Best-effort, chạy nền, lỗi thì không chặn màn kết quả; chỉ gửi 1 lần cho mỗi kết quả (`syncedPlacement`) | Tránh tiêu hết trần 5 lần dedupe khi reload trang kết quả. |
| "Làm lại" | Giữ thông tin đã nhập, bỏ qua form; có liên kết "Không phải bạn? Đổi thông tin" | Máy dùng chung ở trung tâm; PII nằm trong localStorage nên cần lối xoá. |

## Phases

| # | Phase | Status | Effort | Dependencies |
|---|---|---|---|---|
| 1 | [Contract & route: `source`, email bắt buộc cho nguồn test](./phase-01-lead-contract-and-route.md) | Pending | 2h | — |
| 2 | [Trang test: bước form, gửi lead, đồng bộ điểm](./phase-02-profile-gate-step.md) | Pending | 4h | Phase 1 |
| 3 | [E2E, test hồi quy & tài liệu](./phase-03-e2e-and-docs.md) | Pending | 2h | Phase 1, 2 |

## Non-goals

- Endpoint mới, bảng mới, migration DB (cột `source` đã có).
- Sửa form tư vấn ở trang chủ hoặc bắt buộc email ở đó.
- Email báo lead lần hai khi có điểm (dedupe giữ nguyên "không gửi lại"); giáo viên xem điểm ở `/leads`.
- Đổi giới hạn IP/trần ngày của lead intake.
- Xác minh email/SĐT (OTP).

## Acceptance criteria

1. Từ `intro`, bấm "Bắt đầu" hiện form; thiếu hoặc sai họ tên/email/SĐT thì không qua được và có lỗi từng trường (tiếng Việt, focus trường lỗi đầu tiên).
2. Gửi form hợp lệ ⇒ 1 dòng `lead` (`source = placement-test`, email có giá trị) rồi mới vào Phần 1.
3. Nộp bài ⇒ cùng dòng lead có `placement` = chuỗi tóm tắt; **vẫn một dòng** cho SĐT đó; reload trang kết quả không tăng `submit_count`.
4. Server từ chối (`400 LEAD_INVALID`, `fields` chứa `email`) khi `source = placement-test` mà thiếu email; form trang chủ không gửi `source` vẫn nhận lead không email.
5. Reload giữa chừng không bắt nhập lại; "Đổi thông tin" xoá thông tin lưu và quay về form.
6. 3 viewport (1440×900, 768×1024, 375×812) không tràn ngang, điều hướng bàn phím và `aria-describedby`/`aria-invalid` đúng cho lỗi.
7. `pnpm exec biome check .`, `pnpm check-types`, test các gói liên quan và e2e profile đều xanh.

## Extension trace

Ranh giới ổn định: `POST /public/leads` + `leadSubmitSchema` với trường `source`. Biến thể kế tiếp (ví dụ trang khảo sát/quiz khác cũng thu lead) chỉ cần thêm một giá trị vào `LEAD_SOURCES` và quy tắc bắt buộc tương ứng; không cần registry hay cấu hình động.

## Red-team (tự rà soát, chưa chạy 4 persona độc lập)

- **Giả định**: dedupe-update ghi đè các trường tuỳ chọn ⇒ lần gửi thứ hai (lúc nộp bài) phải gửi lại **toàn bộ** trường của form, nếu không sẽ xoá khóa học/ghi chú. Đã đưa vào phase 2 và có test.
- **Thất bại**: trần 5 lần/SĐT và 3 lead/10 phút/IP. Một lượt làm = 2 lần gửi; làm lại tối đa ~2 lượt/24h. Lần gửi thứ hai lỗi thì bỏ qua âm thầm (kết quả vẫn hiển thị).
- **Phạm vi**: không đụng form trang chủ, không đổi giới hạn.
- **Bảo mật/PII**: lưu họ tên/email/SĐT trong `localStorage` để resume; có "Đổi thông tin" xoá; không đưa PII vào URL (`?ketqua=` vẫn chỉ chứa tóm tắt điểm); body < 4 KB; honeypot + `elapsedMs` giữ nguyên.

## Câu hỏi mở

1. Lớp học dùng chung một mạng (trung tâm) sẽ chạm trần 3 lead mới/10 phút/IP ⇒ học viên thứ 4 bị chặn ở form. Giữ nguyên hay nới cho `source = placement-test`?
2. Bộ trường tuỳ chọn đã chọn (ngày sinh, khóa học, hình thức lớp, ghi chú) có đủ không, hay cần thêm lịch học/khung giờ?
3. Có cần email báo cô Mỹ khi học viên nộp bài (hiện chỉ báo lúc tạo lead, chưa có điểm)?
