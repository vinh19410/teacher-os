---
phase: 3
title: "Onboard giáo viên pilot"
status: pending
priority: P1
effort: "0.5d + phụ lịch giáo viên"
dependencies: [1, 2]
---

# Phase 3: Onboard giáo viên pilot

## Overview

Đưa giáo viên thật lên production và tạo 2–3 lớp thật — gate duy nhất phụ thuộc bên ngoài của milestone (user chốt được giáo viên từ Phase 1). Buổi onboard cũng là lúc verify Google OAuth round-trip thật, đóng deviation còn treo từ M3.

## Requirements

- **Gate ngoài (user):** giáo viên đã đồng ý tham gia. AI không tự liên hệ giáo viên — chỉ cung cấp tài liệu (Phase 1) và chạy kỹ thuật trong buổi onboard.
- Buổi onboard chạy trên production, data thật của giáo viên — không seed, không `fixture-*`, không xóa/sửa data giáo viên dưới bất kỳ hình thức nào.
- Verify OAuth round-trip thật theo step đã định nghĩa ở Phase 2; kết quả pass/fail ghi evidence ngay trong buổi. Fail → blocker, xử lý theo SLA, buổi onboard tạm dừng ở bước đăng nhập.
- Kết thúc buổi: giáo viên có ≥2 lớp thật với học viên thật, tự thao tác được các luồng M1–M2 (điểm danh, invoice).
- Ghi evidence onboard vào pilot log: ngày, số lớp, ai tham gia, kết quả từng bước script; cập nhật `docs/project-roadmap.md` M4 → **Đang thực hiện**.

## Related Code Files

- Modify: `docs/project-roadmap.md` (M4 status → Đang thực hiện kèm evidence), pilot log (entry onboard).
- Read only: `plans/260917-1215-m4-pilot-operations/onboarding-script.md`.

## Implementation Steps

1. User chốt lịch với giáo viên; AI chuẩn bị: rà `reload-checklist.md` baseline còn pass, production `/readyz` OK; **xác nhận trước thiết bị/browser của giáo viên** (desktop/laptop + Chrome hoặc Safari cập nhật — assumption Phase 2 phải được verify tại đây, nếu GV chỉ có điện thoại thì dừng và báo user quyết định).
2. Chạy buổi onboard theo `onboarding-script.md`: OAuth round-trip (evidence slot riêng) → org → lớp → học viên → điểm danh → invoice.
3. Ghi evidence onboard vào pilot log (ngày, lớp, bước pass/fail, phản hồi đầu tiên của giáo viên).
4. Cập nhật roadmap M4 → Đang thực hiện kèm link evidence.
5. Bắt đầu tally "ngày làm việc" từ ngày đầu giáo viên dùng thật — đồng hồ DOD ≥2 tuần chạy từ đây.

## Success Criteria

- [ ] Google OAuth round-trip thật trên production: pass có evidence (hoặc fail → blocker theo SLA, không có ngoại lệ "chưa kịp test").
- [ ] Giáo viên có ≥2 lớp thật, ≥1 lớp có học viên thật; giáo viên tự thao tác được điểm danh + invoice.
- [ ] Evidence onboard trong pilot log đủ để tick nửa đầu của DOD-1 khi Phase 5 tổng hợp.
- [ ] Roadmap M4 → Đang thực hiện.
