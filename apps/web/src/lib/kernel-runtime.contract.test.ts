/**
 * Kernel runtime contract — locks the Wave 0 wiring without rendering React.
 * Mirrors the source-parse style of enroll-student.contract.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
	return readFileSync(join(here, rel), "utf8");
}

const KERNEL_WRITE_MODALS = [
	"enroll-student-modal.tsx",
	"add-class-modal.tsx",
	"add-syllabus-modal.tsx",
	"import-syllabus-modal.tsx",
	"add-module-modal.tsx",
	"edit-module-modal.tsx",
	"add-lesson-modal.tsx",
	"edit-lesson-modal.tsx",
	"grade-modal.tsx",
	"add-invoice-modal.tsx",
] as const;

describe("kernel-backed store wiring", () => {
	test("data-store.tsx stays a shim re-exporting from data-provider", () => {
		const src = readSrc("data-store.tsx");
		expect(src).toMatch(
			/export \{ DataProvider, useData \} from "\.\/data-provider"/,
		);
		expect(src).not.toMatch(/useReducer/);
		expect(src).not.toMatch(/seedData/);
	});

	test("data-provider never mounts seedData and gates children on the kernel query", () => {
		const src = readSrc("data-provider.tsx");
		expect(src).not.toMatch(/seedData/);
		expect(src).toMatch(/emptyKernelData/);
		expect(src).not.toMatch(/localDispatch|data-store-reducer/);
		// The manual load machine is gone: the provider subscribes to the
		// shared ['kernel'] query — one query key for every GET.
		expect(src).toMatch(/useQuery\(kernelQueryOptions\(/);
		expect(src).not.toMatch(/useState<LoadState>|beginLoad|shouldSettle/);
		// Children render only from a settled snapshot.
		expect(src).not.toMatch(/kernelLoaded/);
		expect(src).toMatch(/if \(isPending \|\| !snapshot\)/);
		// A failed FIRST load renders the blocking error screen — never an
		// empty workspace. Mid-session refresh failures keep children mounted.
		expect(src).toMatch(/<KernelLoadError/);
		expect(src).toMatch(/classifyLoadError/);
		expect(src).toMatch(/if \(isError && !snapshot\)/);
		// 401 re-auth is a module fn (single-flight) shared by the read and
		// write paths — the provider imports it, never re-defines it.
		expect(src).toMatch(/import \{ reauth \} from "\.\/reauth"/);
		expect(src).not.toMatch(/const reauth = useCallback/);
		// The command bus routes mid-session 401s into the same re-auth path.
		expect(src).toMatch(/onAuthLost: reauth/);
	});

	test("lib/reauth.ts owns the single-flight re-auth: sign-out + validated return URL redirect", () => {
		const src = readSrc("reauth.ts");
		// 401 re-auth: best-effort sign-out + validated return URL redirect.
		expect(src).toMatch(/authClient\.signOut/);
		expect(src).toMatch(/validateReturnUrl/);
		// Single-flight guard: concurrent read/write 401s redirect exactly once.
		expect(src).toMatch(/if \(started\) return/);
	});

	test("kernel writes POST with cookies included and type HTTP failures", () => {
		const src = readSrc("repos/kernel.ts");
		expect(src).toMatch(/credentials: "include"/);
		// Typed HTTP failures come from kernel-load-state (phase-4) — the
		// status drives the definite/unknown classification (phase-5).
		expect(src).toMatch(/isHttpError/);
		expect(src).toMatch(/new HttpError\(res\.status/);
		expect(src).toMatch(/onAuthLost\(\): void/);
	});

	test("provider exposes the discriminated result and a serialized refresh", () => {
		const src = readSrc("data-provider.tsx");
		expect(src).toMatch(
			/dispatch\(action: KernelAction\): Promise<KernelCommandResult>/,
		);
		expect(src).toMatch(/refresh\(\): Promise<boolean>/);
		// Outcome surfacing is caller-owned — the provider keeps no write toasts.
		expect(src).not.toMatch(/toast\.error\(\s*kind === "write"/);
		expect(src).not.toMatch(/Không lưu được/);
	});

	test("form modals close and reset only on the refreshed result", () => {
		for (const file of KERNEL_WRITE_MODALS) {
			const src = readSrc(`../components/modals/${file}`);
			// grade-modal hand-rolls the two-step sequence against the same contract
			if (file === "grade-modal.tsx") {
				expect(src, file).toMatch(/graded\.kind === "definite-failure"/);
				expect(src, file).toMatch(/graded\.kind !== "refreshed"/);
				expect(src, file).toMatch(
					/onClose={saving \? \(\) => undefined : onClose}/,
				);
				continue;
			}
			expect(src, file).toMatch(/async function submit/);
			expect(src, file).toMatch(/const result = await run\(/);
			expect(src, file).toMatch(/result\?\.kind === "refreshed"/);
			// No unconditional close after the await — failure keeps the modal.
			expect(src, file).not.toMatch(
				/finally \{\s*setSaving\(false\);\s*\}\s*onClose\(\)/,
			);
			// A mid-save close would leave the pending outcome with no surface.
			expect(src, file).toMatch(
				/onClose={saving \? \(\) => undefined : onClose}/,
			);
		}
	});

	test("form modals surface committed/unknown with a reconcile affordance", () => {
		for (const file of KERNEL_WRITE_MODALS) {
			const src = readSrc(`../components/modals/${file}`);
			expect(src, file).toMatch(/KernelSubmitNotice/);
			expect(src, file).toMatch(/onReconcile=/);
			// A committed/unknown notice blocks the submit path: the write may
			// already be saved, so a blind replay could duplicate a create.
			if (file === "grade-modal.tsx") {
				expect(src, file).toMatch(
					/if \(saving \|\| notice !== undefined\) return/,
				);
				expect(src, file).toMatch(
					/disabled=\{saving \|\| notice !== undefined\}/,
				);
			} else {
				expect(src, file).toMatch(/disabled=\{saving \|\| submitBlocked/);
			}
		}
	});

	test("add-class start date is a future-only native date input", () => {
		const src = readSrc("../components/modals/add-class-modal.tsx");
		expect(src).toMatch(/type="date"/);
		expect(src).toMatch(/min=\{minimumStartDate\}/);
		expect(src).toMatch(/<form noValidate onSubmit=\{submit\}>/);
		expect(src).toMatch(/useState\(getTomorrowDateInputValue\)/);
		expect(src).toMatch(/setStartDate\(\(current\) =>/);
		expect(src).toMatch(/isFutureDateInputValue\(startDate\)/);
	});

	test("add-class modal wires templateId to kernel command and resets it on submit", () => {
		const src = readSrc("../components/modals/add-class-modal.tsx");
		expect(src).toMatch(/<Field label="Template giáo trình">/);
		expect(src).toMatch(/templateId,\s*schedule:/);
		expect(src).toMatch(/setTemplateId\(""\)/);
	});

	test("add-class syllabus-derived fields render view-only while a template is selected", () => {
		const src = readSrc("../components/modals/add-class-modal.tsx");
		expect(src).toMatch(/disabled=\{skillsLocked\}/);
		expect(src).toMatch(/disabled=\{sessionsLocked\}/);
	});

	test("add-syllabus navigates only on the refreshed result with the server id", () => {
		const src = readSrc("../components/modals/add-syllabus-modal.tsx");
		expect(src).toMatch(/result\?\.kind === "refreshed"/);
		expect(src).toMatch(
			/if \(result\.id && onCreated\) onCreated\(result\.id\)/,
		);
		expect(src).not.toMatch(/onCreated\(id\)/);
		// A committed id without the snapshot would navigate into a 404.
		expect(src).toMatch(/refreshed result — a committed/);
	});

	test("add-syllabus keeps form state across close: no reset-on-open effect and unconditional route mount", () => {
		// Đóng (Hủy/Esc/overlay) phải GIỮ dữ liệu — ngược chủ đích với
		// AddInvoiceModal (reset-on-open). Modal luôn mounted; state sống ở
		// AddSyllabusModal, không phải trong Modal (Modal return null khi đóng).
		const modal = readSrc("../components/modals/add-syllabus-modal.tsx");
		// Pin phủ cả biến thể thiếu dấu ";": effect phụ thuộc [open] là chỗ
		// reset-on-open trú ngụ (focus management của Modal nằm ở ui/modal.tsx,
		// không phải ở đây).
		expect(modal).not.toMatch(/\}, \[open\]\)/);
		const route = readSrc("../routes/_auth/syllabus/index.tsx");
		expect(route).toMatch(/<AddSyllabusModal/);
		expect(route).not.toMatch(/modalOpen &&\s*<AddSyllabusModal/);
		expect(route).not.toMatch(/open &&\s*<AddSyllabusModal/);
	});

	test("dashboard reads today and at-risk from kernel helpers, not hardcoded KPIs", () => {
		const dashboard = readSrc("../routes/_auth/dashboard.tsx");
		expect(dashboard).toMatch(/from "@\/lib\/dashboard-from-kernel"/);
		expect(dashboard).toMatch(/lessonsToday\(/);
		expect(dashboard).toMatch(/atRiskRows\(/);
		// #278: dashboard cards chỉ còn tên lớp + meta buổi học — check-in
		// trực tiếp không còn là surface của dashboard (vẫn pin ở class
		// detail + lesson modal của /schedule bên dưới).
		expect(dashboard).not.toMatch(/useDirectKernelAction/);
		expect(dashboard).not.toMatch(/cô Lan/);
		expect(dashboard).not.toMatch(/Thứ Ba, 19\/08/);
		expect(dashboard).not.toMatch(/19–25\/08/);
		expect(dashboard).not.toMatch(/Tuần này/);
		expect(dashboard).not.toMatch(/7\.5/);
		expect(dashboard).not.toMatch(/6\.2tr/);
		expect(dashboard).not.toMatch(/2\.0tr/);
		expect(dashboard).not.toMatch(/Quốc Bảo/);
		expect(dashboard).not.toMatch(/Minh Anh/);
		expect(dashboard).not.toMatch(/INV-084/);
		expect(dashboard).not.toMatch(/l\.day === 2/);
		expect(dashboard).not.toMatch(/s\.atRisk/);
		expect(dashboard).not.toMatch(/nợ học phí/);
		expect(dashboard).not.toMatch(/fmtK/);
		expect(dashboard).not.toMatch(/data\.invoices/);
	});

	test("schedule flow shows a real week grid — URL-driven nav, computed dates, no fake chrome", () => {
		// #56 landed real week nav: the grid is URL-driven (?week= via
		// validateSearch + useSearch + resolveWeek) and every date label is
		// computed by week-grid. The remaining negative locks below guard the
		// fakes #58 removed — GCal stays a non-goal until the roadmap says
		// otherwise, and hardcoded dates must never come back.
		const schedule = readSrc("../routes/_auth/schedule.tsx");
		expect(schedule).not.toMatch(/GCal/);
		expect(schedule).not.toMatch(/todayIdx/);
		expect(schedule).not.toMatch(/dayDates/);
		expect(schedule).not.toMatch(/19–25\/08/);
		expect(schedule).not.toMatch(/11 buổi học/);
		// Real week wiring: param read hop + composition + nav controls + a
		// real (computed) today highlight.
		expect(schedule).toMatch(/validateSearch/);
		expect(schedule).toMatch(/useSearch/);
		expect(schedule).toMatch(/resolveWeek/);
		expect(schedule).toMatch(/from "@\/lib\/week-grid"/);
		expect(schedule).toMatch(/todayISOVietnam|isCurrentWeek/);
		expect(schedule).toMatch(/Tuần trước/);
		expect(schedule).toMatch(/Tuần sau/);

		const lessonModal = readSrc("../components/schedule/lesson-modal.tsx");
		expect(lessonModal).not.toMatch(/dayDates/);
		expect(lessonModal).not.toMatch(/\/08/);
		// The modal shows the clicked cell's real date via week-grid, never a
		// fabricated string concat.
		expect(lessonModal).toMatch(/dateIso/);
		expect(lessonModal).toMatch(/formatDayMonth/);

		const classDetail = readSrc("../routes/_auth/classes/$classId.tsx");
		expect(classDetail).not.toMatch(/dayDates/);

		const mockData = readSrc("mock-data.ts");
		expect(mockData).not.toMatch(/dayDates/);
	});

	test("lesson edit form echoes all five fields and closes only on a refreshed result", () => {
		const lessonModal = readSrc("../components/schedule/lesson-modal.tsx");
		// Edit entry point only for upcoming lessons; the form is a child.
		expect(lessonModal).toMatch(/Sửa buổi/);
		expect(lessonModal).toMatch(/LessonEditForm/);
		// The modal stays mounted across lessons — without a reset effect,
		// editing lesson A would leak the form state into lesson B (same trap
		// as the grade-modal reset pinned above).
		expect(lessonModal).toMatch(/useEffect\(/);
		expect(lessonModal).toMatch(/setEditing\(false\)/);
		// Unlike the idempotent check-in/cancel (void run + close), the edit
		// submit goes through the shared form-submit hook (awaits the outcome,
		// keeps typed input on failure) and only closes on "refreshed".
		expect(lessonModal).toMatch(/useKernelFormSubmit/);
		expect(lessonModal).toMatch(/"refreshed"/);

		const editForm = readSrc("../components/schedule/lesson-edit-form.tsx");
		// Client validation reuses the contract schema (DRY — no second
		// regex); DOM strings are coerced with Number() before safeParse.
		expect(editForm).toMatch(/lessonEditSchema/);
		expect(editForm).toMatch(/dayNames/);
		expect(editForm).toMatch(/Number\(/);
		// No fabricated date strings — same anti-fake-date lock as the modal.
		expect(editForm).not.toMatch(/\/08/);

		const dataActions = readSrc("data-actions.ts");
		// "lesson-edit" is the class-lesson action; "edit-lesson" belongs to
		// the syllabus lesson and must stay untouched (name-collision pin).
		expect(dataActions).toMatch(/"lesson-edit"/);
	});

	test("direct actions await the outcome, disable while pending and report visibly", () => {
		const tuition = readSrc("../routes/_auth/tuition.tsx");
		expect(tuition).toMatch(/useDirectKernelAction\(\)/);
		expect(tuition).toMatch(/void run\(/);
		expect(tuition).toMatch(/disabled=\{busy \|\| isPending\(i\.id\)\}/);

		const classDetail = readSrc("../routes/_auth/classes/$classId.tsx");
		expect(classDetail).toMatch(/useDirectKernelAction\(\)/);
		expect(classDetail).toMatch(/void run\(/);
		expect(classDetail).toMatch(
			/disabled=\{busy \|\| isPending\("class-notes"\)\}/,
		);

		const lessonModal = readSrc("../components/schedule/lesson-modal.tsx");
		expect(lessonModal).toMatch(/useDirectKernelAction\(\)/);
		expect(lessonModal).toMatch(
			/disabled=\{busy \|\| isPending\(lesson\.id\)\}/,
		);

		// Issue #91: the schedule table + roster modal receive the route's
		// single hook instance as props — a second useDirectKernelAction would
		// let notes and attendance POST in parallel.
		const scheduleTable = readSrc(
			"../components/class-detail/class-schedule-table.tsx",
		);
		expect(scheduleTable).toMatch(/void run\(/);
		expect(scheduleTable).toMatch(/disabled=\{busy \|\| isPending\(/);
		expect(scheduleTable).not.toMatch(/useDirectKernelAction/);
		// Check-in posts the sequential-head enrollment lesson id only —
		// never iterates the slot bag in JSX.
		expect(scheduleTable).not.toMatch(/session\.rows/);
		expect(scheduleTable).toMatch(/lessonId: checkInId/);

		const attendanceModal = readSrc(
			"../components/class-detail/session-attendance-modal.tsx",
		);
		expect(attendanceModal).toMatch(/void run\(/);
		expect(attendanceModal).toMatch(/disabled=\{busy \|\| isPending\(/);
		expect(attendanceModal).not.toMatch(/useDirectKernelAction/);
		expect(attendanceModal).not.toMatch(/session\.rows/);
		expect(attendanceModal).toMatch(
			/type: "check-in", lessonId: enrollmentLessonId/,
		);

		const syllabusDetail = readSrc("../routes/_auth/syllabus/$syllabusId.tsx");
		expect(syllabusDetail).toMatch(/useDirectKernelAction\(\)/);
		expect(syllabusDetail).toMatch(/disabled=\{busy\}/);

		const curriculum = readSrc(
			"../components/class-detail/curriculum-management-section.tsx",
		);
		expect(curriculum).toMatch(/disabled=\{busy\}/);
		expect(curriculum).not.toMatch(/useDirectKernelAction/);

		const mutations = readSrc("../components/syllabus/syllabus-mutations.tsx");
		expect(mutations).not.toMatch(/useDirectKernelAction/);
	});

	test("#98 occurrence modal threads route callbacks (no direct dispatch) and keys by dateISO", () => {
		const table = readSrc(
			"../components/class-detail/class-schedule-table.tsx",
		);
		expect(table).toMatch(/setActionsDateISO\(s\.dateISO\)/);
		expect(table).not.toMatch(/actionsIndex/);
		expect(table).toMatch(/sessionRowTargets\(s\)\.length > 0/);
		// Entry label must not collide with the #91 attendance CTA.
		expect(table).toMatch(/Điều chỉnh/);
		expect(table).not.toMatch(/Điều chỉnh\s*\? "Điểm danh"/);

		const modal = readSrc(
			"../components/class-detail/session-actions-modal.tsx",
		);
		// Docblock prose may MENTION the banned APIs; code must not touch them.
		expect(modal).not.toMatch(/use-direct-kernel-action|[^a-zA-Z]dispatch\(/);
		expect(modal).toMatch(/onComplete: \(dateISO: string\) =>/);
		expect(modal).toMatch(/sessionIsEligibleDate/); // date-gated Hoàn thành
		expect(modal).toMatch(/role="alertdialog"/); // 2-step confirm block

		const route = readSrc("../routes/_auth/classes/$classId.tsx");
		expect(route).toMatch(/type: "session-check-in", classId, date: dateISO/);
		expect(route).toMatch(/type: "session-cancel", classId, date: dateISO/);
		expect(route).toMatch(/type: "session-edit", classId, date: dateISO/);
		expect(route).toMatch(/occurrenceSummary\(/);

		const repoSrc = readSrc("./repos/kernel.ts");
		expect(repoSrc).toMatch(
			/\/api\/classes\/\$\{action.classId\}\/sessions\/\$\{action.date\}\/(edit|check-in|cancel)/,
		);

		const outcome = readSrc("./kernel-outcome.ts");
		expect(outcome).toMatch(/case "use-occurrence-endpoint":/);
		expect(outcome).toMatch(/case "date-occupied":/);
	});

	test("outcome toasts distinguish refreshed/committed/definite/unknown and reconcile after unknown", () => {
		const src = readSrc("kernel-outcome.ts");
		expect(src).toMatch(/case "refreshed":/);
		expect(src).toMatch(/case "committed":/);
		expect(src).toMatch(/case "definite-failure":/);
		expect(src).toMatch(/case "outcome-unknown":/);
		expect(src).toMatch(/if \(await refresh\(\)\)/);
		// 409 is the server's duplicate-guard — it heals the stale store
		// instead of reporting a false write failure.
		expect(src).toMatch(/result\.status === 409/);
		expect(src).toMatch(/heal-409/);
		// Behavioral coverage lives in kernel-outcome.test.ts (node-env unit).
	});

	test("AddInvoiceModal creates invoices through the kernel bus (#61)", () => {
		const src = readSrc("../components/modals/add-invoice-modal.tsx");
		// The create rides the command bus like every other write modal —
		// never a bare fetch from the component.
		expect(src).toMatch(/useKernelFormSubmit\(\)/);
		expect(src).toMatch(/type: "add-invoice"/);
		expect(src).not.toMatch(/fetch\(/);
		// Re-opening must start a fresh form session: field values, field
		// errors, and any committed/unknown notice from the previous session.
		expect(src).toMatch(/useEffect\(\(\) => \{/);
		expect(src).toMatch(/if \(open\) \{/);
		expect(src).toMatch(/\}, \[open\]\);/);
		expect(src).toMatch(/resetFields\(\)/);
		expect(src).toMatch(/\breset\(\)/);
		// A committed/unknown outcome must reconcile-and-finish (close), not
		// leave the modal open for a blind replay against a non-idempotent POST.
		expect(src).toMatch(/async function reconcileAndFinish/);
		expect(src).toMatch(/onReconcile=\{reconcileAndFinish\}/);
	});

	test("CreateReportModal persists via the kernel bus across both callers (#173)", () => {
		const modal = readSrc("../components/modals/create-report-modal.tsx");
		const submit = modal.slice(
			modal.indexOf("async function save"),
			modal.indexOf("function submit"),
		);
		// #173 replaced the close-only submit with a real kernel write: the
		// bus (dispatch) is mandatory, direct fetch/POST stays forbidden.
		expect(submit).toMatch(/dispatch\(\{/);
		expect(submit).toMatch(/type: "create-report"/);
		expect(submit).not.toMatch(/fetch\(|axios|XMLHttpRequest/);
		// A lost acknowledgement keeps the modal open instead of blind-retrying.
		expect(submit).toMatch(/outcome-unknown/);
		expect(modal).toMatch(/Lưu nháp/);
		expect(modal).toMatch(/Gửi báo cáo/);

		for (const caller of [
			"../routes/_auth/reports.tsx",
			"../routes/_auth/students/$studentId.tsx",
		]) {
			expect(readSrc(caller), caller).toMatch(/<CreateReportModal/);
		}
	});

	test("reports route and create-report-modal contain 0 mock data, names, or fake dates (#107)", () => {
		const reports = readSrc("../routes/_auth/reports.tsx");
		expect(reports).not.toMatch(/Minh Anh/);
		expect(reports).not.toMatch(/Quốc Bảo/);
		expect(reports).not.toMatch(/18\/08/);
		expect(reports).not.toMatch(/17\/08/);
		expect(reports).not.toMatch(/4 báo cáo tuần này/);
		expect(reports).not.toMatch(/Task 2 University/);
		expect(reports).toMatch(/Chưa có báo cáo nào được gửi/);
		expect(reports).toMatch(/Chưa có nhật ký gửi tin nhắn/);

		const modal = readSrc("../components/modals/create-report-modal.tsx");
		expect(modal).not.toMatch(/DEFAULT_CONTENT/);
		expect(modal).not.toMatch(/19–25\/08/);
		expect(modal).not.toMatch(/Task 2 Opinion Essay/);
		expect(modal).not.toMatch(/Bar chart/);
		expect(modal).not.toMatch(/Band gần nhất/);
	});

	test("list pages derive KPI counters dynamically from kernel store (#106)", () => {
		const classes = readSrc("../routes/_auth/classes/index.tsx");
		expect(classes).not.toMatch(/3 lớp đang hoạt động/);
		expect(classes).toMatch(/classes\.filter/);
		expect(classes).toMatch(/\$\{activeCount\} lớp đang hoạt động/);

		const students = readSrc("../routes/_auth/students/index.tsx");
		expect(students).not.toMatch(/5 học viên đang học/);
		expect(students).not.toMatch(/2 cần chú ý/);
		expect(students).toMatch(/from "@\/lib\/data-store"/);
		expect(students).toMatch(/\$\{students\.length\} học viên đang học/);
		expect(students).toMatch(/\$\{attentionCount\} cần chú ý/);

		const assignments = readSrc("../routes/_auth/assignments/index.tsx");
		expect(assignments).not.toMatch(/6 bài tập/);
		expect(assignments).not.toMatch(/3 cần xử lý/);
		expect(assignments).toMatch(/data\.assignmentPrompts/);
		expect(assignments).toMatch(/\{filteredPrompts\.length\}/);
	});

	test("tuition debt KPI renders neutral for 0đ and list pages have localized filter chips (#170)", () => {
		const tuition = readSrc("../routes/_auth/tuition.tsx");
		expect(tuition).not.toMatch(
			/label="Còn nợ \(VND\)"\s+className="\[&>div:first-child\]:text-danger"/,
		);
		expect(tuition).toMatch(
			/outstanding > 0 \? "\[&>div:first-child\]:text-danger" : undefined/,
		);

		const students = readSrc("../routes/_auth/students/index.tsx");
		expect(students).toMatch(
			/const FILTERS = \["Tất cả", "Sắp hết buổi", "Nợ học phí", "Viết", "Nói"\]/,
		);
		expect(students).not.toMatch(/"Writing", "Speaking"/);

		const classes = readSrc("../routes/_auth/classes/index.tsx");
		expect(classes).toMatch(
			/const FILTERS = \["Tất cả", "Trực tuyến", "Trực tiếp", "Đang học"\]/,
		);
		expect(classes).not.toMatch(/"Online", "Offline"/);
		expect(classes).toMatch(/"Giáo trình"/);

		const syllabus = readSrc("../routes/_auth/syllabus/index.tsx");
		expect(syllabus).toMatch(
			/const FILTERS = \["Tất cả", "Viết", "Nói", "Đọc", "Nghe"\]/,
		);
		expect(syllabus).toMatch(/title="Giáo trình"/);
	});

	test("persisted comments use server identity and notifications expose no mark-read write", () => {
		const assignment = readSrc("../routes/_auth/assignments/$assignmentId.tsx");
		expect(assignment).toMatch(/key=\{c\.id\}/);
		const topbar = readSrc("../components/layout/topbar.tsx");
		expect(topbar).toMatch(/<NotifPanel notifs=\{data\.notifs\}/);
		expect(topbar).not.toMatch(/mark.*read|dispatch\(.*notif/is);
	});

	test("create-report-modal persists through the kernel bus (#173)", () => {
		const src = readSrc("../components/modals/create-report-modal.tsx");
		// The modal must dispatch a real kernel action — a submit that only
		// closes is exactly the #173 bug.
		expect(src).toMatch(/type: "create-report"/);
		expect(src).toMatch(/await dispatch\(/);
		// A definite failure keeps the modal open so typed content isn't lost.
		expect(src).toMatch(/definite-failure/);
		// Both buttons persist: draft and send ride the same action.
		expect(src).toMatch(/save\("draft"\)/);
		expect(src).toMatch(/save\("sent"\)/);
	});

	test("grade-modal preserves grade/comment ordering and partial-success retry", () => {
		const src = readSrc("../components/modals/grade-modal.tsx");
		// Each step reacts to its own discriminated result — definite failure
		// keeps the modal open so typed scores are not lost.
		expect(src).toMatch(/graded\.kind === "definite-failure"/);
		expect(src).toMatch(/setError\("Không lưu được điểm/);
		expect(src).toMatch(/type: "add-comment-bank"/);
		expect(src).toMatch(/operationId: commentOperationId/);
		expect(src).toMatch(/disabled=\{inputsDisabled\}/);
		expect(src).toMatch(/gradeSaved/);
		expect(src).toMatch(/Điểm đã lưu.*nhận xét chưa lưu/);
		expect(src).toMatch(/disabled=\{saving\}/);
	});

	test("grade-modal keeps the comment operationId stable across outcome-unknown replay", () => {
		const src = readSrc("../components/modals/grade-modal.tsx");
		// Unknown outcome parks the operationId so a replay (or a reopen)
		// dedupes server-side instead of duplicating the comment…
		expect(src).toMatch(
			/unresolvedCommentOps\.set\(assignmentId, commentOperationId\)/,
		);
		expect(src).toMatch(
			/unresolvedCommentOps\.get\(assignmentId\) \?\? crypto\.randomUUID\(\)/,
		);
		// …while a definite failure regenerates it so edited text cannot 409.
		expect(src).toMatch(
			/unresolvedCommentOps\.delete\(assignmentId\);\s*\n\s*setCommentOperationId\(crypto\.randomUUID\(\)\)/,
		);
	});

	test("grade-modal resets scores and error on every open", () => {
		const src = readSrc("../components/modals/grade-modal.tsx");
		// The modal stays mounted across assignments; without this reset,
		// grading B would silently submit A's persisted scores.
		expect(src).toMatch(/useEffect\(\(\) => \{/);
		expect(src).toMatch(/if \(!open\) return;/);
		expect(src).toMatch(/\}, \[open, assignmentId\]\);/);
	});

	test("lesson kind payload rides showKind only — màn hình lớp không bao giờ gửi key kind (#154)", () => {
		for (const file of [
			"add-lesson-modal.tsx",
			"edit-lesson-modal.tsx",
		] as const) {
			const src = readSrc(`../components/modals/${file}`);
			// Spread có điều kiện đúng pattern status: không showKind → key
			// `kind` phải VẮNG KHỎI payload (server + reducer preserve).
			expect(src, file).toMatch(/\.\.\.\(showKind \? \{ kind \} : \{\}\)/);
			// Chặn biến thể `kind: showKind ? … : "lesson"` — luôn gửi key sẽ
			// ghi đè kind của buổi thi khi sửa từ màn hình lớp (red-team #6).
			expect(src, file).not.toMatch(/kind:\s*showKind/);
			// Select chỉ render khi showKind — mirror showStatus.
			expect(src, file).toMatch(/\{showKind && \(/);
		}

		// Màn hình syllabus bật showKind cho cả 2 modal (slice JSX từng tag —
		// regex [^>]* gãy ở arrow fn trong props).
		const syllabusDetail = readSrc("../routes/_auth/syllabus/$syllabusId.tsx");
		const jsxOf = (tag: string) => {
			const start = syllabusDetail.indexOf(`<${tag}`);
			return syllabusDetail.slice(
				start,
				syllabusDetail.indexOf("/>", start) + 2,
			);
		};
		expect(jsxOf("AddLessonModal")).toContain("showKind");
		expect(jsxOf("EditLessonModal")).toContain("showKind");

		// Màn hình Chi tiết lớp KHÔNG truyền showKind (không đổi hành vi —
		// success criterion "màn hình lớp không đổi").
		const curriculum = readSrc(
			"../components/class-detail/curriculum-management-section.tsx",
		);
		expect(curriculum).not.toMatch(/showKind/);
	});
});

describe("first-load fail-safe wiring", () => {
	test("login route passes the raw returnUrl through validateSearch", () => {
		const src = readSrc("../routes/login.tsx");
		expect(src).toMatch(/validateSearch/);
		expect(src).toMatch(/typeof search\.returnUrl === "string"/);
	});

	test("all three login flows consume the validated return URL", () => {
		for (const file of [
			"../components/sign-in-form.tsx",
			"../components/sign-up-form.tsx",
			"../components/google-oauth-button.tsx",
		]) {
			const src = readSrc(file);
			// Reverting validateReturnUrl(returnUrl) back to the raw param (or
			// to a hardcoded /dashboard) must fail this lock — that is the
			// open-redirect regression guard.
			expect(src, file).toMatch(/useSearch\(\{ from: "\/login" \}\)/);
			expect(src, file).toMatch(/validateReturnUrl\(returnUrl\)/);
		}
	});

	test("the _auth guard carries the current location as returnUrl", () => {
		const src = readSrc("../routes/_auth/route.tsx");
		expect(src).toMatch(/returnUrl: location\.href/);
		// `location.search` is a parsed object in TanStack Router — templating
		// it would serialize to "[object Object]" and break the return URL.
		expect(src).not.toMatch(/location\.search/);
	});

	test("kernel load error screen is accessible and offers retry only when retryable", () => {
		const src = readSrc("../components/kernel-load-error.tsx");
		expect(src).toMatch(/role="alert"/);
		expect(src).toMatch(/failure\.kind === "retryable"/);
		expect(src).toMatch(/FATAL_HINT/);
	});
});

describe("runtime state boundary", () => {
	test("empty state is runtime-owned and contains every kernel collection", async () => {
		const { emptyKernelData } = await import("./kernel-state");
		expect(Object.keys(emptyKernelData).sort()).toEqual([
			"assignmentPrompts",
			"assignmentTests",
			"assignments",
			"classAssignments",
			"classes",
			"commentBank",
			"enrollments",
			"invoices",
			"lessons",
			"notifs",
			"reports",
			"students",
			"syllabi",
		]);
		expect(Object.values(emptyKernelData).every(Array.isArray)).toBe(true);
	});
});
