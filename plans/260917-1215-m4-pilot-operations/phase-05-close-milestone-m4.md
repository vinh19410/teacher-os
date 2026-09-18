---
phase: 5
title: "Đóng milestone M4 theo evidence"
status: pending
priority: P1
effort: "0.5d"
dependencies: [4]
---

# Phase 5: Đóng milestone M4 theo evidence

## Overview

Tổng hợp evidence từ pilot log thành báo cáo, tick DOD trên issue #53, đóng #67/#68/#53 và GitHub milestone 4, cập nhật roadmap. Chỉ chạy khi DOD đủ điều kiện — không tick trước, không tick "gần đủ".

## Requirements

- Điều kiện GO = cả 5 DOD có evidence; bất kỳ điều kiện nào chưa đạt → không đóng, quay lại Phase 4 và ghi rõ còn thiếu gì.
- Báo cáo tổng hợp tại `plans/260917-1215-m4-pilot-operations/reports/pilot-summary-<date>.md`: số ngày hoạt động/tổng ngày, danh sách phản hồi theo severity/frequency/impact, blocker đã xử lý (thời gian đáp ứng), kết quả reload checklist, khuyến nghị cho M5+.
- Evidence trong issue chỉ ở dạng link + số liệu đã ẩn danh; không data học viên, không secret.
- Defect + feature request còn tồn (không phải blocker) → tổng hợp thành danh sách đề xuất M5, không tự mở issue mới ngoài milestone trừ khi user yêu cầu.

## Related Code Files

- Create: `reports/pilot-summary-<date>.md`.
- Modify: `docs/project-roadmap.md` (M4 → Hoàn thành + evidence), issues #67/#68/#53, GitHub milestone 4.

## Implementation Steps

1. Đối chiếu pilot log với 5 DOD; lập bảng evidence: DOD → nguồn evidence (entry log / deploy record / bản ghi onboard / check-in).
2. Viết báo cáo tổng hợp; user review trước khi đóng issue (decision owner).
3. Đóng #67 (onboard evidence), #68 (pilot log + SLA evidence) với comment evidence-link; sau đó #53 (tick 5 DOD).
4. Đóng GitHub milestone 4 khi cả 3 issue đóng.
5. Cập nhật `docs/project-roadmap.md`: M4 → **Hoàn thành** (ngày + evidence); nếu có kết quả verify OAuth round-trip, ghi đè deviation note của M3.
6. `ak plan` cập nhật status các phase + close plan theo CLI.

## Success Criteria

- [ ] Bảng evidence 5/5 DOD hoàn chỉnh trong #53 trước khi tick.
- [ ] #67, #68, #53 đóng theo đúng thứ tự kèm evidence; GitHub milestone 4 đóng.
- [ ] `docs/project-roadmap.md` M4 → Hoàn thành kèm evidence; deviation M3 có kết quả cuối.
- [ ] Báo cáo tổng hợp có khuyến nghị M5 dựa trên data pilot thật.
- [ ] Không secret/data nhạy cảm trong bất kỳ artifact nào.
