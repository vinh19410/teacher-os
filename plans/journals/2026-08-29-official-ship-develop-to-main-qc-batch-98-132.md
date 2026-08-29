---
title: "Official ship: develop to main (QC batch #98-#132)"
date: 2026-08-29
summary: "ak:ship official: promote develop→main gom batch QC #98–#132, 33+ commits/~107 files/+15.4k−3.9k (pnpm-lock excluded); tests 619/0 (server 181, web 373, auth 42, infra 15, node 8), review 0 critical/6 informational; migration 0011 anti-orphan + staging cookie namespace vào prod"
---

# Official ship: develop to main (QC batch #98-#132)

Branch `develop` → `main`, `/ak:ship official`, ngày 2026-08-29. Lần này không phải feature wave mà là **batch QC**: 33+ commits, ~107 files, **+15.4k/−3.9k dòng** — đã loại `pnpm-lock.yaml` khỏi thống kê vì nó là noise diff, không phải thay đổi thật.

## What happened

Promote release gom các fix QC trong phạm vi #98, #103–#132:

- **#104** (server,web,db): persist gói cho học viên tạo không kèm lớp — kèm **migration `0011`** với anti-orphan guard chặn gói mồ côi.
- **#105** (web,api): từ chối lịch end-before-start và `sessionsTotal 0` ngay lúc tạo lớp — dữ liệu rác bị chặn ở cửa.
- **#109**: global search dropdown có feedback khi không có kết quả, hết kiểu silent no-op.
- **#111**: navigation guard từ row học viên sang detail + trang 404 thân thiện.
- **#121**: `/schedule` tuần chính xác theo ngày + projected sessions cho lớp chưa có buổi nào (KPI hết treo số ảo).
- **#122**: enroll học viên có sẵn từ picker ở class detail.
- **#125** (round 2): staging auth — **cookie namespace theo stage**, cookie vùng prod không còn đè session staging; auth fail ồn ào thay vì im lặng; xoá PWA service worker gây nhiễu; staging auto-deploy CI.
- **#98/#103**: session actions theo occurrence identity — modal per-occurrence, chronology group theo ngày.

## Decision

Promote **một** release duy nhất mode official thay vì phủ từng fix PR sang main: cả batch đã sống qua CI develop và suite đầy đủ, tách nhỏ chỉ sinh thêm cửa sổ deploy rủi ro. Pre-landing review **0 critical / 6 informational** — hai finding đáng nhớ nhất, ghi rõ vào PR body thay vì sửa ngay:

1. Enroll học viên đang giữ **gói parked** sẽ mint gói thứ hai thay vì attach gói parked — duplicate entitlement nằm ngoài path hiện tại nhưng là mìn hờ cho data prod.
2. Không có **unique index `lesson(class_id, date)`** nên concurrent occurrence move là best-effort — race window chấp nhận có chủ đích, không phải vô tình không thấy.

## Evidence

Suite đầy đủ **619 passed / 0 failed**: server 181, web 373, auth 42, infra 15, node scripts 8. Review 0 critical, secrets sạch theo gate ship.

## Next steps

- Merge PR → `main`; theo dõi pipeline auto-deploy.
- Backlog hai informational: attach parked package khi enroll (đuôi của #104) và unique index `lesson(class_id,date)` nếu concurrent editing trở thành usage thật.
- Bắt staging auto-deploy CI qua ít nhất một vòng deploy thật trước khi tin nó — CI mới chưa ship là CI chưa được chứng minh.

Cảm nhận thật: ship batch QC nhẹ hơn promote 172 commits tuần trước đúng một trời một vực — 619 test xanh, 0 critical, không migration one-way phải.snapshot tay như lần 0009. Nhưng hai informational biết rõ mà để đi qua vẫn ngứa: đây là đúng kiểu nợ biết tên, ghi sổ rồi thì phải trả, đừng để nó thành entry journal tuần sau.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
