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
 * active session_package across the student's enrollments; a classless
 * student gets the zero package (done/remaining always derive, never stored).
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

	return snapshot.students.map((row): Student => {
		const pkg = packagesByStudent.get(row.id);
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
						done: 0,
						remaining: pkg.total,
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
