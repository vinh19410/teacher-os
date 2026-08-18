# Advise: roadmap roll-up feature Teacher OS (mock → D1)

- Type: advise
- Date: 2026-08-17
- Status: confirmed with user (interview)
- Audience: người không đọc conversation — đủ để đưa vào `ak:plan`
- Scope: advisory only. Không implement.

## Reframing (đã xác nhận)

**Vấn đề.** 13 màn UI đã convert từ `open-design/v1`. Domain 100% in-memory (`useReducer` + `seedData`). Model mock là student-centric: `Student.pkg` nhúng, `Lesson.sid`, `Class.studentIds[]`, không org. Backend thật chỉ Better-Auth + 4 bảng auth trên D1. Làm feature theo cảm hứng sẽ viết lại schema/API vì các module chồng entity.

**Yêu cầu (verifiable).**

1. Kernel schema + API trước: `organization`, `membership`, `student` (person), `class`, `syllabus` + module/lesson giáo trình, `enrollment`, `session_package` gắn **enrollment**.
2. Adapter giữ 13 màn hiện tại chạy (shape `MockData` / `useData()`). Không rewrite UI trong wave kernel.
3. Bóc adapter từng module đến khi 13 màn đọc/ghi D1, scoped theo org.
4. Mỗi peel chỉ **thêm** bảng/API/file của module đó. Không đổi contract kernel.
5. Stub giữ nguyên: tạo hóa đơn, gửi báo cáo, Zalo, GCal, Pro 99k, enroll HV có sẵn, tạo buổi lịch, tạo bài tập.

**Mục tiêu.**

- Reload còn data kernel + module đã peel.
- GV cùng org thấy đúng phạm vi; org khác không đọc được.
- Feature sau (invoice line, Zalo, GCal) không migrate Class / Enrollment / Package.

**Non-goal.** Vá lỗ CRUD. Tích hợp ngoài. Parent login. Đổi stack (không tRPC). Dark mode. Sửa StatCard hardcoded. Đổi historical `plans/**`.

**Constraint.** Hono + D1 + Drizzle + Better-Auth + Alchemy. Lớp + giáo trình là lõi. 1:1 = lớp 1 người. Org + multi-teacher **trên schema** từ ngày 1. Light-only, copy VN.

**Quyết định kernel khóa thêm (từ interview + tránh rewrite).** Package thuộc enrollment, không thuộc class và không nhúng student. Lý do: UI Tuition/Student đã là gói theo HV; class 1:2 có remaining khác nhau. Gắn class = migrate Tuition sau.

**Quyết định chốt sau interview (2026-08-17).**

| # | Lock | Hệ quả plan |
|---|---|---|
| A | Org mới **trống** | Không seed demo, không nút “nạp demo”. HV/lớp/syllabus = user tạo. |
| B | Wave 7 **persist** | `report` + `notif` + `comment_bank` lên D1. Tạo/gửi report vẫn stub. |
| C | Role v1 = `teacher`. `owner` optional | Bootstrap membership `teacher`. Không gate owner-only. Enum `owner` được phép có, không bắt buộc có row/owner. |

---

## 1. Verdict

Làm đúng hướng: **đừng persist nguyên `MockData`**. Persist y nguyên (`student.pkg`, `studentIds[]`, `Lesson` không `classId`, `pkg.done` là counter) sẽ buộc rewrite đúng lúc Schedule/Tuition — trái mục tiêu.

Đường đúng: một wave nền (org + class-centric kernel + adapter), rồi bóc module. Không song song cho đến khi tách `DataProvider` thành repo theo module — file `data-store.tsx` / `mock-data.ts` / `apps/server/src/index.ts` / `packages/db/src/schema/index.ts` là điểm chồng.

Rủi ro lớn nhất không phải thứ tự màn. Là **coi `pkg.done` là source of truth**. Check-in hiện tăng counter trên student. Nếu kernel lưu counter đó, Schedule peel đổi sang ledger buổi = đổi invariant = rewrite. Kernel chỉ lưu **entitlement** (mua bao nhiêu, giá, hạn). Progress suy ra từ `lesson` khi peel Lịch.

