# Advise: Milestone-based roadmap + GitHub mirroring

- Type: advise
- Date: 2026-08-21
- Status: confirmed with user
- Scope: advisory report + roadmap rewrite (`docs/project-roadmap.md`) + GitHub milestones/issues theo yêu cầu tường minh của user. Không implement feature.

## Reframing (đã xác nhận)

**Vấn đề.** `docs/project-roadmap.md` chia 5 mốc theo "gate kỹ thuật + phạm vi công việc", không trả lời trực tiếp "hết mốc này giáo viên DÙNG ĐƯỢC gì / CHƯA gì". GitHub repo chưa có milestone nào; tiến độ nằm rải rác trong issues + `plans/`.

**Exact requirements.**

1. Viết lại hoàn toàn `docs/project-roadmap.md`: mốc mới theo vertical slice — mỗi mốc kết thúc khi giáo viên dùng được end-to-end một nhóm tính năng trên staging.
2. Mỗi mốc có 3 khối bắt buộc: (a) DÙNG ĐƯỢC, (b) CHƯA DÙNG ĐƯỢC, (c) DOD checklist evidence-based (giữ quy ước: không "Hoàn thành" chỉ vì merge).
3. Staging trước; go-live production là mốc riêng (M3) sau khi đủ tính năng; pilot thật sau go-live.
4. Mirror GitHub: mỗi mốc = 1 GitHub milestone (mô tả chứa DOD rút gọn) + 1 issue tổng (DOD đầy đủ) + issue con chi tiết cho từng feature còn thiếu. Gán issues đang mở (#28, #30, #41, #48) vào M3; đóng #9 (plan đã completed từ trước, còn sót).
5. Non-goals giữ nguyên: parent login, Zalo/GCal, đa giáo viên, dark mode. Không deadline theo tuần — roadmap theo giá trị.

**Goals.** Tại mọi thời điểm, user + giáo viên biết chính xác cái gì dùng được / chưa; GitHub là nguồn theo dõi milestone duy nhất; DOD kiểm chứng được.

**Constraints.** 1 người full-time; giữ stack (React/TanStack, Hono, D1/Drizzle, Better-Auth) và kernel contract class-centric org-scoped.

## Verdict

Hợp lệ và đúng thời điểm. Kernel persistence đã xong, CI kỷ luật, mọi gap còn lại đều là vertical slice rõ ràng — đây là lúc đổi từ "roadmap theo gate kỹ thuật" sang "roadmap theo giá trị sử dụng + DOD checkable + theo dõi trên GitHub milestone". Lưu ý trung thực: đây không phải lật đổ chiến lược pilot-first đã xác nhận 2026-08-19 — đó là chiến lược đúng — mà là đổi cách tổ chức, trình bày và theo dõi. Điểm user tự quyết khác khuyến nghị cũ: production dời từ mốc 0 về mốc 3 (staging trước). Chấp nhận được nhưng có rủi ro dồn production về cuối (xem Trade-offs); giảm thiểu bằng cách xử lý 5 operator inputs song song từ M1 — đó là việc của operator, không chặn code.

## Evidence đã xác minh

- Đã có: login/dashboard/classes/students/syllabus CRUD/schedule check-in/cancel/tuition mark-paid/assignment grade — `apps/web/src/routes/_auth/*`, `apps/server/src/routes/kernel.ts`.
- Còn thiếu (CTA no-op hoặc không có endpoint): tạo lesson, tạo invoice (`components/modals/add-invoice-modal.tsx:20-25` no-op), tạo assignment, tạo/gửi report (`create-report-modal.tsx` no-op), settings persist (`routes/_auth/settings.tsx:227-253` demo thuần local), schedule nav tuần + GCal badge hardcode.
- Production NO-GO 2026-08-20, chờ 5 operator inputs — issue #41, evidence `plans/260819-2034-production-readiness/reports/uat-evidence-phase-06.md`.
- GitHub: 0 milestones hiện tồn tại; labels workflow sẵn có (`in progress`, `ready to cook`, `ready to review`, `ready to ship beta`).

## Roadmap mới: 5 milestones

### M1 — Vận hành lớp học được (Class operations)

**DÙNG ĐƯỢC khi hoàn thành** (staging):
- Đăng nhập Google/email + bootstrap org (đã có)
- Tạo lớp với loại lớp + lịch structured (đã ship PR #47) + thêm học viên + enroll (đã có)
- Syllabus CRUD (đã có)
- **Tạo/sửa/hủy buổi học** sinh từ lịch lớp (MỚI — lõi của mốc)
- Check-in/điểm danh buổi; tiến độ lớp derive từ lesson thật (đã có, giờ có data thật)
- Dashboard "buổi hôm nay" + học viên rủi ro từ data thật (bỏ hardcode); nav tuần hoạt động

**CHƯA DÙNG ĐƯỢC tại M1**: tạo invoice (modal no-op), tạo assignment, tạo/gửi report, settings persist, mọi thứ chưa live production, E2E chỉ có luồng lớp.

**DOD**:
- [ ] Org mới trên staging: tạo lớp có lịch → sinh buổi tương ứng, hiển thị đúng trên /schedule, nav tuần hoạt động
- [ ] Sửa/hủy buổi không làm hỏng buổi khác; check-in đúng trạng thái sau hard reload
- [ ] Dashboard 0 con số hardcode trong pilot view
- [ ] E2E CI xanh: login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data
- [ ] 0 CTA no-op trong luồng classes/schedule

### M2 — Thu học phí được (Money loop)

**DÙNG ĐƯỢC**: tất cả M1 + tạo invoice cho enrollment (amount, due, note), mark-paid (đã có), tổng thu/chưa thu từ data thật.

**CHƯA**: tạo assignment, tạo/gửi report, settings persist, production.

**DOD**:
- [ ] AddInvoiceModal tạo invoice thật; hiện trong bảng sau reload
- [ ] Mark-paid idempotent, đúng trạng thái sau reload
- [ ] Totals tuition = tổng từ invoice thật
- [ ] E2E CI xanh: tạo invoice → mark paid → reload
- [ ] 0 CTA no-op trong luồng tuition

### M3 — Go-live production

**DÙNG ĐƯỢC**: M1+M2 live trên production domain HTTPS, Google OAuth production, có runbook hỗ trợ/rollback.

**CHƯA**: pilot chưa bắt đầu; assignments/reports create; settings persist.

**DOD**:
- [ ] 5 operator inputs #41 đóng (domain/APP_DOMAIN, Google redirect URI, UAT account, Safari runner, sign-off)
- [ ] D1 migration drill pass có evidence (phase 2 production-readiness)
- [ ] Live UAT phase 6 re-run: GO — sign-in → bootstrap org → CRUD kernel → reload pass trên production
- [ ] Deploy Alchemy production thành công + rollback rehearsed
- [ ] #28, #30, #41, #48 đóng với evidence

### M4 — Pilot vận hành

**DÙNG ĐƯỢC**: giáo viên thật dùng M1–M3 hằng ngày; pilot log chạy.

**CHƯA**: assignments/reports create, settings persist (trừ khi pilot evidence chứng minh blocker → scope change theo quy ước roadmap).

**DOD**:
- [ ] 1 giáo viên onboard, vận hành ≥2 lớp thật trên production
- [ ] Hoạt động ≥8/10 ngày làm việc, liên tục ≥2 tuần
- [ ] Pilot log có severity/frequency/workflow impact
- [ ] 0 mất dữ liệu xác nhận sau reload
- [ ] 0 pilot blocker mở >1 ngày làm việc

### M5 — Ổn định & quyết định

**DÙNG ĐƯỢC**: bản ổn định sau pilot + decision record quý sau.

**CHƯA**: feature mới theo quyết định (ứng viên đầu: assignment create, report create, settings persist — chỉ thêm nếu pilot chứng minh blocker).

**DOD**:
- [ ] Toàn bộ pilot blocker fix; regression E2E xanh
- [ ] Metrics pilot tổng hợp (completion, support burden, critical errors)
- [ ] Decision record 1 trang: mở rộng / lặp pilot / đổi hướng + top 3 blockers theo frequency
- [ ] `docs/project-roadmap.md` cập nhật phạm vi quý sau theo quyết định

## What you should do

1. Viết lại `docs/project-roadmap.md` theo 5 mốc trên (đã thực hiện theo yêu cầu user).
2. Tạo 5 GitHub milestones + issue tổng + issue con chi tiết; gán #28/#30/#41/#48 vào M3; đóng #9 (housekeeping — plan completed từ trước).
3. Làm M1 ngay: luồng tạo lesson là blocker lớn nhất của toàn bộ app (schedule/điểm danh/tiến độ không chạy được với org mới).
4. Xử lý 5 operator inputs song song từ M1 — không đợi M3 (việc của operator, không đụng code).
5. Mỗi mốc xong: update trạng thái docs + đóng GitHub milestone + evidence link.

## What you should not do

- Không xếp assignments/reports create vào M1–M4 — đó là non-goal đã chốt, chỉ mở sau khi pilot evidence yêu cầu.
- Không tạo issue con quá nhỏ (mỗi feature 1 issue, không tách theo layer).
- Không đánh dấu milestone đóng khi DOD checklist chưa có evidence.
- Không thêm deadline tuần vào milestone — theo dõi theo DOD.

## What could be better / more efficient

- Dùng GitHub Projects (board) với milestone làm column — chi phí thấp, nhưng milestone + labels hiện tại đã đủ cho 1 người; chỉ thêm khi thấy thiếu.
- Gộp M1+M2 thành một mốc lớn — giảm overhead theo dõi nhưng mất nhịp "xong một giá trị, verify một giá trị"; không khuyến nghị.

## My take and route

Làm M1 trước tiên (tạo lesson từ structured schedule đã có sẵn data — không đổi schema lớn), song hành xử lý operator inputs. M2 theo sau vì schema invoice đã ổn. M3 là moment go-live: đóng #41, chạy D1 drill + UAT re-run theo plan sẵn có. M4 pilot 2 tuần. M5 ra quyết định. Route này tái sử dụng tối đa kernel đã verify, không viết lại gì.

## Benefits

- Mọi lúc đều trả lời được "dùng được gì / chưa" — đúng yêu cầu của user.
- GitHub milestone = nguồn theo dõi duy nhất, khớp issues hiện có.
- DOD evidence-based kế thừa quy ước đang có — không "hoàn thành ảo".
- Thứ tự slice khớp dependency thật của codebase.

## Trade-offs

- **Staging trước, production cuối (quyết định của user, khác khuyến nghị live sớm)**: rủi ro mọi vấn đề production (OAuth/CORS/domain) dồn về M3, sát pilot. Điều kiện mất hiệu lực: nếu UAT M3 lộ blocker lớn cần refactor → lịch pilot trượt, cân nhắc đổi lại production sớm. Chi phí chuyển hướng: thấp (hạ tầng Alchemy đã sẵn).
- Assignments/reports/settings người dùng thấy CTA nhưng không hoạt động đến hết M4 — giao tiếp rõ "chưa" trong docs để không vỡ niềm tin pilot.
- Milestone theo giá trị không có ngày — nếu cần press, phải tự đặt节奏 riêng.

## Work checklist

- [x] Viết lại `docs/project-roadmap.md` theo 5 mốc (DÙNG ĐƯỢC/CHƯA/ĐOD)
- [x] Tạo 5 GitHub milestones (mô tả DOD rút gọn, trỏ issue tổng)
- [x] Tạo issue tổng cho từng milestone (DOD đầy đủ, gán milestone)
- [x] Tạo issue con chi tiết cho từng feature còn thiếu (gán milestone + label `in progress`/mặc định)
- [x] Gán #28, #30, #41, #48 vào M3; đóng #9 kèm comment evidence
- [ ] Bắt đầu M1: issue tạo lesson API + UI
- [ ] Xử lý 5 operator inputs song song (owner: operator)

## Success metrics

- [ ] `gh api repos/vinh19410/teacher-os/milestones` trả về đúng 5 milestones mở, mô tả có DOD
- [ ] Mỗi milestone có đúng 1 issue tổng mở + các issue con; #28/#30/#41/#48 có milestone M3
- [ ] `docs/project-roadmap.md` phản chiếu 1:1 cấu trúc GitHub milestones
- [ ] Issue #9 closed với comment dẫn plan completed
- [ ] M1 đạt khi 5/5 mục DOD có evidence link (E2E run + UAT notes)
