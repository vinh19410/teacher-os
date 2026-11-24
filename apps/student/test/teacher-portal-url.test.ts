import { describe, expect, it } from "vitest";
import { getTeacherPortalUrl } from "@/lib/teacher-portal-url";

describe("getTeacherPortalUrl", () => {
	it("resolves /teacher on unified lms domain (production, staging, custom port)", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "lms.teacheros.io.vn",
				protocol: "https:",
			}),
		).toBe("https://lms.teacheros.io.vn/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "lms.staging.teacheros.io.vn",
				protocol: "https:",
			}),
		).toBe("https://lms.staging.teacheros.io.vn/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "lms.custom-domain.vn",
				protocol: "https:",
				port: "8443",
			}),
		).toBe("https://lms.custom-domain.vn:8443/teacher");
	});

	it("derives unified lms /teacher URL from legacy student subdomain on production", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.teacheros.io.vn",
			protocol: "https:",
		});
		expect(url).toBe("https://lms.teacheros.io.vn/teacher");
	});

	it("derives unified lms /teacher URL from legacy student subdomain on staging", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.staging.teacheros.io.vn",
			protocol: "https:",
		});
		expect(url).toBe("https://lms.staging.teacheros.io.vn/teacher");
	});

	it("preserves custom port when deriving from legacy student subdomain", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.custom-domain.vn",
			protocol: "https:",
			port: "8443",
		});
		expect(url).toBe("https://lms.custom-domain.vn:8443/teacher");
	});

	it("maps unified local ports 8001/8101 and legacy dev ports 8003/8103 to /teacher on localhost", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
				port: "8001",
			}),
		).toBe("http://localhost:8001/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
				port: "8101",
			}),
		).toBe("http://localhost:8101/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
				port: "8003",
			}),
		).toBe("http://localhost:8001/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
				port: "8103",
			}),
		).toBe("http://localhost:8101/teacher");
	});

	it("maps loopback 127.0.0.1 ports appropriately", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8001",
			}),
		).toBe("http://127.0.0.1:8001/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8003",
			}),
		).toBe("http://127.0.0.1:8001/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8101",
			}),
		).toBe("http://127.0.0.1:8101/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8103",
			}),
		).toBe("http://127.0.0.1:8101/teacher");
	});

	it("maps IPv6 loopback [::1] ports appropriately", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "[::1]",
				protocol: "http:",
				port: "8003",
			}),
		).toBe("http://[::1]:8001/teacher");

		expect(
			getTeacherPortalUrl({
				hostname: "::1",
				protocol: "http:",
				port: "8103",
			}),
		).toBe("http://::1:8101/teacher");
	});

	it("returns undefined for localhost with unrecognized ports or missing port", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
				port: "5173",
			}),
		).toBeUndefined();

		expect(
			getTeacherPortalUrl({
				hostname: "localhost",
				protocol: "http:",
			}),
		).toBeUndefined();
	});

	it("returns undefined for unrecognized hosts to avoid broken links", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "teacher-os-student.pages.dev",
				protocol: "https:",
			}),
		).toBeUndefined();

		expect(
			getTeacherPortalUrl({
				hostname: "random-preview.workers.dev",
				protocol: "https:",
			}),
		).toBeUndefined();
	});

	it("returns undefined safely when no location is provided and window is undefined", () => {
		expect(getTeacherPortalUrl(undefined)).toBeUndefined();
	});
});