Org/multi-teacher ngay từ schema là quyết định user. Đúng nếu sắp có trung tâm. Cost: mỗi query phải `orgId`, bootstrap org lúc login đầu (membership `teacher`, org trống), chưa có UI invite — schema sẵn, UX org **không** nằm roadmap này.

---

## 2. What you should do

### 2.1 Khóa 7 invariant (viết vào plan, không vào comment code)

| # | Invariant | Hệ quả |
|---|---|---|
| 1 | Mọi domain row có `orgId`. Auth `user` ≠ giáo viên profile. Membership role bắt buộc = `teacher` | Query filter membership. Không check `owner`. `owner` nếu có chỉ là nhãn optional |
| 2 | Dạy xảy ra trong `class`. 1:1 = class + 1 enrollment | `lesson.classId` NOT NULL khi có bảng lesson |
| 3 | `student` là person. Không cột pkg | Gói sống ở `session_package.enrollmentId` |
| 4 | Roster = `enrollment` (unique classId+studentId) | Cấm `student_ids` JSON trên class |
| 5 | Hai loại buổi tách vĩnh viễn: `syllabus_lesson` (giáo trình) ≠ `lesson` (lịch) | Không gộp id, không share table |
| 6 | Package = entitlement. `done`/`remaining` derive từ lesson `completed` | Cấm cột `done` là source of truth |
| 7 | `class.sessionsDone` derive, không ghi lúc check-in | Khớp test hiện tại; đừng “sửa thầm” |

Mapping adapter (wave 0): `Student.pkg` = package của enrollment **active** (rule: enrollment `status=active` mới nhất; không có thì remaining=0). `Class.studentIds` = enrollments. HV không lớp vẫn tồn tại (person). Org trống → không có case seed `s2`. Nếu sau này import demo (ngoài roadmap): mọi `lesson` phải có `classId`, tạo class 1:1 cho lịch mồ côi.

### 2.2 Wave 0 — Kernel (schema + API + adapter). UI không đổi

**Bảng.** `organization`, `membership(orgId, userId, role)`, `student`, `class`, `syllabus`, `syllabus_module`, `syllabus_lesson`, `enrollment`, `session_package`.

**Không** tạo bảng `lesson` / `invoice` / `assignment` / `report` ở wave này.

**API.** Hono + Zod. Org lấy từ membership của session (header/`X-Org-Id` nếu nhiều org; v1: org duy nhất của user). CRUD kernel. CORS: thêm PATCH/DELETE khi endpoint đầu tiên cần — hoặc POST action (`/check-in`) để giữ CORS hẹp.

**Bootstrap.** Login lần đầu → tạo org trống + membership `role=teacher`. Không UI org. Không tạo `owner`. Mọi teacher trong org cùng quyền ghi kernel (không phân quyền theo role trong roadmap này).

**Adapter.** Tách ngay, kẻo chồng file:

```
apps/web/src/lib/
  data-provider.tsx      # context only
  mock-data.ts           # types + helpers; seed chỉ còn fallback unread
  repos/kernel.ts        # fetch/map kernel → MockData
  repos/lessons.ts       # vẫn in-memory đến wave Lịch
  repos/invoices.ts
  repos/assignments.ts
  repos/reports.ts
  repos/notifs.ts
```

`reducer` chỉ còn cho collection chưa peel. Kernel mutations (`add-student`, `add-class`, `add-syllabus`, assign, module/lesson giáo trình, class notes) → API. Check-in **không** ghi `session_package.done` ở wave 0 (xem invariant 6). Adapter vẫn cộng remaining trên bản map in-session từ lesson mock.

**File ownership wave 0.** `packages/db/src/schema/*` (mới), `packages/db` migrate, `apps/server/src/routes/kernel/` (mới) + 1 dòng mount `index.ts`, `packages/api` (Zod contract, mới), `apps/web/src/lib/data-provider.tsx` + `repos/kernel.ts`. Không sửa 13 route files.

### 2.3 Bóc module — thứ tự phụ thuộc

