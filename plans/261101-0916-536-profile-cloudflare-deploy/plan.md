---
title: "#536: Deploy apps/profile lên Cloudflare tại msmy.io.vn"
description: "Đưa apps/profile vào stack Alchemy như một StaticSite: prod tại msmy.io.vn + www, staging tại profile.staging.teacheros.io.vn, phát hành thành hai đợt để bộ đề được phát hành trước khi trang lên."
status: pending
priority: P1
effort: 4h code + chờ vận hành
issue: 536
branch: feat/536-profile-cloudflare-deploy
tags: [infra, deploy, cloudflare, profile]
blockedBy: []
blocks: []
created: 2026-11-01
---

# Plan: #536 — Deploy apps/profile lên Cloudflare tại msmy.io.vn

## Outcome

`https://msmy.io.vn` và `https://www.msmy.io.vn` phục vụ `apps/profile` qua Cloudflare Workers Static Assets. Form đăng ký tạo được lead trên `/leads`, và `/kiem-tra-dau-vao/` chạy bộ đề đã phát hành. Từ đó profile được deploy tự động cùng `deploy.yml`, không còn bước tay.

## Hiện trạng đã kiểm chứng (2026-11-01)

| Điểm | Bằng chứng | Hệ quả |
|---|---|---|
| Profile chưa có trong stack | `packages/infra/alchemy.run.ts` không có resource profile; runbook chỉ ghi "build và deploy" chung chung | Cần thêm resource |
| msmy.io.vn dùng DNS Cloudflare, nhưng site hỏng | `dig NS` trả `jean`/`randall`; apex và www đều trả `525` | Không có site nào đang chạy để bị gián đoạn |
| Có khả năng cùng account với teacheros.io.vn | Cả hai zone cùng cặp nameserver | Đây chỉ là tín hiệu, chưa phải bằng chứng; phải xác nhận ở Phase 2 |
| Zone có mail Tino | `MX mx.tino.vn`, TXT SPF và xác minh Tino | Tuyệt đối giữ MX/TXT khi dọn DNS |
| Prod chậm develop 23 commit | `git rev-list origin/main..origin/develop`; `/public/placement-test` trên prod trả `404` | Phải promote trước khi trang có API để gọi |
| Biến production thiếu | Environment `production` chỉ có `MAILER_IMPL`, `MAIL_FROM` | Thiếu `TEACHER_EMAILS` làm deploy prod fail (`resolveTeacherEmails`); thiếu `LEAD_ORG_ID` làm lead và bộ đề trả 503 |
| Staging thiếu `LEAD_ORG_ID` | `/public/placement-test` staging trả `503 PLACEMENT_DISABLED` | Phải đặt trước khi verify staging |
| Migration đang chờ lên prod | `0058`, `0059` (có thể thêm `0060` của #533) | Tính lại danh sách lúc promote, backup D1 trước |

## Quyết định đã chốt

| Quyết định | Chọn | Lý do |
|---|---|---|
| Thứ tự phát hành | **Hai đợt**: promote server trước, cô Mỹ phát hành bộ đề, rồi mới đưa profile lên prod | Runbook #515 cấm deploy profile trước bước 4; repo tách cổng an toàn bằng PR, không bằng feature flag |
| DNS cũ ở apex và www | **Ghi lại rồi xóa** A/AAAA/CNAME web, giữ MX/TXT | Bản ghi cũ chặn custom domain; người dùng xác nhận không cần origin Tino |
| www | **Alias + canonical** về apex | Cùng cách với landing; redirect 301 cần quyền Rulesets mà CI token chưa có |
| Staging | `profile.staging.teacheros.io.vn`, tự suy từ topology | Staging tuyệt đối không được giành msmy.io.vn; origin này đã được dùng làm ví dụ trong `topology.test.ts` |
| Hình thức | `Cloudflare.Website.StaticSite`, cùng mẫu `landing` | App đã là HTML tĩnh; `dist/` đã có build sẵn |

## Non-goals

- Không gắn domain msmy.io.vn cho staging hay dev.
- Không dùng redirect 301 www, không mở rộng quyền CI token ngoài phạm vi zone msmy.io.vn.
- Không đổi nội dung trang, không làm #534 hay thay đổi logic form.
- Không xử lý `GH_WEBHOOK_SECRET` thiếu trên production: tính năng đang tắt an toàn (503), ngoài phạm vi.

## Phases

| # | Phase | Status | Phụ thuộc |
|---|-------|--------|-----------|
| 1 | [Thêm profile vào topology và stack](./phase-01-topology-and-stack.md) | Pending | — |
| 2 | [Preflight và đợt 1: promote server, phát hành bộ đề](./phase-02-preflight-and-server-release.md) | Pending | — |
| 3 | [Merge và kiểm chứng trên staging](./phase-03-staging-verification.md) | Pending | 1, 2 |
| 4 | [Đợt 2: dọn DNS, đưa profile lên prod](./phase-04-production-cutover.md) | Pending | 3 |

Phase 1 mở PR nhưng **chưa merge**: PR chỉ vào `develop` sau khi đợt 1 đã lên `main`, nếu không profile sẽ lọt vào đợt promote server.

## Rủi ro chính

| Rủi ro | Mức | Xử lý |
|---|---|---|
| CI token không có quyền zone msmy.io.vn. Staging không đụng zone này nên lỗi chỉ lộ ra ở prod | Cao | Xác nhận phạm vi token ở Phase 2 trước khi merge đợt 2 |
| `TEACHER_EMAILS` thiếu một giáo viên đang dùng prod làm họ mất quyền vào app (#513) | Cao | Đối chiếu tài khoản giáo viên trên prod trước khi đặt biến |
| Staging giành nhầm msmy.io.vn | Cao | Test topology khẳng định chỉ prod mới có host này |
| Build profile không nhận `LEAD_API_URL`, staging gửi lead vào API prod | Trung bình | Smoke kiểm tra `lead-api` trong HTML phải khớp API của stage |
| Hành vi Alchemy với DNS có sẵn chưa được tài liệu nêu | Trung bình | Xóa bản ghi web trước khi deploy; nếu còn lỗi thì đọc log, không tự thêm cờ override |

## Rollback

Revert PR profile rồi deploy lại bằng `deploy.yml`: Alchemy gỡ Worker và custom domain. Trước khi bị xóa, các bản ghi DNS đã được lưu ở Phase 4 nên có thể khôi phục, dù trạng thái cũ vốn là 525. Đợt 1 theo mục "Rollback code" của runbook; migration chỉ đi tiến.

## Extension trace

Biến thể tiếp theo có thể là thêm trang profile cho giáo viên khác ở domain riêng. Hợp đồng ổn định là bộ `profileHost` / `profileAliases` / `profileOrigins` trong `DomainTopology`; phần phải đổi là hằng số domain và một resource nữa. Hiện chỉ có một trường hợp thật nên không tạo registry hay cấu hình nhiều site.

## Success Criteria

- [ ] `https://msmy.io.vn/` và `https://www.msmy.io.vn/` trả `200`, HTML có `lead-api` trỏ `https://api.teacheros.io.vn`.
- [ ] `https://msmy.io.vn/kiem-tra-dau-vao/` chạy được bộ đề đã phát hành, audio phát được trên Safari iOS.
- [ ] Gửi form từ apex tạo được một lead hiện trên `/leads`.
- [ ] MX và TXT của zone giữ nguyên so với trước khi đổi DNS.
- [ ] Staging phục vụ profile tại `profile.staging.teacheros.io.vn` và gọi API staging, không gắn msmy.io.vn.
- [ ] `deploy.yml` và `deploy-staging.yml` có smoke cho profile, cả hai đều xanh.
- [ ] Runbook và `CHANGELOG.md` phản ánh đường deploy mới.

<!-- slug: 536-profile-cloudflare-deploy -->
