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
	"assign-syllabus-modal.tsx",
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

	test("data-provider never mounts seedData and gates children on the load state machine", () => {
		const src = readSrc("data-provider.tsx");
		expect(src).not.toMatch(/seedData/);
		expect(src).toMatch(/emptyKernelData/);
		expect(src).toMatch(/useState\(emptyKernelData\)/);
		expect(src).toMatch(/setData\(mapKernelSnapshot\(snapshot\)\)/);
		expect(src).not.toMatch(/localDispatch|data-store-reducer/);
		// The boolean gate is gone: children render only from `ready`.
		expect(src).not.toMatch(/kernelLoaded/);
		expect(src).toMatch(/if \(load.status !== "ready"\)/);
		// A failed first load renders the blocking error screen — never an
		// empty workspace.
		expect(src).toMatch(/<KernelLoadError/);
		expect(src).toMatch(/classifyLoadError/);
		// Stale attempts must not settle state after a newer attempt exists.
		expect(src).toMatch(/shouldSettle/);
		// 401 re-auth: best-effort sign-out + validated return URL redirect.
		expect(src).toMatch(/authClient\.signOut/);
		expect(src).toMatch(/validateReturnUrl/);
		// The command bus routes mid-session 401s into the same re-auth path.
		expect(src).toMatch(/onAuthLost: reauth/);
	});

	test("kernel writes POST with cookies included", () => {
		const src = readSrc("repos/kernel.ts");
		expect(src).toMatch(/credentials: "include"/);
	});

	test("kernel write modals await the dispatch before closing", () => {
		for (const file of KERNEL_WRITE_MODALS) {
			const src = readSrc(`../components/modals/${file}`);
			expect(src, file).toMatch(/async function submit/);
			expect(src, file).toMatch(/await dispatch\(/);
		}
	});

	test("add-syllabus navigates with the server id, not a client id", () => {
		const src = readSrc("../components/modals/add-syllabus-modal.tsx");
		expect(src).toMatch(/serverId = await dispatch\(/);
		expect(src).toMatch(/if \(serverId && onCreated\) onCreated\(serverId\)/);
		expect(src).not.toMatch(/onCreated\(id\)/);
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
		// Bus resolves undefined on write/refresh failure — the guard must
		// keep the modal open so the typed scores are not lost.
		expect(src).toMatch(/gradedId === undefined/);
		expect(src).toMatch(/setError\("Không lưu được điểm/);
		expect(src).toMatch(/type: "add-comment-bank"/);
		expect(src).toMatch(/operationId: commentOperationId/);
		expect(src).toMatch(/setCommentOperationId\(crypto\.randomUUID\(\)\)/);
		expect(src).toMatch(/disabled=\{inputsDisabled\}/);
		expect(src).toMatch(/gradeSaved/);
		expect(src).toMatch(/Điểm đã lưu.*nhận xét chưa lưu/);
		expect(src).toMatch(/disabled=\{saving\}/);
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
