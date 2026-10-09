// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState, routerState } from "@/test/router-mock";

const invalidate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async () => {
	const mock = (await import("@/test/router-mock")).routerMock();
	return { ...mock, useRouter: () => ({ invalidate }) };
});

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const auth = vi.hoisted(() => ({
	updateUser: vi.fn(),
	linkSocial: vi.fn(),
	listAccounts: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));

// jsdom has no canvas; the resize pipeline has its own tests.
vi.mock("@/lib/avatar-image", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/avatar-image")>()),
	fileToAvatarDataUrl: vi.fn(async () => "data:image/jpeg;base64,/9j/AAAA"),
}));

// The bank link panel is a self-contained query-backed card with its own
// tests; here it only has to sit next to the Google card.
vi.mock("@/components/payments/bank-link-panel", () => ({
	BankLinkPanel: () => <section data-testid="bank-link-panel" />,
}));

import { Route } from "./profile";

const Profile = (Route as unknown as { component: () => React.ReactNode })
	.component;

function signIn(user: Record<string, unknown> = {}) {
	routerState.routeContext = {
		session: {
			data: {
				user: {
					name: "Cô Lan",
					email: "lan@example.com",
					image: null,
					...user,
				},
			},
		},
	};
}

beforeEach(() => {
	resetRouterState();
	signIn();
	invalidate.mockReset();
	toast.success.mockReset();
	toast.error.mockReset();
	auth.updateUser.mockReset().mockResolvedValue({ error: null });
	auth.linkSocial.mockReset().mockResolvedValue({ error: null });
	auth.listAccounts.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(cleanup);

function saveName(name: string) {
	fireEvent.change(screen.getByTestId("profile-name-input"), {
		target: { value: name },
	});
	fireEvent.click(screen.getByTestId("profile-name-submit"));
}

describe("profile name", () => {
	it("saves the trimmed name and refreshes the session", async () => {
		render(<Profile />);
		saveName("  Cô Lan Anh  ");
		await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
		expect(auth.updateUser).toHaveBeenCalledWith({ name: "Cô Lan Anh" });
		expect(toast.success).toHaveBeenCalledWith("Đã cập nhật tên hiển thị");
	});

	it("reports a rejected update without claiming success", async () => {
		auth.updateUser.mockResolvedValue({
			error: { message: "Tên hiển thị không hợp lệ.", statusText: "" },
		});
		render(<Profile />);
		saveName("Cô Lan Anh");
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("Tên hiển thị không hợp lệ."),
		);
		expect(toast.success).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
		expect(
			(screen.getByTestId("profile-name-submit") as HTMLButtonElement).disabled,
		).toBe(false);
	});

	it("rejects a name shorter than 2 characters before calling the server", () => {
		render(<Profile />);
		saveName(" A ");
		expect(toast.error).toHaveBeenCalledWith(
			"Tên hiển thị phải từ 2 đến 100 ký tự.",
		);
		expect(auth.updateUser).not.toHaveBeenCalled();
	});

	it("follows a rename that arrives through the session", () => {
		const view = render(<Profile />);
		signIn({ name: "Tên từ tab khác" });
		view.rerender(<Profile />);
		expect(
			(screen.getByTestId("profile-name-input") as HTMLInputElement).value,
		).toBe("Tên từ tab khác");
	});
});

describe("Google OAuth return", () => {
	it("explains the error code from the callback and clears it from the URL path", async () => {
		routerState.search = { error: "email_doesn't_match" };
		render(<Profile />);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Email Google không khớp email của tài khoản hiện tại.",
			),
		);
		// `_auth` is pathless: "/profile" is the URL; "/_auth/profile" would 404.
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/profile",
			search: {},
			replace: true,
		});
	});
});

