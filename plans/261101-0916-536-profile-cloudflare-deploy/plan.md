---
title: "#536: Deploy apps/profile lên Cloudflare tại msmy.io.vn"
description: "Đưa apps/profile vào stack Alchemy như một StaticSite: prod tại msmy.io.vn + www, staging tại profile.staging.teacheros.io.vn, phát hành thành hai đợt để bộ đề được phát hành trước khi trang lên."
status: in-progress
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
| 1 | [Thêm profile vào topology và stack](./phase-01-topology-and-stack.md) | Completed | — |
| 2 | [Preflight và đợt 1: promote server, phát hành bộ đề](./phase-02-preflight-and-server-release.md) | Pending | — |
| 3 | [Merge và kiểm chứng trên staging](./phase-03-staging-verification.md) | Pending | 1, 2 |
| 4 | [Đợt 2: dọn DNS, đưa profile lên prod](./phase-04-production-cutover.md) | Pending | 3 |

Phase 1 được ship và merge vào `develop` theo hợp đồng pipeline beta (`ak-vibe --ship --beta`, chỉ chạy `ci.yml`, không tự deploy). **Cảnh báo promote:** SHA `develop` ngay trước khi merge Phase 1 là `0fa33c66f26f44e8bf1ebcf9041b56f0e6c290e4` — ở Phase 2 (đợt 1: promote server trước khi đưa profile lên prod), người vận hành phải promote từ SHA `0fa33c66f26f44e8bf1ebcf9041b56f0e6c290e4` (chưa chứa `profileWorker`) lên `main`, chỉ promote `develop` HEAD ở Phase 4 sau khi bộ đề đã phát hành và DNS `msmy.io.vn` đã được dọn. <!-- Updated: Red Team RT-5 & Kongming -->

## Rủi ro chính

