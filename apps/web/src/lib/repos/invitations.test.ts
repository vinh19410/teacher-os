import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "./api-base-url";
import {
	cancelStudentInvitation,
	fetchPendingInvitations,
	resendStudentInvitation,
	resendStudentProfileInvite,
	sendStudentInvitation,
} from "./invitations";

describe("invitations repo", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("resolves API base URL to the configured backend rather than window.location.origin", () => {
		const baseUrl = getApiBaseUrl();
		expect(baseUrl).toMatch(/^https?:\/\//);
		// It must not fallback to window.location.origin port when running in browser
		expect(baseUrl).not.toBe("http://localhost:8001");
	});

	it("resolves API base URL correctly even when window is defined in browser", () => {
		const originalWindow = globalThis.window;
		try {
			// Simulate browser window where origin is the web app port 8001
			globalThis.window = {
				location: { origin: "http://localhost:8001" },
			} as unknown as Window & typeof globalThis;
			const baseUrl = getApiBaseUrl();
			expect(baseUrl).toBe("http://localhost:8000");
		} finally {
			globalThis.window = originalWindow;
		}
	});

	it("sendStudentInvitation sends POST to /api/students/invite with credentials and JSON headers", async () => {
		const mockResponse = {
			id: "inv-123",
			orgId: "org-1",
			email: "student@test.local",
			status: "pending",
			createdAt: new Date().toISOString(),
		};

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => mockResponse,
		});
		globalThis.fetch = fetchMock;

		const result = await sendStudentInvitation(
			"student@test.local",
			"http://localhost:8000",
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/students/invite",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email: "student@test.local" }),
			}),
		);
		expect(result).toEqual(mockResponse);
	});

	it("sendStudentInvitation throws formatted error with code and status on error response", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({
				error: "Học viên này đã ở trong tổ chức của bạn",
				code: "STUDENT_ALREADY_IN_ORG",
			}),
		});
		globalThis.fetch = fetchMock;

		await expect(
			sendStudentInvitation("student@test.local", "http://localhost:8000"),
		).rejects.toMatchObject({
			message: "Học viên này đã ở trong tổ chức của bạn",
			code: "STUDENT_ALREADY_IN_ORG",
			status: 409,
		});
	});

	it("fetchPendingInvitations sends GET to /api/students/invitations", async () => {
		const mockList = [
			{
				id: "inv-1",
				orgId: "org-1",
				email: "a@test.local",
				status: "pending",
				createdAt: new Date().toISOString(),
			},
		];

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockList,
		});
		globalThis.fetch = fetchMock;

		const result = await fetchPendingInvitations("http://localhost:8000");

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/students/invitations",
			expect.objectContaining({
				method: "GET",
				credentials: "include",
			}),
		);
		expect(result).toEqual(mockList);
	});

	it("cancelStudentInvitation sends DELETE to /api/students/invitations/:id with Content-Type application/json", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		});
		globalThis.fetch = fetchMock;

		const result = await cancelStudentInvitation(
			"inv-123",
			"http://localhost:8000",
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/students/invitations/inv-123",
			expect.objectContaining({
				method: "DELETE",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
			}),
		);
		expect(result).toEqual({ ok: true });
	});

	it("sendStudentInvitation preserves structured 409 conflict fields (#570)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({
				error: "Học viên này đã ở trong tổ chức của bạn",
				code: "STUDENT_ALREADY_IN_ORG",
				existingStudentId: "stu-88",
				existingStudentName: "Nguyễn Minh",
				portalLinked: false,
			}),
		});
		globalThis.fetch = fetchMock;

		await expect(
			sendStudentInvitation("minh@test.local", "http://localhost:8000"),
		).rejects.toMatchObject({
			status: 409,
			code: "STUDENT_ALREADY_IN_ORG",
			existingStudentId: "stu-88",
			existingStudentName: "Nguyễn Minh",
			portalLinked: false,
		});
	});

	it("resendStudentInvitation sends POST to /api/students/invitations/:id/resend with JSON body and surfaces retryAfterSeconds on 429 (#570)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ ok: true, id: "inv-123", updatedAt: 1700000000 }),
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 429,
				json: async () => ({
					error: "Vui lòng đợi 45 giây",
					code: "INVITATION_RESEND_COOLDOWN",
					retryAfterSeconds: 45,
				}),
			});
		globalThis.fetch = fetchMock;

		const ok = await resendStudentInvitation(
			"inv-123",
			"http://localhost:8000",
		);
		expect(ok.id).toBe("inv-123");
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/students/invitations/inv-123/resend",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			}),
		);

		await expect(
			resendStudentInvitation("inv-123", "http://localhost:8000"),
		).rejects.toMatchObject({
			status: 429,
			code: "INVITATION_RESEND_COOLDOWN",
			retryAfterSeconds: 45,
		});
	});

	it("resendStudentProfileInvite sends POST to /api/students/:id/resend-invite with optional enrollmentId (#570)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true, id: "stu-1", updatedAt: 1700000000 }),
		});
		globalThis.fetch = fetchMock;

		await resendStudentProfileInvite(
			{ studentId: "stu-1", enrollmentId: "enr-9" },
			"http://localhost:8000",
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/students/stu-1/resend-invite",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enrollmentId: "enr-9" }),
			}),
		);
	});
});
