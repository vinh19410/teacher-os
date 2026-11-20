import { describe, expect, it, vi } from "vitest";
import {
	detachLegacyWorkerDomains,
	isLegacyWorkerServiceName,
	isUnifiedLmsWorkerServiceName,
} from "./detach-legacy-worker-domains.ts";

describe("detach-legacy-worker-domains", () => {
	it("matches only retired web/student/admin Workers for the exact stage", () => {
		expect(
			isLegacyWorkerServiceName("teacher-os-web-staging-abc123def", "staging"),
		).toBe(true);
		expect(
			isLegacyWorkerServiceName("teacher-os-student-prod-999xyz", "prod"),
		).toBe(true);
		expect(isLegacyWorkerServiceName("teacher-os-prod-admin", "prod")).toBe(
			true,
		);

		// Must reject unified lms, server, profile, landing, other stages, and foreign scripts
		expect(
			isLegacyWorkerServiceName("teacher-os-lms-staging-abc123", "staging"),
		).toBe(false);
		expect(
			isLegacyWorkerServiceName("teacher-os-server-staging-abc123", "staging"),
		).toBe(false);
		expect(
			isLegacyWorkerServiceName("teacher-os-web-prod-abc123", "staging"),
		).toBe(false);
		expect(
			isLegacyWorkerServiceName("unrelated-project-web-staging", "staging"),
		).toBe(false);
	});

	it("recognizes unified lms Worker names across both naming forms", () => {
		expect(
			isUnifiedLmsWorkerServiceName("teacher-os-lms-staging-xyz", "staging"),
		).toBe(true);
		expect(
			isUnifiedLmsWorkerServiceName("teacher-os-prod-lms-xyz", "prod"),
		).toBe(true);
		expect(
			isUnifiedLmsWorkerServiceName("teacher-os-lms-prod-xyz", "staging"),
		).toBe(false);
	});

	it("detaches only legacy app/student/admin domains owned by retired Workers and leaves unrelated domains untouched", async () => {
		const requests: Array<{ method: string; url: string }> = [];
		const fetchMock = vi.fn(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				requests.push({ method, url });

				if (method === "GET") {
					return new Response(
						JSON.stringify({
							success: true,
							result_info: { total_pages: 1 },
							result: [
								{
									id: "dom-app",
									hostname: "app.staging.teacheros.io.vn",
									service: "teacher-os-web-staging-1111aaaa",
								},
								{
									id: "dom-student",
									hostname: "student.staging.teacheros.io.vn",
									service: "teacher-os-student-staging-2222bbbb",
								},
								{
									id: "dom-admin",
									hostname: "admin.staging.teacheros.io.vn",
									service: "teacher-os-admin-staging-3333cccc",
								},
								{
									id: "dom-api",
									hostname: "api.staging.teacheros.io.vn",
									service: "teacher-os-server-staging-4444dddd",
								},
								{
									id: "dom-prod-app",
									hostname: "app.msmy.io.vn",
									service: "teacher-os-web-prod-5555eeee",
								},
							],
						}),
						{ status: 200 },
					);
				}
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			},
		);

		const logs: string[] = [];
		const result = await detachLegacyWorkerDomains({
			accountId: "acc-123",
			apiToken: "tok-secret",
			appDomain: "staging.teacheros.io.vn",
			stage: "staging",
			fetchImpl: fetchMock as unknown as typeof fetch,
			log: (m) => logs.push(m),
		});

		expect(result.detached).toEqual([
			{
				id: "dom-app",
				hostname: "app.staging.teacheros.io.vn",
				service: "teacher-os-web-staging-1111aaaa",
			},
			{
				id: "dom-student",
				hostname: "student.staging.teacheros.io.vn",
				service: "teacher-os-student-staging-2222bbbb",
			},
			{
				id: "dom-admin",
				hostname: "admin.staging.teacheros.io.vn",
				service: "teacher-os-admin-staging-3333cccc",
			},
		]);
		expect(result.alreadyUnified).toEqual([]);
		expect(
			requests.filter((r) => r.method === "DELETE").map((r) => r.url),
		).toEqual([
			"https://api.cloudflare.com/client/v4/accounts/acc-123/workers/domains/dom-app",
			"https://api.cloudflare.com/client/v4/accounts/acc-123/workers/domains/dom-student",
			"https://api.cloudflare.com/client/v4/accounts/acc-123/workers/domains/dom-admin",
		]);
		expect(logs.join("\n")).not.toContain("tok-secret");
	});

	it("is a no-op once hostnames are already attached to the unified lms Worker", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						result_info: { total_pages: 1 },
						result: [
							{
								id: "dom-lms",
								hostname: "lms.msmy.io.vn",
								service: "teacher-os-lms-prod-aaaa",
							},
							{
								id: "dom-app",
								hostname: "app.msmy.io.vn",
								service: "teacher-os-lms-prod-aaaa",
							},
							{
								id: "dom-student",
								hostname: "student.msmy.io.vn",
								service: "teacher-os-lms-prod-aaaa",
							},
							{
								id: "dom-admin",
								hostname: "admin.msmy.io.vn",
								service: "teacher-os-lms-prod-aaaa",
							},
						],
					}),
					{ status: 200 },
				),
		);

		const result = await detachLegacyWorkerDomains({
			accountId: "acc-123",
			apiToken: "tok-secret",
			appDomain: "msmy.io.vn",
			stage: "prod",
			fetchImpl: fetchMock as unknown as typeof fetch,
			log: () => {},
		});

		expect(result.detached).toEqual([]);
		expect(result.alreadyUnified).toHaveLength(3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("refuses to detach a hostname attached to an unexpected foreign Worker", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						result_info: { total_pages: 1 },
						result: [
							{
								id: "dom-app",
								hostname: "app.msmy.io.vn",
								service: "some-other-service",
							},
						],
					}),
					{ status: 200 },
				),
		);

		await expect(
			detachLegacyWorkerDomains({
				accountId: "acc-123",
				apiToken: "tok-secret",
				appDomain: "msmy.io.vn",
				stage: "prod",
				fetchImpl: fetchMock as unknown as typeof fetch,
				log: () => {},
			}),
		).rejects.toThrow(/Refusing to detach hostname 'app\.msmy\.io\.vn'/);
	});
});