```
Wave 0 Kernel
    ↓
Wave 1 Students (person + add-student API đã có)
    ↓
Wave 2 Syllabus (cây giáo trình đã có bảng)
    ↓
Wave 3 Classes (roster/enroll/assign/notes → API trực tiếp)
    ↓
Wave 4 Schedule  ★ bảng mới `lesson` + derive package
    ↓
Wave 5 Tuition   ★ bảng mới `invoice` (mark-paid; tạo HĐ vẫn stub)
    ↓
Wave 6 Assignments ★ bảng `assignment` + scores (gửi/nháp vẫn stub)
    ↓
Wave 7 Reports + notifs + commentBank  ★ persist 3 bảng; tạo/gửi report vẫn stub
    ↓
Wave 8 Xóa reducer/seed path, tắt banner demo khi không còn mock
```

**Vì sao thứ tự này.**

- Syllabus trước Classes: `class.syllabusId` FK + assign đã là kernel; peel chỉ tháo adapter trên route syllabus.
- Classes trước Schedule: `lesson.classId` bắt buộc.
- Schedule trước Tuition: màn Tuition hiện `pkg.remaining` — sau wave 4 số này mới thật từ D1.
- Assignments / Reports không phụ thuộc lịch. Sau wave 3 **có thể** song song 4∥6∥7 nếu người khác nhau, **không** song song nếu cùng đụng `data-provider.tsx`. Serial an toàn hơn với 1 người/1 agent.

**Ownership từng wave (write).**

| Wave | Được sửa | Cấm sửa |
|---|---|---|
| 1 | `students/*`, `add-student-modal.tsx`, `repos/students.ts` | classes, syllabus, schedule |
| 2 | `syllabus/*`, syllabus modals, `syllabus-progress.tsx` | students profile, tuition |
| 3 | `classes/*`, `add-class-modal`, `assign-syllabus-modal` | cây module/lesson, student profile |
| 4 | `schedule.tsx`, `lesson-modal.tsx`, khối điểm danh dashboard, `repos/lessons.ts`, schema `lesson` | tuition, assignments |
| 5 | `tuition.tsx`, `repos/invoices.ts`, schema `invoice` | student tabs khác tuition |
| 6 | `assignments/*`, `grade-modal`, schema `assignment` | reports |
| 7 | `reports.tsx`, notif panel, comment bank (grade modal append), schema `report`/`notif`/`comment_bank` | settings (local, không persist) |
| 8 | xóa `data-store-reducer.ts` path, `seedData` runtime, banner | không thêm feature |

Settings: không có store. Giữ local. Không phải lỗ persist — non-goal.

Dashboard StatCard + “Cần xử lý” hardcoded: **giữ**. Không derive KPI (ngoài phạm vi). Khối “hôm nay” lấy lesson đã persist sau wave 4.

### 2.4 Contract API để không rewrite

Một package `packages/api` (Zod). Server parse, web infer type. Không lấy `Action` union hiện tại làm public API — plan enroll đã ghi rõ không ổn định.

Pattern: `orgId` implicit. Resource lồng theo class khi thuộc class (`/classes/:id/enrollments`). Student là org-level (`/students`).

Mỗi peel thêm file route, không sửa signature kernel. Muốn đổi kernel → version mới hoặc cột mới nullable, không rename cột đã ship.

---

## 3. What you shouldn't do

- Persist nguyên `MockData` / `Action` “cho nhanh”.
- Nhét `lesson`/`invoice`/`assignment` vào migrate kernel “phòng khi”.
- Lưu `pkg.done` / `class.sessionsDone` như counter ghi lúc check-in.
- Gộp `Lesson` lịch với `SyllabusLesson`.
- Intro tRPC/oRPC/React Query “cho chuẩn” trước khi có 3 endpoint chạy. Fetch + Zod đủ.
- Vá stub (tạo HĐ, gửi report, GCal, Zalo, enroll HV cũ) trong các wave persist.
- Song song 2 wave cùng sửa `index.ts` / schema barrel / provider trước khi tách repo.
- Seed demo / nút “nạp demo”. Org mới = trống. Banner demo chỉ còn nghĩa “một phần UI vẫn mock” đến wave 8, không phải data mẫu.
- Viết UI org switcher / invite trong wave 0. Schema đủ; UX để plan khác.
- Đổi test characterization bằng cách nới invariant. Wave 4 được **xóa** test “check-in không tăng sessionsDone” chỉ khi thay bằng test derive.

