// @vitest-environment jsdom

import { fireEvent, within } from "@testing-library/react";
import { describe } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import { classRow, snapshotFixture, studentRow } from "@/test/kernel-harness";
import { EnrollStudentModal } from "./enroll-student-modal";

// Picking, eligibility and per-class reset are covered on the class detail
// route ($classId.test.tsx); this pins the shared write-modal contract.
describe("EnrollStudentModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: () =>
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
		render: (onClose) => (
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />
		),
		fill: (dialog) => {
			fireEvent.click(
				within(dialog).getByRole("option", { name: /Học viên Hai/ }),
			);
		},
		submit: "Lưu",
		expectedWrite: {
			path: "/api/classes/cl-1/enroll",
			body: { studentId: "st-2" },
		},
	});
});
