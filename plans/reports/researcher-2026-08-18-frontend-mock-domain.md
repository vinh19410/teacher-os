# Research: verify advise claims — frontend mock domain

- Type: researcher
- Date: 2026-08-18
- Source of claims: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md`
- Scope: read-only, live source only. Không redesign.

**Verdict.** 9/12 claim đúng. 3 claim đúng nhưng cần siết wording trước khi plan lock: StatCard không toàn bộ hardcoded; bottleneck không phải `data-store.tsx`; “100% in-memory” chỉ domain, không gồm auth.

---

## Trade-off (đối chiếu advise vs live)

| Claim | Verdict | Risk nếu plan tin nguyên văn |
|---|---|---|
| Domain in-memory | Đúng (domain) | Thấp — auth đã persist |
| Student-centric, no org | Đúng | Thấp |
| 13 màn | Đúng | Thấp |
| Check-in = counter `pkg.done` | Đúng | Cao nếu persist counter |
| `sessionsDone` characterization | Đúng | Cao nếu “sửa thầm” |
| Stub list | Đúng | Thấp |
| Settings local | Đúng | Thấp |
| StatCard / Cần xử lý hardcoded | Một phần | Trung — class/syllabus StatCard *derive* |
| Action ≠ public API | Đúng | Thấp |
| `data-store.tsx` bottleneck | Sai file | Trung — collision thật = reducer + types |
| File ownership peel | Đúng, có overlap | Trung — vài file chéo wave |
| Test inventory / lệnh | Đúng | Thấp |

---

## 1. Domain 100% in-memory (`useReducer` + `seedData`) — ĐÚNG (domain)

`DataProvider` khởi tạo một `useReducer` với `seedData`. Không persist.

```38:38:apps/web/src/lib/data-store.tsx
	const [data, dispatch] = useReducer(reducer, seedData);
