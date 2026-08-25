/**
 * Kernel runtime contract — locks the Wave 0 wiring without rendering React.
 * Mirrors the source-parse style of add-student-enroll.contract.test.ts.
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
	"add-student-modal.tsx",
	"add-class-modal.tsx",
	"add-syllabus-modal.tsx",
	"import-syllabus-modal.tsx",
	"add-module-modal.tsx",
	"edit-module-modal.tsx",
	"add-lesson-modal.tsx",
	"edit-lesson-modal.tsx",
	"grade-modal.tsx",
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

	test("dashboard reads today and at-risk from kernel helpers, not hardcoded KPIs", () => {
		const dashboard = readSrc("../routes/_auth/dashboard.tsx");
		expect(dashboard).toMatch(/from "@\/lib\/dashboard-from-kernel"/);
		expect(dashboard).toMatch(/lessonsToday\(/);
		expect(dashboard).toMatch(/atRiskRows\(/);
		expect(dashboard).toMatch(/useDirectKernelAction\(\)/);
		expect(dashboard).toMatch(/void run\(/);
		expect(dashboard).toMatch(/disabled=\{busy \|\| isPending\(l\.id\)\}/);
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
		const dashboard = readSrc("../routes/_auth/dashboard.tsx");
		expect(dashboard).toMatch(/useDirectKernelAction\(\)/);
		expect(dashboard).toMatch(/void run\(/);
		expect(dashboard).toMatch(/disabled=\{busy \|\| isPending\(l\.id\)\}/);

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

	test("AddInvoiceModal remains close-only and exposes no create write", () => {
		const src = readSrc("../components/modals/add-invoice-modal.tsx");
		const submit = src.slice(
			src.indexOf("function submit"),
			src.indexOf("return ("),
		);
		expect(submit).toMatch(/e\.preventDefault\(\)/);
		expect(submit).toMatch(/onClose\(\)/);
		expect(submit).not.toMatch(/dispatch|fetch|post|invoiceId/);
	});

	test("CreateReportModal keeps Save Draft and Send close-only across both callers", () => {
		const modal = readSrc("../components/modals/create-report-modal.tsx");
		const submit = modal.slice(
			modal.indexOf("function submit"),
			modal.indexOf("return ("),
		);
		expect(submit).toMatch(/e\.preventDefault\(\)/);
		expect(submit).toMatch(/onClose\(\)/);
		expect(submit).not.toMatch(/dispatch|fetch|POST|reportId/);
		expect(modal).toMatch(/Lưu nháp/);
		expect(modal).toMatch(/Gửi báo cáo/);

		for (const caller of [
			"../routes/_auth/reports.tsx",
			"../routes/_auth/students/$studentId.tsx",
		]) {
			expect(readSrc(caller), caller).toMatch(/<CreateReportModal/);
		}
	});

	test("persisted comments use server identity and notifications expose no mark-read write", () => {
		const assignment = readSrc("../routes/_auth/assignments/$assignmentId.tsx");
		expect(assignment).toMatch(/key=\{c\.id\}/);
		const topbar = readSrc("../components/layout/topbar.tsx");
		expect(topbar).toMatch(/<NotifPanel notifs=\{data\.notifs\}/);
		expect(topbar).not.toMatch(/mark.*read|dispatch\(.*notif/is);
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
			"assignments",
			"classes",
			"commentBank",
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