describe("Google link card", () => {
	it("shows the linked state for an account with a Google provider", async () => {
		auth.listAccounts.mockResolvedValue({
			data: [{ providerId: "credential" }, { providerId: "google" }],
			error: null,
		});
		render(<Profile />);
		expect(await screen.findByText("Đã kết nối")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Kết nối Google" })).toBeNull();
	});

	it("starts linking with an absolute callback on this app's origin", async () => {
		// A password-only account is not linked to Google.
		auth.listAccounts.mockResolvedValue({
			data: [{ providerId: "credential" }],
			error: null,
		});
		render(<Profile />);
		fireEvent.click(
			await screen.findByRole("button", { name: "Kết nối Google" }),
		);
		await waitFor(() => expect(auth.linkSocial).toHaveBeenCalledTimes(1));
		const profileUrl = `${window.location.origin}/profile`;
		expect(auth.linkSocial).toHaveBeenCalledWith({
			provider: "google",
			callbackURL: profileUrl,
			errorCallbackURL: profileUrl,
		});
	});

	it("surfaces a failed link start and lets the user try again", async () => {
		auth.linkSocial.mockResolvedValue({
			error: { message: "Google tạm thời không phản hồi.", statusText: "" },
		});
		render(<Profile />);
		fireEvent.click(
			await screen.findByRole("button", { name: "Kết nối Google" }),
		);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Google tạm thời không phản hồi.",
			),
		);
		expect(
			(
				screen.getByRole("button", {
					name: "Kết nối Google",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);
	});

	it("shows a retryable error when the linked accounts cannot be loaded", async () => {
		auth.listAccounts.mockResolvedValueOnce({
			data: null,
			error: { message: "Mất kết nối.", statusText: "" },
		});
		auth.listAccounts.mockResolvedValueOnce({
			data: [{ providerId: "google" }],
			error: null,
		});
		render(<Profile />);
		expect(await screen.findByText("Mất kết nối.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
		expect(await screen.findByText("Đã kết nối")).toBeTruthy();
	});

	it("sits right before the bank link panel", async () => {
		render(<Profile />);
		const google = await screen.findByText("Liên kết tài khoản Google");
		const bank = screen.getByTestId("bank-link-panel");
		expect(
			google.compareDocumentPosition(bank) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});
});

describe("avatar upload", () => {
	const jpeg = () => new File(["x"], "me.jpg", { type: "image/jpeg" });

	function pick(file: File) {
		fireEvent.change(screen.getByTestId("avatar-input"), {
			target: { files: [file] },
		});
	}

	it("uploads the resized image and refreshes the session", async () => {
		render(<Profile />);
		pick(jpeg());
		await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
		expect(auth.updateUser).toHaveBeenCalledWith({
			image: "data:image/jpeg;base64,/9j/AAAA",
		});
		expect(toast.success).toHaveBeenCalledWith("Đã cập nhật ảnh đại diện");
	});

	it("clears the picker so choosing the same file again uploads again", async () => {
		render(<Profile />);
		const input = screen.getByTestId("avatar-input") as HTMLInputElement;
		// jsdom cannot hold a real file selection, so record what the handler
		// writes: a browser only fires change again once the value is cleared.
		const valueWrites: string[] = [];
		Object.defineProperty(input, "value", {
			configurable: true,
			get: () => "",
			set: (next: string) => valueWrites.push(next),
		});
		pick(jpeg());
		expect(valueWrites).toEqual([""]);
		await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
		pick(jpeg());
		await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(2));
	});

	it("reports a rejected upload without claiming success", async () => {
		auth.updateUser.mockResolvedValue({
			error: { message: "Ảnh vượt giới hạn.", statusText: "" },
		});
		render(<Profile />);
		pick(jpeg());
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("Ảnh vượt giới hạn."),
		);
		expect(toast.success).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("refuses an unsupported file type before uploading", () => {
		render(<Profile />);
		pick(new File(["x"], "me.gif", { type: "image/gif" }));
		expect(toast.error).toHaveBeenCalledWith(
			"Ảnh phải ở định dạng JPEG, PNG hoặc WebP.",
		);
		expect(auth.updateUser).not.toHaveBeenCalled();
	});

	it("shows the current avatar image with its e2e hook", () => {
		signIn({ image: "data:image/png;base64,iVBORw0KGgo=" });
		render(<Profile />);
		expect(screen.getByTestId("profile-avatar").getAttribute("src")).toBe(
			"data:image/png;base64,iVBORw0KGgo=",
		);
		expect(screen.getByTestId("avatar-change-btn").textContent).toBe("Đổi ảnh");
	});
});
