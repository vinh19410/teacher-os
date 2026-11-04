import { describe, expect, it } from "vitest";
import { getTeacherPortalUrl } from "@/lib/teacher-portal-url";

describe("getTeacherPortalUrl", () => {
	it("derives app origin from student subdomain on production", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.teacheros.io.vn",
			protocol: "https:",
		});
		expect(url).toBe("https://app.teacheros.io.vn");
	});

	it("derives app origin from student subdomain on staging", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.staging.teacheros.io.vn",
			protocol: "https:",
		});
		expect(url).toBe("https://app.staging.teacheros.io.vn");
	});

	it("preserves custom port when deriving from student subdomain", () => {
		const url = getTeacherPortalUrl({
			hostname: "student.custom-domain.vn",
			protocol: "https:",
			port: "8443",
		});
		expect(url).toBe("https://app.custom-domain.vn:8443");
	});

	it("maps standard dev port 8003 to 8001 on localhost", () => {
		const url = getTeacherPortalUrl({
			hostname: "localhost",
			protocol: "http:",
			port: "8003",
		});
		expect(url).toBe("http://localhost:8001");
	});

	it("maps e2e/verify port 8103 to 8101 on localhost", () => {
		const url = getTeacherPortalUrl({
			hostname: "localhost",
			protocol: "http:",
			port: "8103",
		});
		expect(url).toBe("http://localhost:8101");
	});

	it("maps loopback 127.0.0.1 ports appropriately", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8003",
			}),
		).toBe("http://127.0.0.1:8001");

		expect(
			getTeacherPortalUrl({
				hostname: "127.0.0.1",
				protocol: "http:",
				port: "8103",
			}),
		).toBe("http://127.0.0.1:8101");
	});

	it("maps IPv6 loopback [::1] ports appropriately", () => {
		expect(
			getTeacherPortalUrl({
				hostname: "[::1]",
				protocol: "http:",
				port: "8003",
			}),
		).toBe("http://[::1]:8001");

		expect(
			getTeacherPortalUrl({
				hostname: "::1",
				protocol: "http:",
				port: "8103",
			}),
		).toBe("http://::1:8101");
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
