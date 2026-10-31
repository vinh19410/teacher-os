import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	isDotFilePath,
	isStaticAssetPath,
	isValidAppRoute,
} from "./routes-matcher";

const here = dirname(fileURLToPath(import.meta.url));

describe("routes-matcher", () => {
	describe("isValidAppRoute", () => {
		const validStaticRoutes = [
			"/",
			"/login",
			"/verify-email",
			"/forgot-password",
			"/reset-password",
			"/dashboard",
			"/attendance",
			"/profile",
			"/reports",
			"/schedule",
			"/tuition",
			"/debts",
			"/assignments",
			"/assignments/new",
			"/assignments/preview",
			"/assignments/tests/new",
			"/assignments/tests/preview",
			"/grading",
			"/classes",
			"/students",
			"/leads",
			"/placement-test",
			"/syllabus",
			"/vocab",
		];

		for (const route of validStaticRoutes) {
			it(`accepts exact route ${route}`, () => {
				expect(isValidAppRoute(route)).toBe(true);
			});

			it(`accepts exact route with trailing slash: ${route}/`, () => {
				expect(isValidAppRoute(`${route}/`)).toBe(true);
			});
		}

		// The drift guard below returns early when the gitignored
		// routeTree.gen.ts is absent, so the password-reset routes (the mail
		// link lands on /reset-password) are asserted directly here.
		it("accepts the password-reset routes with and without trailing slash", () => {
			for (const route of ["/forgot-password", "/reset-password"]) {
				expect(isValidAppRoute(route)).toBe(true);
				expect(isValidAppRoute(`${route}/`)).toBe(true);
				expect(isValidAppRoute(`${route}?token=abc`)).toBe(true);
			}
		});

		it("accepts valid dynamic sub-routes (with and without trailing slashes)", () => {
			expect(
				isValidAppRoute("/students/6da91f92-1faf-40a6-ac57-09724ad29bf3"),
			).toBe(true);
			expect(
				isValidAppRoute("/students/6da91f92-1faf-40a6-ac57-09724ad29bf3/"),
			).toBe(true);
			expect(isValidAppRoute("/classes/class-abc-123")).toBe(true);
			expect(isValidAppRoute("/classes/class-abc-123/")).toBe(true);
			expect(isValidAppRoute("/syllabus/syll-xyz-456")).toBe(true);
			expect(isValidAppRoute("/syllabus/syll-xyz-456/")).toBe(true);
			expect(isValidAppRoute("/assignments/assign-789")).toBe(true);
			expect(isValidAppRoute("/assignments/assign-789/")).toBe(true);
			// Full-test edit route (phase-03): /assignments/tests/<id> — hai
			// segment sau /assignments, cần prefix riêng của nó.
			expect(isValidAppRoute("/assignments/tests/0192f0c0-test-id")).toBe(true);
			expect(isValidAppRoute("/assignments/tests/0192f0c0-test-id/")).toBe(
				true,
			);
			// Prefix reasoning test "new"/"preview" vẫn match exact route ở trên.
			expect(isValidAppRoute("/assignments/tests/new")).toBe(true);
			expect(isValidAppRoute("/assignments/tests/preview")).toBe(true);
			// Trang chấm bài (#319): /grading/<attemptId> — một segment.
			expect(isValidAppRoute("/grading/att-123")).toBe(true);
			expect(isValidAppRoute("/grading/att-123/")).toBe(true);
			expect(isValidAppRoute("/grading")).toBe(true);
			expect(isValidAppRoute("/grading/a/b")).toBe(false);
			// Chi tiết hóa đơn (#345): /tuition/<invoiceId> — một segment; /
			// tuition/<id>/extra phải từ chối như các prefix khác.
			expect(
				isValidAppRoute("/tuition/6da91f92-1faf-40a6-ac57-09724ad29bf3"),
			).toBe(true);
			expect(
				isValidAppRoute("/tuition/6da91f92-1faf-40a6-ac57-09724ad29bf3/"),
			).toBe(true);
			expect(isValidAppRoute("/tuition/inv-1/extra")).toBe(false);
		});

		it("rejects non-existent pages reported in QC issue #113", () => {
			expect(isValidAppRoute("/this-page-does-not-exist-qc-test")).toBe(false);
			expect(isValidAppRoute("/help")).toBe(false);
			expect(isValidAppRoute("/about")).toBe(false);
			expect(isValidAppRoute("/signup")).toBe(false);
			expect(isValidAppRoute("/register")).toBe(false);
		});

		it("rejects random unknown paths", () => {
			expect(isValidAppRoute("/foo")).toBe(false);
			expect(isValidAppRoute("/api/unknown")).toBe(false);
			expect(isValidAppRoute("/admin")).toBe(false);
			// Route /settings đã bị gỡ (issue #321) — xử lý như path không hợp lệ.
			expect(isValidAppRoute("/settings")).toBe(false);
			expect(isValidAppRoute("/settings/extra/nested")).toBe(false);
			// Route /payments đã gỡ (#338) — panel bank link dời về /profile.
			expect(isValidAppRoute("/payments")).toBe(false);
		});

		it("drift guard: every route declared in routeTree.gen.ts passes isValidAppRoute", () => {
			const routeTreePath = join(here, "routeTree.gen.ts");
			if (!existsSync(routeTreePath)) {
				return;
			}
			const routeTreeSrc = readFileSync(routeTreePath, "utf8");
			// Match all route keys in FileRoutesByFullPath
			const match = routeTreeSrc.match(
				/export interface FileRoutesByFullPath \{([^}]+)\}/,
			);
			expect(match).toBeTruthy();
			const block = match?.[1] ?? "";
			const routeKeys = Array.from(block.matchAll(/'([^']+)'/g)).map(
				(m) => m[1],
			);

			expect(routeKeys.length).toBeGreaterThan(0);
			for (const path of routeKeys) {
				const concretePath = path
					.replace(/\$studentId/g, "sample-id")
					.replace(/\$classId/g, "sample-id")
					.replace(/\$syllabusId/g, "sample-id")
					.replace(/\$assignmentId/g, "sample-id")
					.replace(/\$invoiceId/g, "sample-id");
				expect(
					isValidAppRoute(concretePath),
					`Route "${path}" (resolved as "${concretePath}") should be recognized as valid`,
				).toBe(true);
			}
		});
	});

	describe("isDotFilePath", () => {
		it("detects sensitive dotfiles", () => {
			expect(isDotFilePath("/.env")).toBe(true);
			expect(isDotFilePath("/.env.local")).toBe(true);
			expect(isDotFilePath("/.git")).toBe(true);
			expect(isDotFilePath("/.git/config")).toBe(true);
			expect(isDotFilePath("/sub/.secret")).toBe(true);
		});

		it("detects path traversal attempts", () => {
			expect(isDotFilePath("/../.env")).toBe(true);
			expect(isDotFilePath("/assets/../../.env")).toBe(true);
			expect(isDotFilePath("/%2e%2e/.env")).toBe(true);
		});

		it("does not flag standard .well-known directories as dotfiles", () => {
			expect(isDotFilePath("/.well-known/assetlinks.json")).toBe(false);
			expect(isDotFilePath("/.well-known/openid-configuration")).toBe(false);
		});

		it("does not flag normal routes or assets as dotfiles", () => {
			expect(isDotFilePath("/")).toBe(false);
			expect(isDotFilePath("/dashboard")).toBe(false);
			expect(isDotFilePath("/assets/index.js")).toBe(false);
			expect(isDotFilePath("/favicon.ico")).toBe(false);
		});
		it("recognizes known static files in public/", () => {
			expect(isStaticAssetPath("/favicon.ico")).toBe(true);
			expect(isStaticAssetPath("/logo.png")).toBe(true);
			expect(isStaticAssetPath("/sw.js")).toBe(true);
			expect(isStaticAssetPath("/registerSW.js")).toBe(true);
			expect(isStaticAssetPath("/dev-sw.js")).toBe(true);
		});

		it("recognizes files in /assets/ directory", () => {
			expect(isStaticAssetPath("/assets/index-abc.js")).toBe(true);
			expect(isStaticAssetPath("/assets/index-def.css")).toBe(true);
		});

		it("recognizes standard static file extensions", () => {
			expect(isStaticAssetPath("/image.png")).toBe(true);
			expect(isStaticAssetPath("/style.css")).toBe(true);
			expect(isStaticAssetPath("/script.js")).toBe(true);
			expect(isStaticAssetPath("/font.woff2")).toBe(true);
			expect(isStaticAssetPath("/manifest.json")).toBe(true);
		});

		it("does not flag client application routes as static assets", () => {
			expect(isStaticAssetPath("/")).toBe(false);
			expect(isStaticAssetPath("/login")).toBe(false);
			expect(isStaticAssetPath("/dashboard")).toBe(false);
			expect(isStaticAssetPath("/students/123")).toBe(false);
			expect(isStaticAssetPath("/this-page-does-not-exist-qc-test")).toBe(
				false,
			);
		});
	});
});
