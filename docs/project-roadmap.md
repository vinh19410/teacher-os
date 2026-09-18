# Project Roadmap

## Mục đích

Đưa Teacher OS từ nền tảng dữ liệu đã persist sang vận hành lớp thật qua pilot có kiểm soát. Roadmap này là nguồn trạng thái hiện tại cho người và AI collaborator; mỗi mốc được mirror 1:1 thành GitHub milestone (kèm issue tổng + issue con) trong repo `vinh19410/teacher-os`. Chi tiết tư vấn, kế hoạch thực thi và bằng chứng lịch sử ở `plans/`.

## Nguyên tắc tổ chức

- **Vertical slice theo giá trị**: mỗi mốc kết thúc khi giáo viên dùng được end-to-end một nhóm tính năng, không phải khi hết việc kỹ thuật.
- Mỗi mốc bắt buộc có 3 khối: **DÙNG ĐƯỢC** (hoạt động thật end-to-end), **CHƯA DÙNG ĐƯỢC** (bị loại rõ ràng tại mốc đó), **DOD** (checklist evidence-based).
- M1–M2 chạy trên **staging**; go-live production là mốc riêng (M3); pilot (self-pilot) sau go-live.
- Không đặt deadline theo tuần — tiến độ đo bằng DOD, không bằng lịch.

## Phạm vi đã chốt

- Một người full-time; pilot là **self-pilot** (đổi 2026-09-17): chính tác giả vận hành 2–3 lớp trên production theo nhịp thật — data thật nếu có, nếu không dùng dữ liệu mô phỏng nhưng vẫn vận hành hằng ngày như giáo viên thật (solo dev không tìm được giáo viên ngoài cho pilot).
- Luồng vận hành xuyên suốt: học viên/lớp → buổi học → điểm danh và tiến độ → ghi nhận thu phí.
- Có browser E2E cho luồng lõi, log phản hồi pilot và triage lỗi.

Không thuộc roadmap này: parent login, Zalo/GCal, mời hoặc quản trị nhiều giáo viên, dark mode. Chỉ thay đổi non-goal khi pilot chứng minh nó đang chặn vận hành lớp.

## Các mốc

Trạng thái: `Chưa bắt đầu` → `Đang thực hiện` → `Hoàn thành` hoặc `Blocked`. Mỗi mốc có GitHub milestone tương ứng (số issue tổng ghi kèm).

### M1 — Vận hành lớp học được (Class operations) · GitHub milestone: M1

Trạng thái: **Hoàn thành** (2026-08-23) — evidence bằng E2E CI harness (Playwright + local D1). Staging smoke org-mới chuyển vào M3 khi #41 unblock.

**DÙNG ĐƯỢC khi hoàn thành** (staging):
- Đăng nhập Google/email + bootstrap org.
- Tạo lớp với loại lớp + lịch structured; thêm học viên + enroll vào lớp.
- Syllabus CRUD (module → lesson).
- Tạo/sửa/hủy buổi học sinh từ lịch lớp.
- Check-in/điểm danh buổi học; tiến độ lớp derive từ lesson thật.
- Dashboard "buổi hôm nay" + học viên rủi ro từ data thật; nav tuần lịch hoạt động.

**CHƯA DÙNG ĐƯỢC tại M1**: tạo invoice (modal no-op), tạo assignment, tạo/gửi report, settings persist, chưa live production, E2E chỉ có luồng lớp.

