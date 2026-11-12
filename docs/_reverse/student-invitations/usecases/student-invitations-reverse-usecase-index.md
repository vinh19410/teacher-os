```markdown
---
type: reverse-usecase-index
feature: student-invitations
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
---

# student-invitations — Use Case Index (reverse)

## Use cases

| Slug | Title | Primary Actor | Related FR | Screens | Errors | OQ | Nguồn | Nhãn |
|------|-------|---------------|-----------|---------|--------|-----|-------|------|
| [uc-org-invite-send](./uc-org-invite-send.md) | GV gửi lời mời vào tổ chức qua email | Giáo viên | FR-001..007, FR-020 | Modal "Mời học viên vào tổ chức" | E-001..005, E-009..011 | OQ-3, OQ-5 | S2, S5, S10, S12 | ✅ |
| [uc-org-invite-manage](./uc-org-invite-manage.md) | GV xem / thu hồi / gửi lại lời mời | Giáo viên | FR-008..011, FR-019 | Tab "Lời mời đang chờ" | E-003, E-006, E-008 | OQ-2, OQ-9 | S2, S5, S10, S19 | ✅ |
| [uc-invitation-accept](./uc-invitation-accept.md) | HV nhận thông báo và chấp nhận lời mời | Học viên | FR-012, FR-013, FR-016, FR-017, FR-020 | Chuông portal, màn NOT_LINKED, onboarding | E-006, E-012, E-013 | OQ-1, OQ-4 | S3, S5, S8, S11, S12 | ✅ |
| [uc-invitation-reject](./uc-invitation-reject.md) | HV từ chối lời mời | Học viên | FR-014, FR-020 | Chuông portal | E-006 | OQ-4, OQ-5 | S3, S5 | 🟡 |
| [uc-org-switch](./uc-org-switch.md) | HV chuyển tổ chức đang hoạt động | Học viên | FR-015, FR-022 | Org switcher shell | E-012 (gián tiếp) | OQ-8 | S3, S6, S11, S12 | ✅ |
| [uc-portal-invite-resend](./uc-portal-invite-resend.md) | GV gửi lại mời portal/lớp cho hồ sơ có sẵn | Giáo viên | FR-018 | Nút "Gửi lại lời mời" (target hồ sơ) | E-003..005, E-007, E-014 | OQ-10 | S2, S5, S10 | 🟡 |

## Actors

| Actor | Loại | Nguồn |
|-------|------|-------|
| Giáo viên (teacher/owner/admin/class_teacher) | người | S2, S17 |
| Trợ giảng (ta) — bị chặn | người | S17, S5 |
| Học viên (email đã xác thực) | người | S3, S11 |
| Hệ thống gửi email ngoài (Resend) | hệ thống ngoài | S16, S5 |
| API kernel / API portal | hệ thống | S2, S3 |

## Ghi chú

* Use case **tái lập chưa duyệt** từ nguồn — mỗi mệnh đề mang nhãn ✅/🔵/🟡. Chạy `/usecase student-invitations` (downstream mode) sau khi có SRS chính thức để điền traceability đầy đủ.
* `uc-portal-invite-resend` nằm rìa feature: dùng chung bộ mã lỗi lời mời nhưng đối tượng là hồ sơ học viên có sẵn + enrollment `invited`, không phải `student_invitation` — đã ghi chú để tránh trùng với feature `enrollment-lifecycle`.
* Use case **uc-invitation-reject** đánh 🟡 vì phía server có test active nhưng phía UI/e2e không có kịch bản phủ (xem `_evidence.md` §7).
```