```

- `seedData` export tại `apps/web/src/lib/mock-data.ts:186`.
- Grep `localStorage|sessionStorage|indexedDB|persist` trong `apps/web/src` = 0 hit.
- Banner xác nhận: `apps/web/src/components/layout/topbar.tsx:66` — “Dữ liệu demo — thay đổi không được lưu”.
- Mount: `AppShell` bọc `DataProvider` (`apps/web/src/components/layout/app-shell.tsx:65`). Reload = reset seed.

**Ngoại lệ (advise cũng ghi).** Auth không mock: Hono chỉ `/` + `/api/auth/*` (`apps/server/src/index.ts:20-24`). DB barrel chỉ `auth.ts` (`packages/db/src/schema/index.ts:1`) — bảng `user/session/account/verification` (`packages/db/src/schema/auth.ts:4-89`).

---

## 2. Student-centric mock — ĐÚNG

| Shape | Live | Cite |
|---|---|---|
| `Student.pkg` nhúng | `total/done/remaining/price/mode/start/expiry` | `mock-data.ts:15-23` |
| `Lesson.sid` | có; **không** `classId` | `mock-data.ts:33-43` |
| `Class.studentIds[]` | có | `mock-data.ts:106`, seed `640/656/671` |
| Org | 0 field `orgId`/`organization` trong `apps/web/src` | grep rỗng |

Hệ quả seed: `s2` tồn tại (`mock-data.ts:212`) nhưng không nằm roster nào (`c1=["s1","s4"]`, `c2=["s3"]`, `c3=["s5"]`). Invoice/Assignment/Report cũng `sid` (`mock-data.ts:49/68/78`).

Hai loại buổi đã tách type: `Lesson` lịch (`mock-data.ts:33`) ≠ `SyllabusLesson` giáo trình (`mock-data.ts:117`).

---

## 3. 13 màn convert từ `open-design/v1` — ĐÚNG

HTML export có đúng 13 `#view-*` (`open-design/v1/teacher-os.html:317-485`). Convert plan map 13 (`plans/260815-1553-.../plan.md:64-78`). Live routes khớp:

| Export | Route |
|---|---|
| view-dashboard | `_auth/dashboard.tsx` |
| view-students | `_auth/students/index.tsx` |
| view-student-detail | `_auth/students/$studentId.tsx` |
| view-schedule | `_auth/schedule.tsx` |
| view-tuition | `_auth/tuition.tsx` |
| view-assignments | `_auth/assignments/index.tsx` |
| view-assignment-detail | `_auth/assignments/$assignmentId.tsx` |
| view-classes | `_auth/classes/index.tsx` |
| view-class-detail | `_auth/classes/$classId.tsx` |
| view-syllabus | `_auth/syllabus/index.tsx` |
| view-syllabus-detail | `_auth/syllabus/$syllabusId.tsx` |
| view-reports | `_auth/reports.tsx` |
| view-settings | `_auth/settings.tsx` |

Ngoài 13: `_auth/route.tsx` (layout+guard), `login.tsx`, `index.tsx` redirect. `app-shell.tsx:7-21` title map = đúng 13.

---

## 4. Check-in tăng `pkg.done` / `remaining` như counter — ĐÚNG

```122:136:apps/web/src/lib/data-store-reducer.ts
		case "check-in": {
			const lesson = state.lessons.find((l) => l.id === action.lessonId);
			if (!lesson || lesson.status === "completed") return state;
			return {
				...state,
				lessons: state.lessons.map((l) =>
					l.id === action.lessonId ? { ...l, status: "completed" } : l,
				),
				students: state.students.map((s) => {
					if (s.id !== lesson.sid) return s;
					const done = s.pkg.done + 1;
					const remaining = Math.max(0, s.pkg.total - done);
					return { ...s, pkg: { ...s.pkg, done, remaining } };
				}),
			};
		}
```

Không đụng `classes`. Dispatch UI: dashboard `dashboard.tsx:74`, lesson modal `lesson-modal.tsx:75`. Cancel không đổi pkg (`data-store-reducer.ts:138-144`, test `:250`).

Advise invariant 6 (“cấm persist `done` như source of truth”) khớp live.

---

## 5. `class.sessionsDone` characterization test — ĐÚNG

```30:47:apps/web/src/lib/data-store-reducer.test.ts
	test("check-in l3 (upcoming) increments s1 package math and leaves classes unchanged", () => {
		...
		expect(nextC1?.sessionsDone).toBe(c1?.sessionsDone);
		expect(next.classes).toEqual(before.classes);
```

Seed `c1.sessionsDone = 6` (`mock-data.ts:642`) độc lập với `s1.pkg.done = 8` (`:199`). `add-class` set `sessionsDone: 0` (`data-store-reducer.ts:211`) rồi không action nào tăng.

---

## 6. Stubs — ĐÚNG (8/8)

| Stub | Live | Cite |
|---|---|---|
| Tạo hóa đơn | submit chỉ `onClose()`, comment “no store mutation” | `add-invoice-modal.tsx:20-24` |
| Gửi báo cáo | submit/`Lưu nháp` chỉ `onClose()` | `create-report-modal.tsx:33-36,68-69` |
| Zalo | `window.open(https://zalo.me/...)`; template local; `sendLog` hardcode | `$studentId.tsx:107-108`; `settings.tsx:22-29`; `reports.tsx:28-58` |
| GCal | badge “GCal · Đã bật”, 0 API | `schedule.tsx:48-50` |
| Pro 99k | “99.000đ/tháng”; “Quản lý thanh toán” không `onClick` | `settings.tsx:95-115` |
| Enroll HV có sẵn | không action/picker. Chỉ `add-student` tạo person mới + optional `classId` | `add-student-modal.tsx:62,38-48`; Action `:21-30` |
| Tạo buổi lịch | không action tạo `Lesson`. `add-lesson` = **syllabus curriculum** | `add-lesson-modal.tsx:33-43`; Action `:69-78` |
| Tạo bài tập | không `add-assignment`; list không nút tạo; gửi/nháp không handler | `assignments/index.tsx` hết `:84`; `$assignmentId.tsx:121-124` |

Write path thật (không stub): check-in, cancel, mark-paid (`tuition.tsx:174`), grade scores (`grade-modal.tsx:42` — `feedback` bị bỏ), add-student/class/syllabus, assign, module/lesson giáo trình, class notes.

---

## 7. Settings local, không store — ĐÚNG

`settings.tsx` không import `useData`. Toàn `useState` (`:16-38`). 0 persist. Tab “Dữ liệu” tự nhận demo, nút xuất/xóa không handler (`:231-249`).

---

## 8. StatCard / “Cần xử lý” hardcoded — MỘT PHẦN

**Đúng trên dashboard (đúng chỗ advise nói):**

- “Cần xử lý”: mảng literal 5 dòng (`dashboard.tsx:86-114`).
- StatCard tuần: `"7.5"`, `"6.2tr"`, `"2.0tr"`, `"2"` (`dashboard.tsx:136-147`).
- Tuition KPI cũng hardcode: `"21.0tr"`, `"1.9tr"`, `"2"` (`tuition.tsx:40-50`). `PageHead` lead `"21.000.000đ"` (`:38`).

**Sai nếu đọc “mọi StatCard”:** class/syllabus derive từ store — `cls.studentIds.length`, `sessionsDone/sessionsTotal`, `%` (`$classId.tsx:97-106`); `sy.totalLessons`, `done`, `modules.length` (`$syllabusId.tsx:115-126`).

Bảng “Học viên rủi ro” trên dashboard *có* derive (`dashboard.tsx:20-25,154-166`).

---

## 9. `Action` union UI-only, không public API — ĐÚNG

13 variant (`data-store-reducer.ts:15-95`): check-in, cancel-lesson, mark-invoice-paid, grade-assignment, add-student, add-class, add-syllabus, assign-syllabus, add-module, edit-module, add-lesson, edit-lesson, update-class-notes.

Re-export cho UI: `data-store.tsx:21`. Consume chỉ `dispatch({ type })` trong modal/route. 0 `packages/api`. Server không parse Action.

Lock enroll: “This action is not a stable public API for a future D1 port.” (`plans/260816-1821-.../phase-02-...md:124`). Test header: “Client demo store. No authz.” (`data-store-reducer.test.ts:1-3`).

---

## 10. `DataProvider` / `data-store.tsx` bottleneck — SAI FILE, ĐÚNG HƯỚNG

Advise gọi `data-store.tsx` là điểm chồng. Live đã tách:

| File | LOC (xấp xỉ) | Việc |
|---|---|---|
| `data-store.tsx` | 65 | Context + 6 lookup. Mỏng. |
| `data-store-reducer.ts` | 335 | **Mọi mutation.** Collision thật. |
| `mock-data.ts` | ~1000+ | Types + `seedData`. Collision thật. |

Một `useReducer` vẫn sở hữu cả `MockData` (`data-store.tsx:38-53`). Peel song song đụng `reducer` switch + `MockData` types, không phải 65 dòng provider.

Advise đề xuất `repos/*.ts` vẫn hợp lý. Đừng lock “sửa `data-store.tsx` = xong tách”.

---

## 11. File ownership peel waves — ĐÚNG, CÓ OVERLAP

Cây live khớp bảng advise. Overlap (plan phải ghi, không để 2 wave sửa cùng lúc):

| Wave | Được sửa (live) | Overlap |
|---|---|---|
| 1 Students | `routes/_auth/students/*`, `add-student-modal.tsx` | Modal cũng mount ở `$classId.tsx:241`. `$studentId` có tab học phí/bài + `CreateReportModal` |
| 2 Syllabus | `routes/_auth/syllabus/*`, `add/edit-*-modal` (module/lesson), `syllabus-progress.tsx` | `add-lesson` ≠ lịch |
| 3 Classes | `routes/_auth/classes/*`, `add-class-modal.tsx`, `assign-syllabus-modal.tsx` | `$classId` gọi AddStudentModal + đọc `data.lessons` theo `sid` (`:57-58`) |
| 4 Schedule | `schedule.tsx`, `lesson-modal.tsx`, khối điểm danh `dashboard.tsx:50-82` | Dashboard còn StatCard/Cần xử lý (wave khác) |
| 5 Tuition | `tuition.tsx`, `add-invoice-modal.tsx` | Tab học phí trong `$studentId` |
| 6 Assignments | `assignments/*`, `grade-modal.tsx` | `$assignmentId` chứa comment bank (wave 7) |
| 7 Reports | `reports.tsx`, `create-report-modal.tsx`, `notif-panel.tsx` | comment bank append = local state `$assignmentId.tsx:57-59` — **không** ghi store |
| 8 Cleanup | `data-store-reducer.ts`, `seedData` runtime, banner `topbar.tsx:63-68` | Settings **không** thuộc wave 8 persist |
| Settings | `settings.tsx` | Local. Advise cấm persist — khớp |

Shared barrels (advise đúng): `mock-data.ts`, `data-store-reducer.ts`, `data-store.tsx`, `apps/server/src/index.ts`, `packages/db/src/schema/index.ts`.

---

## 12. Test commands + inventory — ĐÚNG

**Lệnh**

| Lệnh | Script | Cite |
|---|---|---|
| Root | `turbo run test && pnpm test:ci-workflow` | `package.json:19` |
| Web | `vitest run` | `apps/web/package.json:13` |
| Watch | `vitest` | `apps/web/package.json:14` |
| CI | `pnpm test` sau biome, trước check-types | `.github/workflows/ci.yml:31-33` |
| Enroll gate (historical) | `pnpm --filter web test` | enroll phase-02 `:128` |

Chỉ `web` có script `test`. `turbo.json:16-18` khai báo task `test`. Vitest `environment: "node"` (`apps/web/vitest.config.ts:7-8`).

**Inventory live**

| File | Số test | Nội dung |
|---|---|---|
| `apps/web/src/lib/data-store-reducer.test.ts` | 23 | check-in×4, mark-paid×3, grade×1, syllabus CRUD×6, cancel×1, add-student×4, add-class×1, notes×1, export fn×1 |
| `apps/web/src/lib/add-student-enroll.contract.test.ts` | 3 | class-detail `classId` + key; modal payload; students list omit |
| `scripts/ci-workflow.test.mjs` | 1 (`node:test`) | contract CI |

Tổng web Vitest = **26**. Report cũ “21/21” (`plans/reports/tester-2026-08-16-remap-...md:13`) = trước 4 case enroll + 1 contract file.

Không có component/e2e test. 0 test cho stub no-op (invoice/report/Zalo/GCal).

---

## Banner / seed

- Banner tĩnh, không nút “nạp demo” (`topbar.tsx:63-68`).
- `seedData` runtime chỉ `data-store.tsx:18,38`. Test clone seed (`data-store-reducer.test.ts:7-10`).
- Advise “tắt banner khi hết mock write” — banner hiện cover **mọi** thay đổi, kể cả write path thật (check-in, add-student). Đúng vì reload mất hết.

---

## Ranked implication cho plan (không implement)

1. **Giữ** 7 invariant advise. Live khớp: `pkg.done` counter; `sessionsDone` không tăng; Lesson không `classId`; roster = array id; không org trên mock.
2. **Sửa wording bottleneck:** tách `data-store-reducer.ts` + `MockData` types trước, không coi `data-store.tsx` là file béo.
3. **Ghi overlap ownership** (AddStudentModal, `$studentId` tabs, comment bank trên assignment detail) trước khi song song wave.
4. **StatCard:** chỉ lock “dashboard + tuition KPI + Cần xử lý hardcode = non-goal”. Đừng cấm derive trên class/syllabus.
5. **Stub list advise đủ.** Thêm 2 no-op cùng họ: gửi/nháp assignment (`$assignmentId.tsx:121-124`), feedback grade bị drop (`grade-modal.tsx:42-45`).

Adoption risk: mock layer chín (26 test khóa hành vi hiện tại, kể cả “hole” check-in cancelled `l9`). Đổi invariant mà không thay test = đỏ ngay. Community/maturity N/A — in-house reducer.

Architectural fit: Hono+D1+Drizzle+Better-Auth đã có cho auth. Domain chưa có bảng/API. Persist nguyên `MockData`/`Action` trái test + shape student-centric.

---

## Limitations

- Không chạy `pnpm test` (read-only; inventory từ source).
- Không so visual fidelity 13 màn vs HTML (ngoài scope domain).
- Không audit backend auth schema sâu hơn 4 bảng.
- Không đọc toàn bộ `teacher-os.html` script tương tác — 13 view id + convert plan đủ khóa số màn.

## Unresolved

Không. Ba chỗ advise dễ hiểu nhầm đã khóa bằng source (StatCard, bottleneck file, auth≠domain).

Status: DONE_WITH_CONCERNS
Summary: 9/12 claim advise khớp live; check-in đúng là counter trên `Student.pkg`; 13 màn + 13 Action + 26 Vitest + stub list đúng. Concerns: bottleneck thật là reducer/types không phải `data-store.tsx`; StatCard class/syllabus đã derive.
Concerns/Blockers: Plan lock ownership phải kể overlap AddStudentModal / `$studentId` tabs / comment bank. Đừng persist `pkg.done` hay `sessionsDone`.