| Rủi ro | Mức | Xử lý |
|---|---|---|
| CI token không có quyền zone msmy.io.vn. Staging không đụng zone này nên lỗi chỉ lộ ra ở prod | Cao | Xác nhận phạm vi token ở Phase 2 trước khi merge đợt 2 |
| `TEACHER_EMAILS` thiếu một giáo viên đang dùng prod làm họ mất quyền vào app (#513) | Cao | Đối chiếu tài khoản giáo viên trên prod trước khi đặt biến |
| Staging giành nhầm msmy.io.vn | Cao | Test topology khẳng định chỉ prod mới có host này |
| Build profile không nhận `LEAD_API_URL`, staging gửi lead vào API prod | Trung bình | Smoke kiểm tra `lead-api` trong HTML phải khớp API của stage |
| Hành vi Alchemy với DNS có sẵn chưa được tài liệu nêu | Trung bình | Xóa bản ghi web trước khi deploy; nếu còn lỗi thì đọc log, không tự thêm cờ override |

## Rollback

Revert PR profile rồi deploy lại bằng `deploy.yml`: Alchemy gỡ Worker và custom domain. Lưu ý: sau khi đã xóa các bản ghi DNS ở Phase 4 bước 4, việc gỡ custom domain sẽ để `msmy.io.vn` và `www.msmy.io.vn` trống DNS (`NXDOMAIN`) trừ khi khôi phục lại từ snapshot DNS đã lưu ở Phase 4 bước 2 (trạng thái cũ vốn là 525). Đợt 1 theo mục "Rollback code" của runbook; migration chỉ đi tiến. <!-- Updated: Red Team RT-5 -->

## Extension trace

Biến thể tiếp theo có thể là thêm trang profile cho giáo viên khác ở domain riêng. Hợp đồng ổn định là bộ `profileHost` / `profileAliases` / `profileOrigins` trong `DomainTopology`; phần phải đổi là hằng số domain và một resource nữa. Hiện chỉ có một trường hợp thật nên không tạo registry hay cấu hình nhiều site.

## Success Criteria

- [ ] `https://msmy.io.vn/` và `https://www.msmy.io.vn/` trả `200`, HTML có `lead-api` trỏ `https://api.teacheros.io.vn`.
- [ ] `https://msmy.io.vn/kiem-tra-dau-vao/` chạy được bộ đề đã phát hành, audio phát được trên Safari iOS.
- [ ] Gửi form từ apex tạo được một lead hiện trên `/leads`.
- [ ] MX và TXT của zone giữ nguyên so với trước khi đổi DNS.
- [ ] Staging phục vụ profile tại `profile.staging.teacheros.io.vn` và gọi API staging, không gắn msmy.io.vn.
- [ ] `deploy.yml` và `deploy-staging.yml` có smoke cho profile, cả hai đều xanh.
- [x] Runbook và `CHANGELOG.md` phản ánh đường deploy mới.


## Validation Log

### Session 1 — 2026-11-01

#### Verification Results
- Claims checked: 24
- Verified: 20 | Failed: 4 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Failures resolved in plan:
  1. `packages/infra/src/topology.ts:160-178` & `packages/infra/alchemy.run.ts:133-136`: `resolveLeadOrigins` nhận `{ hasTopology: boolean; isDev: boolean }` không truyền được `topology.profileOrigins` theo từng stage — đã đổi sang `{ topology?: Pick<DomainTopology, "profileOrigins">; isDev: boolean }` và bỏ `DEFAULT_PROD_LEAD_ORIGINS`.
  2. `node_modules/.../alchemy/src/Cloudflare/Website/StaticSite.ts:270-322`: `StaticSite` ở `alchemy@2.0.0-beta.72` đã truyền `env` qua `serializeEnv(props.env)` vào cả `Command.Build` và `Command.Dev`, trong khi nhánh fallback inline `command` sẽ lỗi `shell: false` / `PropExpr` — đã khóa dùng `env: { LEAD_API_URL: ... }` trực tiếp.
  3. `apps/profile/tests/placement-test.test.mjs:18-19`: file test kiểm tra `public/kiem-tra-dau-vao/index.html` và `buildProfile()` là `placement-test.test.mjs` (không chỉ `index.test.mjs`).
  4. `CHANGELOG.md:3-8` và `docs/production-release-runbook.md:101`: `CHANGELOG.md` nhóm theo ngày `## 2026-11-01` (không dùng `[Unreleased]`), và bảng `LEAD_ORIGINS` ở dòng 101 của runbook cần cập nhật đồng bộ với `topology.profileOrigins`.

### Whole-Plan Consistency Sweep (Validation)
- Đã đối chiếu toàn bộ `plan.md` và `phase-01..04.md`: chữ ký `DomainTopology` (`profileHost`, `profileAliases`, `profileOrigins`), `PROD_PROFILE_DOMAIN`, `resolveLeadOrigins(raw, { topology, isDev })`, danh sách file sửa và các bước kiểm chứng hoàn toàn nhất quán.

## Red Team Review

### Session — 2026-11-01
**Findings:** 7 (5 accepted, 2 rejected)
**Severity breakdown:** 2 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Chữ ký `resolveLeadOrigins` & `DomainTopology` giữa `topology.ts`, `alchemy.run.ts` và `docs/production-release-runbook.md:101` | Critical | Accept | Phase 1, Phase 2 |
| 2 | Nhánh fallback inline `command` cho `StaticSite` trong `alchemy@2.0.0-beta.72` làm hỏng `Command.Build` / `PropExpr` | High | Accept | Phase 1 |
| 3 | `Smoke check profile` thiếu kiểm tra `lead-api` trên `/kiem-tra-dau-vao/`, redirect `/kiem-tra-dau-vao`, `www.msmy.io.vn` và `timeout-minutes` | High | Accept | Phase 1 |
| 4 | Thiếu `apps/profile/tests/placement-test.test.mjs`, sai mục `CHANGELOG.md` (`## 2026-11-01`) và thiếu drift test cổng `8005` | Medium | Accept | Phase 1 |
| 5 | Cảnh báo SHA `0fa33c66f26f44e8bf1ebcf9041b56f0e6c290e4` cho đợt 1 promote server, kiểm tra quyền API zone `msmy.io.vn`, query `LEAD_ORG_ID` staging và Rollback DNS | High | Accept | Plan, Phase 1, Phase 2, Phase 3, Phase 4 |
| 6 | Thêm `resolveLeadOrgId` ném lỗi lúc deploy khi `LEAD_ORG_ID` rỗng | Critical | Reject (trái thiết kế fail-closed 503 khi để trống `LEAD_ORG_ID` tại `alchemy.run.ts:124-127`) | — |
| 7 | Thêm file `apps/profile/public/_headers` | Medium | Reject (ngoài phạm vi; `StaticSite` cùng mẫu `apps/landing` và trang có PDF iframe modal nội bộ) | — |

### Whole-Plan Consistency Sweep
- Đã rà soát toàn bộ `plan.md` và `phase-01..04.md` sau khi áp dụng 5 finding Red Team và tư vấn `kongming`: không còn tham chiếu `DEFAULT_PROD_LEAD_ORIGINS`, `hasTopology`, hay `[Unreleased]`; mỗi phase đều có khối `## Failure Protocol` theo chuẩn `--advice`.
<!-- slug: 536-profile-cloudflare-deploy -->