---

## 4. Cheaper paths (cùng outcome)

1. **Bỏ wave 1–3 như “peel UI”.** Kernel đã persist student/class/syllabus. 1–3 chỉ tháo adapter. Gộp 1+2+3 thành “thin adapter” một PR nếu 1 người — vẫn tách commit theo folder. Effort thấp, impact rõ.
2. **POST-only mutations.** Không mở CORS PATCH/DELETE. Ít bề mặt.
3. **Một org/user, vẫn có cột orgId.** Role chỉ `teacher`. Không UI membership, không cột/permission `owner`. Đủ “sẵn multi-teacher” về schema. Rẻ hơn org admin.

Cắt wave 7 **không** còn là option — user đã lock persist.

Không khuyến nghị: persist mock 1:1 rồi migrate class-centric sau — đúng cái user muốn tránh.

---

## 5. Recommended path (current → xong)

0. Viết 7 invariant vào `plans/<ts>-persist-domain-kernel/plan.md`. Lock package-on-enrollment.
1. Wave 0: migrate D1 + Hono kernel + bootstrap org **trống** + membership `teacher` + tách repos + adapter. Gate: tạo HV + lớp + syllabus + enroll + gán syllabus, **reload còn**. 13 màn không đổi hành vi ngoài persist kernel writes. Org mới: 0 student/class/syllabus.
2. Gộp peel 1–3 (students/syllabus/classes routes trỏ thẳng repo, bớt map). Gate: không còn đọc `data.classes` giả từ seed cho 3 module đó.
3. Wave 4: bảng `lesson` với `classId` NOT NULL. Check-in/cancel persist. `remaining` = `package.total - count(completed lessons of enrollment)`. Dashboard hôm nay đọc D1. Gate: reload giữ trạng thái buổi.
4. Wave 5: `invoice`, mark-paid persist. Tạo HĐ vẫn stub.
5. Wave 6: `assignment` + scores, grade persist. Gửi/nháp stub.
6. Wave 7: bảng `report`, `notif`, `comment_bank` (org-level). List persist. Org mới: 3 collection trống. Create/send report vẫn stub. Append comment bank từ grade modal → D1. Notif không mark-read (không có write path hiện tại).
7. Wave 8: xóa reducer runtime, tắt “Dữ liệu demo” khi mọi write path đã D1. Test: thay characterization mock bằng contract API.

**Điều kiện dừng khuyến nghị này:** user đổi “Lớp là lõi” hoặc đòi parent login / Zalo trong cùng roadmap — lúc đó kernel thiếu `viewer` role và outbox; chi phí đảo = thêm bảng + policy, không đập Class nếu orgId đã có.

---

## 6. Benefits (khớp goal)

- Schema kernel ổn trước khi 13 màn phụ thuộc — không migrate Class/Enrollment/Package khi thêm invoice/assignment.
- UI không bị rewrite 2 lần (adapter → peel).
- File ownership rõ: mỗi wave một cụm route + một schema file + một repo.
- Org isolation có từ query đầu, không “vá tenant” sau.
- Progress gói nhất quán sau wave 4 (derive), hết lệch check-in vs `sessionsDone`.

## 7. Trade-offs

- Wave 0 invisible với user cuối (trừ data sống sau reload). Cảm giác chậm.
- Adapter tạm đồng nghĩa 2 shape (DB class-centric vs `MockData` student-centric). Phải xóa ở 1–3, không để sống mãi.
- Org trên schema, không UI: GV 2 không join được cho đến plan invite. User đã chọn sẵn org — cost này chấp nhận.
- 1:1 bắt buộc tạo lớp: lệch thói quen “thêm HV là dạy ngay”. Non-goal vá enroll/tạo buổi — HV mới từ `/students` chưa có lớp, chưa có lịch, đúng invariant.
- Không vá stub: app persist nhưng vẫn không tạo được hóa đơn/bài/báo cáo. Đúng scope đã chốt.
- Multi-teacher sớm = mọi endpoint cần authorize membership. Phức hơn single-user. Đảo về single-user sau thì rẻ (bỏ check); đảo từ single-user lên org = rewrite mọi bảng — nên giữ orgId.

