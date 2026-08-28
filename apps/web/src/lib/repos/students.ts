/**
 * Students read repo (Wave 1) — owns the kernel→display mapping for the
 * students module. Pure by design: no provider import here, so unit tests
 * stay independent of the env-validated runtime. Selection lives in
 * repos/use-students.ts; writes stay on the Wave 0 command bus.
 */
import type {
	KernelPackageRow,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import { initials, type Student } from "@/lib/mock-data";

const ZERO_PKG: Student["pkg"] = {
	total: 0,
	done: 0,
	remaining: 0,
	price: 0,
	mode: "Online",
	start: "",
	expiry: "",
};

/**
 * Map kernel student rows to the display shape. `pkg` comes from the newest
 * active session_package owned by the student; a student without any package
 * gets the zero package (done/remaining always derive, never stored).
 * Wave 4: done/remaining derive from the completed lessons of exactly the
 * displayed package's enrollment (invariant 6) — a check-in on another
 * enrollment (e.g. the other half of a 1:2) never moves this student's pkg.
 * Issue #104: parked packages have `enrollmentId === null` (no class yet), so
 * they always display done 0 — nothing can be checked in without a class.
 */
export function mapStudents(snapshot: KernelSnapshot): Student[] {
	const packagesByStudent = new Map<string, KernelPackageRow>();
	for (const pkg of snapshot.packages) {
		if (pkg.status !== "active") continue;
		const existing = packagesByStudent.get(pkg.studentId);
		if (!existing || pkg.createdAt > existing.createdAt) {
			packagesByStudent.set(pkg.studentId, pkg);
		}
	}

	const completedByEnrollment = new Map<string, number>();
	for (const row of snapshot.lessons) {
		if (row.status !== "completed") continue;
		completedByEnrollment.set(
			row.enrollmentId,
			(completedByEnrollment.get(row.enrollmentId) ?? 0) + 1,
		);
	}

	return snapshot.students.map((row): Student => {
		const pkg = packagesByStudent.get(row.id);
		const done =
			pkg?.enrollmentId != null
				? (completedByEnrollment.get(pkg.enrollmentId) ?? 0)
				: 0;
		return {
			id: row.id,
			name: row.name,
			phone: row.phone,
			zalo: row.zalo,
			parent: { name: row.parentName, phone: row.parentPhone },
			targetBand: "—",
			skills: [],
			examDate: "",
			pkg: pkg
				? {
						total: pkg.total,
						done,
						remaining: Math.max(0, pkg.total - done),
						price: pkg.price,
						mode: pkg.mode === "Offline" ? "Offline" : "Online",
						start: pkg.start,
						expiry: pkg.expiry,
					}
				: { ...ZERO_PKG },
			tags: [],
			notes: "",
			avatar: initials(row.name),
			atRisk: false,
		};
	});
}
