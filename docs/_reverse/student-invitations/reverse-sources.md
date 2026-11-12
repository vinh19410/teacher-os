```markdown
# student-invitations — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | `packages/db/src/schema/student-invitation.ts` | code (schema Drizzle) | 2026-11 | high | OK | Entity lời mời, enum trạng thái, unique pending per org+email |
| S2 | `apps/server/src/routes/kernel.ts` | code (route API giáo viên) | 2026-11 | high | OK | Invite/resend/cancel/list, tạo HV thủ công + auto-accept, cooldown, CAS, email build |
| S3 | `apps/server/src/routes/student.ts` | code (route API portal) | 2026-11 | high | OK | Guard học viên, notifications, accept/reject, orgs, org header, CSRF |
| S4 | `apps/server/src/student-provisioning.ts` | code | 2026-11 | high | OK | Quy tắc không auto-provision khi còn pending invitation (D1-D7) |
| S5 | `apps/server/src/student-invitation.test.ts` | test (vitest, active) | 2026-11 | high | OK | Toàn bộ hành vi API lời mời + #570 + CSRF + cooldown + ALREADY_JOINED |
| S6 | `apps/server/src/student.test.ts` | test (vitest, active) | 2026-11 | high | OK | Guard đa org, `?org=` fallback, org lạ, auto-accept khi tạo HV |
| S7 | `apps/server/src/student-multi-org-migration.test.ts` | test (vitest, active) | 2026-11 | high | OK | Ràng buộc unique multi-org cả invitation lẫn student |
| S8 | `apps/server/src/routes/student-auth-otp.test.ts` | test (vitest, active) | 2026-11 | high | OK | Pending invitation → 403 NOT_LINKED để hiển thị UI chấp nhận |
| S9 | `packages/api/src/contracts.ts` | code (contract Zod) | 2026-11 | high | OK | STUDENT_INVITATION_ERROR_CODES, schema invite, DTO StudentInvitationItem/StudentOrgItem |
| S10 | `apps/web/src/components/modals/invite-student-modal.tsx`, `apps/web/src/components/students/pending-invitations-list.tsx`, `apps/web/src/components/students/pending-invite-callout.tsx`, `apps/web/src/lib/repos/invitations.ts`, `apps/web/src/lib/repos/students.ts`, `apps/web/src/routes/_auth/students/index.tsx` | code (UI web) | 2026-11 | high | OK | Toàn bộ UI giáo viên + wording lỗi/toast + cooldown client |
| S11 | `apps/student/src/components/layout/notification-bell.tsx`, `apps/student/src/components/layout/org-switcher.tsx`, `apps/student/src/components/layout/student-shell.tsx`, `apps/student/src/components/overview/student-error-view.tsx`, `apps/student/src/lib/repos/student.ts`, `apps/student/src/routes/_auth/index.tsx` | code (UI portal) | 2026-11 | high | OK | Chuông lời mời, accept/reject, org switcher, localStorage org, màn NOT_LINKED |
| S12 | `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`, `apps/e2e/specs/student-portal-provisioning.spec.ts`, `apps/e2e/specs/enroll-existing-student.spec.ts` | test (Playwright, active) | 2026-11 | high | OK | Hành vi end-to-end 2 portal, no-ghost-row, resend fresh key, guard teacher-signup |
| S13 | `docs/project-overview-pdr.md` (mục "Student Multi-Org and Invitation Model" + durable decisions) | doc chính | 2026-11 | high | OK | Đối chiếu intent sản phẩm; phát hiện 2 khác biệt (xem reverse-gaps §3) |
| S14 | `packages/db/src/migrations/0025_spotty_betty_ross.sql` | migration SQL | 2026-11 | high | OK | SQL thật của bảng lời mời + unique index |
| S15 | `packages/db/src/schema/student.ts`, `packages/db/src/schema/organization.ts`, `packages/db/src/schema/membership.ts`, `packages/db/src/schema/enrollment.ts`, `packages/db/src/schema/notification-record.ts`, `packages/db/src/schema/notif.ts` | code (schema) | 2026-11 | high | OK | Entity liên quan + boundary với enrollment/inbox |
| S16 | `apps/server/src/lib/notifications/invite-email.ts`, `apps/server/src/lib/notifications/org-mail-sender.ts`, `apps/server/src/lib/notifications/emit.ts`, `apps/server/src/lib/brand.ts` | code (lib) | 2026-11 | high | OK | Nội dung email lời mời, sender/reply-to, brand, resolveMailer an toàn |
| S17 | `packages/auth/src/role.ts`, `apps/server/src/app.ts` | code (auth) | 2026-11 | high | OK | Vai trò được quản lý lời mời, KernelCtx, bootstrap, CORS |
| S18 | `apps/server/src/routes/snapshot.ts` | code | 2026-11 | high | OK | Định nghĩa `portalLinked` trên snapshot giáo viên (`snapshot.ts:656`) |
| S19 | `apps/web/src/components/students/pending-invitations-list.test.tsx`, `apps/web/src/routes/_auth/students/index.test.tsx` | test (vitest, active) | 2026-11 | high | OK | UI giáo viên: empty state, badge, dedupe #616, count |

## Ghi chú nguồn

- __Confidence mỗi nguồn:__ toàn bộ nguồn là code/test đang hoạt động trong repo tại commit develop (2026-11) → high. Không có nguồn ảnh/convert.
- __Encoding ⚠:__ không phát hiện mojibake trong các file đã đọc.
- __Nguồn mâu thuẫn / lỗi thời:__ PDR (S13) dùng "real-time" và "teachers no longer create students manually" trong khi code hiện tại là polling 15s và vẫn cho tạo học viên thủ công → ghi vào `reverse-gaps.md` §3 Conflicts, KHÔNG tự chọn bên.
- Điểm bắt đầu theo `docs/_reverse/reverse-plan.json` (slug `student-invitations`) được mở rộng bằng grep `invitation|invite` trên `apps/server/src`, `apps/web/src`, `apps/student/src`, `packages/db/src` (chi tiết negative-search xem `_evidence.md` §7).
```
