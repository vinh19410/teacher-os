---
title: "Validation và integration"
status: todo
---

# Phase 2: Validation và integration

## Overview

Kiểm chứng kit sau khi viết: link tương đối, tính kiểm tra được của SLA/tally, trạng thái seed rỗng (không evidence bịa), repo check xanh, rồi cập nhật issue #68 và metadata plan trước khi ship beta.

## Requirements

- Link check: mọi link tương đối trong 3 file mới + 2 file plan của plan này trỏ tới file tồn tại trên đĩa.
- Seed audit: grep không thấy dòng tally/blocker/reload nào có dữ liệu ngày; chỉ cho phép header, định nghĩa, và placeholder rõ ràng ("chưa có entry").
- Consistency: từ vựng severity/frequency/impact giữa `triage-convention.md` và `pilot-log.md` khớp nhau từng chữ; SLA "≤ 1 ngày làm việc" + định nghĩa ngày làm việc xuất hiện đồng nhất.
- Repo check: `pnpm check` xanh (biome không đổi gì ngoài file md mới).
- Issue #68 được comment cập nhật (branch, plan link, route, ship mode beta, acceptance criteria); label đúng trạng thái pipeline.

## Files to Create / Modify

- Modify: issue #68 (comment + label, qua `gh`)
- Không sửa code; không sửa `docs/` thường trực (kit thuộc plans/, roadmap không đổi vì DOD chưa có evidence).

## Implementation Steps

1. Chạy link check tất cả file mới (script throwaway, không commit).
2. Chạy seed audit + consistency audit.
3. Chạy `pnpm check`; sau đó kiểm tra `git status` — nếu script `--write` mutate bất kỳ file nào ngoài các file md mới của run này, revert phần đó trước khi tiếp tục (finding #6 red-team, disposition reject nhưng giữ guard thực thi).
4. Cập nhật issue #68 theo template vibe (branch, route, plan link, mode, acceptance criteria) + `ak plan update --issue 68`.

## Todo

- [x] Link + seed + consistency audit pass
- [x] `pnpm check` xanh
- [x] Issue #68 + plan metadata cập nhật

## Success Criteria

- Audit sạch, check xanh, issue phản ánh đúng trạng thái "kit sẵn sàng, evidence chờ pilot".
