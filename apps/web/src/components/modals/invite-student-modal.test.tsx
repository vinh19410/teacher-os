import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repos/invitations", () => ({
	useInviteStudent: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

import { InviteStudentModal } from "./invite-student-modal";

describe("InviteStudentModal", () => {
	it("renders nothing when closed", () => {
		const html = renderToStaticMarkup(
			<InviteStudentModal open={false} onClose={() => {}} />,
		);
		expect(html).toBe("");
	});

	it("renders the modal, email field and buttons when open", () => {
		const html = renderToStaticMarkup(
			<InviteStudentModal open={true} onClose={() => {}} />,
		);
		expect(html).toContain("Mời học viên vào tổ chức");
		expect(html).toContain("Email học viên");
		expect(html).toContain('type="email"');
		expect(html).toContain("Gửi lời mời");
		expect(html).toContain("Hủy");
	});
});