**Khi nào đổi hướng.** Nếu 4 tuần sau vẫn 1 GV solo và adapter chưa bóc xong: gộp 1–3, không thêm org UI. Không cắt wave 7. Không bỏ cột orgId. Không bắt buộc thêm `owner`.

---

## 8. Work checklist

- [ ] Tạo plan `plans/<timestamp>-persist-class-centric-kernel/` ghi 7 invariant + file ownership từng wave
- [ ] Wave 0 schema: org, membership, student, class, syllabus, module, syllabus_lesson, enrollment, session_package (không lesson/invoice/assignment)
- [ ] Wave 0 API Zod + mount Hono + bootstrap org **trống** + membership `teacher` (không tạo owner)
- [ ] Tách `DataProvider` / `repos/*`; kernel writes qua API; collection khác giữ reducer
- [ ] Adapter map: `Student.pkg` ← package enrollment active; `Class.studentIds` ← enrollment
- [ ] Gate wave 0: add student/class/syllabus/enroll/assign → reload còn; `pnpm test` + `check-types` xanh
- [ ] Peel students + syllabus + classes (có thể 1 PR, 3 commit); không đụng schedule/tuition
- [ ] Wave 4: bảng `lesson` (`classId` NOT NULL), check-in/cancel persist, remaining derive
- [ ] Wave 5: bảng `invoice`, mark-paid persist; AddInvoiceModal vẫn no-op
- [ ] Wave 6: bảng `assignment` + scores; grade persist; gửi/nháp no-op
- [ ] Wave 7: bảng `report` + `notif` + `comment_bank`; list persist (org trống = list rỗng); create/send report no-op; append comment bank persist
- [ ] Wave 8: xóa runtime seed/reducer; banner demo tắt khi hết mock write; test API thay characterization nơi mock chết
- [ ] Isolation check: user org A không đọc class org B (test hoặc query)

## 9. Success metrics

| Metric | Cách verify | Target |
|---|---|---|
| Org mới trống | Login user mới, GET students/classes/syllabi | 3 list rỗng; 0 row seed |
| Membership teacher | Row `membership` sau login đầu | `role=teacher`. App chạy không cần row `owner` |
| Kernel sống sau reload | Tạo lớp + HV + enroll + syllabus, hard refresh | Row còn trên UI và D1 |
| Không cột độc hại | `packages/db/src/schema/**` | 0 cột `student.pkg_*`, 0 JSON `student_ids` trên class |
| Lesson có class | schema wave 4 | `lesson.classId` NOT NULL |
| Remaining không phải counter | schema + check-in | Không UPDATE `session_package.done` trong check-in |
| 13 màn persist theo scope | Mỗi màn: write hiện có → reload | Kernel + 4/5/6/7 (kể notif/commentBank) sống; stub vẫn stub |
| Org isolation | 2 user / 2 org, GET class | 403/empty, không leak |
| Mock runtime chết | grep `seedData` / `useReducer(reducer` trong app path | 0 sau wave 8 (test fixtures được giữ) |
| Quality gate | `pnpm test && pnpm check-types && pnpm run check` | exit 0 mỗi wave |
| File overlap | 1 wave mở 1 lúc trên shared barrels | Chỉ 1-line export ở `schema/index.ts` + `server/src/index.ts` |

---

## Evidence (verified, không phải tin)

- Mock entities + 13 actions: `apps/web/src/lib/mock-data.ts`, `data-store-reducer.ts`
- UI 13 view + stub invoice/report: routes `_auth/*`, comments trong AddInvoiceModal / CreateReportModal
- Server chỉ `/` + `/api/auth/*`: `apps/server/src/index.ts`
- DB chỉ auth: `packages/db/src/schema/index.ts` → `auth.ts`
- Convert plan cố ý không đụng server/DB: `plans/260815-1553-.../plan.md` out of scope
- Enroll plan: `Action` không phải public API D1
- Không `docs/` evergreen, không roadmap backend trước report này

## Open questions

Không còn. Ba câu mở đã lock: org trống; wave 7 persist report+notif+commentBank; role `teacher`, `owner` optional.

Không hỏi lại atomic unit / org / horizon.
