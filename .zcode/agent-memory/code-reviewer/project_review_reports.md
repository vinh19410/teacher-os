---
name: project-review-reports
description: Review findings của teacher-os được commit trong plans/reports/ và
  plans/*/reports — đọc trước khi review để tránh re-litigate thiết kế đã duyệt
metadata:
  node_type: memory
  type: project
  originSessionId: sess_subagent_agent_0c16d609-c77a-4a81-be31-d6b6b3584c58
---

Findings từ các lần review trước (code-review, security, red-team) được commit trong `plans/reports/` và `plans/<issue>/reports/`, kèm plan/journal trong `plans/<issue>/`.

**Why:** Quy trình ship của repo (#292, #297) yêu cầu review beta trước khi promotion; lead coi các finding đã ghi nhận (ví dụ M1/M2/M3, F1–F14 của #292) là đã quyết — promotion review chỉ tìm vấn đề MỚI, không re-litigate.

**How to apply:** Trước khi report finding, grep `plans/reports/` + `plans/*/reports/` theo chủ đề; nếu finding đã được ghi nhận/chấp nhận (kể cả "đã accept trong plan"), chỉ nhắc lại ở mức informational kèm tham chiếu số finding cũ. Lưu ý: `hono` logger in cả path + query (logger/index.js:35, `url.slice(url.indexOf("/", 8))`) — claim ngược lại trong một số report cũ là sai.
