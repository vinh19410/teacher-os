---
type: jira-import-bundle
feature: selfomy-alignment
project_key: TOS
ac_mapping: subtasks
epic_mode: create
generated: 2026-10-26
author: "@vinh.tran"
status: ready-for-import
---

# Jira Import Bundle — selfomy-alignment (Project: TOS)

> Xuất tự động từ `/ba-jira selfomy-alignment --push` (chế độ fallback khi phiên làm việc chưa kết nối Atlassian MCP).
> Cấu hình đã chốt tại `.claude/state/atlassian/sync-state.yaml`:
> - **Project Key:** `TOS`
> - **AC Mapping:** `subtasks` (mỗi Acceptance Criterion = 1 Sub-task dưới Story cha)
> - **Hierarchy:** `1 Epic` → `11 Stories` (`US-001..US-011`) → `37 Sub-tasks` (`AC`)

---

## 1. Bảng Tổng hợp Issue Cần Khởi tạo (50 Issues: 1 Epic + 11 Stories + 37 Sub-tasks)

| # | Temp Ref | Issue Type | Parent Ref | Priority | Summary | Labels | Vault Source |
|---|----------|------------|------------|----------|---------|--------|--------------|
| 1 | `TOS-EPIC-01` | Epic | — | P0 (Highest) | [selfomy-alignment] Đồng bộ Hóa Tính năng Vận hành Lớp, Trợ giảng AI 4 Kỹ năng, Phòng thi Công khai & Thuê bao Trung tâm | `ba-vault`, `selfomy-alignment`, `srs-epic` | [docs/selfomy-alignment/srs/selfomy-alignment-spec.md](../../docs/selfomy-alignment/srs/selfomy-alignment-spec.md) |

---

## 2. Chi tiết Epic (`TOS-EPIC-01`)

- **Issue Type:** `Epic`
- **Project Key:** `TOS`
- **Summary:** `[selfomy-alignment] Đồng bộ Hóa Tính năng Vận hành Lớp, Trợ giảng AI 4 Kỹ năng, Phòng thi Công khai & Thuê bao Trung tâm`
- **Priority:** `P0 (Highest)`
- **Labels:** `ba-vault`, `selfomy-alignment`, `srs-epic`, `ba-vault:docs/selfomy-alignment/srs/selfomy-alignment-spec.md`
- **Vault Path:** [docs/selfomy-alignment/srs/selfomy-alignment-spec.md](../../docs/selfomy-alignment/srs/selfomy-alignment-spec.md)
- **Description (Jira Markdown):**
  - **Mục tiêu nghiệp vụ:** Thu hẹp khoảng cách tính năng cốt lõi giữa Teacher OS và Selfomy One trên 4 trụ cột: (1) Vận hành lớp học hằng ngày, điểm danh tổng, lịch nghỉ lễ dời buổi tự động & sổ công nợ học viên kèm thông báo đa kênh; (2) Trợ giảng AI 4 kỹ năng IELTS (nhập đề PDF/ảnh `5 credit`, chấm nháp Writing `1 credit` / Speaking `2 credit`, giải thích lưu đệm & Trợ giảng Chat AI `100 lượt miễn phí/ngày`); (3) Phòng thi ảo công khai thu thập `GuestLead` có trần bảo vệ kép (`1 lượt/khách` & `20 credit/ngày/phòng`); (4) Mô hình thuê bao tháng (`200k/70Cr`, `350k/130Cr`, `500k/200Cr`), Top-up (`149k/100Cr`), thanh toán QR tự động & quản trị trung tâm nhiều nhân sự (`4 vai trò`, trần Credit cá nhân/tháng).
  - **Phạm vi Yêu cầu:** `FR-selfomy-alignment-001..032` (32 FR), `NFR-selfomy-alignment-001..008` (8 NFR), `BR-selfomy-alignment-001..012` (12 BR), `E-selfomy-alignment-001..012` (12 Error Codes).
  - **Tài liệu liên kết:**
    - SRS Spec: [docs/selfomy-alignment/srs/selfomy-alignment-spec.md](../../docs/selfomy-alignment/srs/selfomy-alignment-spec.md)
    - ERD (16 thực thể): [docs/selfomy-alignment/srs/selfomy-alignment-erd.md](../../docs/selfomy-alignment/srs/selfomy-alignment-erd.md)
    - Sequence & Activity Flows: [docs/selfomy-alignment/srs/selfomy-alignment-flows.md](../../docs/selfomy-alignment/srs/selfomy-alignment-flows.md)
    - State Machines: [docs/selfomy-alignment/srs/selfomy-alignment-states.md](../../docs/selfomy-alignment/srs/selfomy-alignment-states.md)
    - User Flow & 11 Screens: [docs/selfomy-alignment/srs/selfomy-alignment-userflow.md](../../docs/selfomy-alignment/srs/selfomy-alignment-userflow.md)

---

## 3. Chi tiết 11 Stories & 37 AC Sub-tasks

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
