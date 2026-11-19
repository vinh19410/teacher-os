// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RecordingPassword } from "./recording-password";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("RecordingPassword", () => {
	test("sao chép mật khẩu và báo đã sao chép qua vùng aria-live", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(<RecordingPassword password="rec123" />);
		expect(screen.getByRole("status").textContent).toBe("");

		fireEvent.click(
			screen.getByRole("button", { name: "Sao chép mật khẩu recording" }),
		);

		expect(writeText).toHaveBeenCalledWith("rec123");
		expect(await screen.findByText("Đã sao chép mật khẩu")).toBeTruthy();
		expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
	});

	test("không báo đã sao chép khi clipboard bị từ chối", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		render(<RecordingPassword password="rec123" />);

		fireEvent.click(
			screen.getByRole("button", { name: "Sao chép mật khẩu recording" }),
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(screen.getByRole("status").textContent).toBe("");
	});
});
