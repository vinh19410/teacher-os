// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	POLL_CAP_MS,
	POLL_INTERVAL_MS,
	shouldPollPayment,
} from "./payments-portal";

function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: hidden,
	});
}

afterEach(() => {
	setDocumentHidden(false);
});

describe("shouldPollPayment", () => {
	const base = {
		panelOpen: true,
		payable: true,
		openedAt: 1_000_000,
		now: 1_000_000 + POLL_INTERVAL_MS,
	};

	it("returns true while open, payable, visible, and inside cap", () => {
		setDocumentHidden(false);
		expect(shouldPollPayment(base)).toBe(true);
	});

	it("returns false when panel is closed", () => {
		expect(shouldPollPayment({ ...base, panelOpen: false })).toBe(false);
	});

	it("returns false when invoice is not payable", () => {
		expect(shouldPollPayment({ ...base, payable: false })).toBe(false);
	});

	it("returns false when document is hidden", () => {
		setDocumentHidden(true);
		expect(shouldPollPayment(base)).toBe(false);
	});

	it("returns false once the 15-minute cap has elapsed", () => {
		expect(
			shouldPollPayment({
				...base,
				now: base.openedAt + POLL_CAP_MS,
			}),
		).toBe(false);
		expect(
			shouldPollPayment({
				...base,
				now: base.openedAt + POLL_CAP_MS + 1,
			}),
		).toBe(false);
	});
});