**DOD**:
- [x] Org mới trên staging: tạo lớp có lịch → sinh buổi tương ứng, hiển thị đúng trên /schedule, nav tuần hoạt động. *(evidence: E2E spec #76 cover luồng; staging smoke defer M3 vì #41)*
- [x] Sửa/hủy buổi không làm hỏng buổi khác; check-in đúng trạng thái sau hard reload. *(evidence: PR #71 API + PR #76 E2E reload path)*
- [x] Dashboard 0 con số hardcode trong pilot view. *(evidence: PR #72)*
- [x] E2E CI xanh: login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data. *(evidence: PR #76 merged 2026-08-22; workflow E2E xanh nhiều lần liên tiếp)*
- [x] 0 CTA no-op trong luồng classes/schedule. *(evidence: PR #74 gỡ fake chrome + PR #75 wire nav thật)*

### M2 — Thu học phí được (Money loop) · GitHub milestone: M2

Trạng thái: **Hoàn thành** (2026-08-30) — evidence bằng E2E CI workflow xanh trên develop (@53fd2f2, PR #137) + server tests cho idempotency mark-paid.

**DÙNG ĐƯỢC khi hoàn thành**: tất cả M1 + tạo invoice cho enrollment (amount, due, note), mark-paid, tổng thu/chưa thu từ data thật.

**CHƯA DÙNG ĐƯỢC tại M2**: tạo assignment, tạo/gửi report, settings persist, chưa live production.

**DOD**:
- [x] AddInvoiceModal tạo invoice thật; hiện trong bảng sau reload. *(evidence: PR #136 — E2E spec `create-invoice.spec.ts` test 1: submit → POST /api/invoices 201 → row hiện, giữ sau reload)*
- [x] Mark-paid idempotent, đúng trạng thái sau reload. *(evidence: server test `kernel.test.ts` "mark-paid persists through snapshot and paid replay overwrites method" — replay 200, vẫn paid; E2E assert trạng thái paid + KPI giữ nguyên sau reload)*
- [x] Totals tuition = tổng từ invoice thật. *(evidence: PR #137 — E2E assert KPI Đã thu/Còn nợ từ invoice thật, baseline 0đ, flip sau mark-paid, giữ sau reload; unit test `tuition-from-kernel.test.ts`)*
- [x] E2E CI xanh: tạo invoice → mark paid → reload. *(evidence: workflow E2E success trên develop @53fd2f2 — `apps/e2e/specs/create-invoice.spec.ts` chạy trong `e2e.yml`)*
- [x] 0 CTA no-op trong luồng tuition. *(evidence: 3 CTA duy nhất trên /tuition đều wired thật — row gói navigate, "+ Tạo hóa đơn" mở modal POST thật, "Đã nhận" chạy `mark-invoice-paid` qua command bus; E2E đếm POST xác nhận)*

### M3 — Go-live production · GitHub milestone: M3

Trạng thái: **Hoàn thành** (2026-08-31) — GO trên release `235275c` sau r2 + r2.1; evidence [UAT r2 (2026-08-30)](../plans/260819-2034-production-readiness/reports/uat-evidence-phase-06-r2-2026-08-30.md) + [UAT r2.1 (2026-08-31)](../plans/260819-2034-production-readiness/reports/uat-evidence-phase-06-r2.1-2026-08-31.md). Ghi chú: Google OAuth leg theo deviation operator-approved (email-auth evidence + authorize precheck pass); vòng Google round-trip thật được verify khi pilot đầu tiên sign-in Google production (M4 — nay là self-pilot).

**DÙNG ĐƯỢC khi hoàn thành**: M1+M2 live trên production domain HTTPS, Google OAuth production (redirect URI đăng ký + precheck pass; round-trip thật chờ M4 theo deviation), có runbook hỗ trợ/rollback.

**CHƯA DÙNG ĐƯỢC tại M3**: pilot chưa bắt đầu; tạo assignment, tạo/gửi report, settings persist.

**DOD**:
- [x] 5 operator inputs #41 đóng (domain/APP_DOMAIN, Google redirect URI, UAT account, Safari runner, sign-off). *(evidence: r2 topology gate + sign-off row pre-deploy `24132d9`; Safari runner unlocked 2026-08-31 qua Accessibility grant — r2.1)*
- [x] D1 migration drill pass có evidence (phase 2 production-readiness). *(evidence: phase-02 success criteria [x] — throwaway-D1 proof repaired `0006`, ledger 2026-08-20 + runbook RPO/RTO section)*
- [x] Live UAT phase 6 re-run: GO — sign-in → bootstrap org → CRUD kernel → reload pass trên production. *(evidence: r2.1 — Chrome r2 + Safari r2.1 đều 6/6 pass incognito; unified GO table toàn pass)*
- [x] Deploy Alchemy production thành công + rollback rehearsed. *(evidence: deploy CI run 33313994693 `/readyz` smoke pass r2; rollback rehearsed = phase-02 restore drill + runbook code-rollback path)*
- [x] #28, #30, #41, #48 đóng với evidence. *(evidence: các issue comment + close kèm link r2/r2.1, 2026-08-31)*

### M4 — Pilot vận hành (self-pilot) · GitHub milestone: M4

Trạng thái: **Đang thực hiện** (2026-09-18) — #67 labeled in progress; board In progress. DOD chưa đạt.

Đổi phạm vi 2026-09-17: từ "1 giáo viên ngoài" sang **self-pilot** — solo dev không tìm được giáo viên nào cho pilot; người vận hành là chính tác giả trên production. Evidence self-pilot mang author bias (không phát hiện được friction UX mà chỉ người ngoài mới gặp) → decision record M5 phải ghi rõ provisional.

**DÙNG ĐƯỢC khi hoàn thành**: tác giả tự vận hành M1–M3 hằng ngày trên production như giáo viên; pilot log chạy.

**CHƯA DÙNG ĐƯỢC tại M4**: tạo assignment, tạo/gửi report, settings persist (trừ khi pilot evidence chứng minh blocker → đổi phạm vi theo quy ước).

**DOD**:
- [ ] Org thật trên production do tác giả onboard và vận hành ≥2 lớp theo lịch (data thật nếu có, nếu không dữ liệu mô phỏng vận hành theo nhịp thật); sign-in Google production thành công (đóng deviation OAuth từ M3).
- [ ] Hoạt động ≥8/10 ngày làm việc, liên tục ≥2 tuần.
- [ ] Pilot log có severity/frequency/workflow impact (ghi rõ evidence là self-pilot).
- [ ] 0 mất dữ liệu xác nhận sau reload.
- [ ] 0 pilot blocker mở quá 1 ngày làm việc.

### M5 — Ổn định & quyết định · GitHub milestone: M5

Trạng thái: **Chưa bắt đầu**.

**DÙNG ĐƯỢC khi hoàn thành**: bản ổn định sau pilot + decision record quý sau.

**CHƯA DÙNG ĐƯỢC tại M5**: feature mới theo quyết định (ứng viên đầu: assignment create, report create, settings persist — chỉ thêm nếu pilot chứng minh blocker).

**DOD**:
- [ ] Toàn bộ pilot blocker fix; regression E2E xanh.
- [ ] Metrics pilot tổng hợp (completion, support burden, critical errors).
- [ ] Decision record 1 trang: mở rộng / lặp pilot / đổi hướng + top 3 blockers theo frequency. Evidence là self-pilot → ghi rõ provisional; nếu chọn mở rộng, bước kế tiếp là pilot với giáo viên thật.
- [ ] `docs/project-roadmap.md` cập nhật phạm vi quý sau theo quyết định.

## Thước đo thành công

- Staging UAT pass toàn bộ luồng sign-in → lớp/học viên/enrollment → buổi học → reload.
- CI có ít nhất hai E2E workflow xanh: vận hành lớp và tạo/thu invoice.
- Không còn CTA no-op trong luồng đã chọn (classes/schedule/tuition).
- Người self-pilot có hoạt động vận hành ít nhất 8 trong 10 ngày làm việc pilot.
- Không có mất dữ liệu được xác nhận sau reload trong pilot.
- Cuối M5 có quyết định viết rõ "mở rộng / lặp pilot / đổi hướng" kèm top 3 blockers theo frequency.

## Quy ước cập nhật

Mỗi lần hoàn thành một mốc hoặc một hạng mục có thể ảnh hưởng DOD:

1. Cập nhật trạng thái mốc trong file này (`Chưa bắt đầu` → `Đang thực hiện` → `Hoàn thành` hoặc `Blocked`).
2. Tick mục DOD kèm link bằng chứng (E2E run, UAT evidence, deploy record); đồng bộ trạng thái GitHub milestone tương ứng (đóng milestone khi mọi mục DOD có evidence).
3. Ghi blocker hoặc thay đổi phạm vi chỉ khi chúng ảnh hưởng mục tiêu pilot; không ghi nhật ký triển khai vụn vặt vào tài liệu này.
4. Cập nhật [docs index](./index.md) nếu đường dẫn hoặc authority của roadmap thay đổi.

Không đánh dấu `Hoàn thành` chỉ vì code đã merge: DOD phải có bằng chứng tương ứng. Khi roadmap đổi hướng vì evidence pilot, cập nhật phạm vi, non-goal và thước đo trước khi thêm mốc mới.

## Nguồn quyết định

- [Project Overview PDR](./project-overview-pdr.md) — product contract và invariant bền vững.
- [System Architecture](./system-architecture.md) — request/data boundaries hiện tại.
- [Pilot-first advisory report](../plans/reports/advise-2026-08-19-pilot-first-90-day-roadmap.md) — rationale pilot-first gốc (đã xác nhận 2026-08-19).
- [Milestone-based roadmap advisory](../plans/reports/advise-2026-08-21-milestone-based-roadmap-github-mirroring.md) — tái khung theo vertical slice + GitHub mirroring (đã xác nhận 2026-08-21).
