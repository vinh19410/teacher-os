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
 * gets the zero package (done/remaining always derive, never stored) and
 * hasPackage: false (D2 — views render "Chưa có gói").
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
			email: row.email,
			...(row.portalLinked !== undefined
				? { portalLinked: row.portalLinked }
				: {}),
			hasPackage: pkg != null,
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

/**
 * #616: Kiểm tra học viên có email nhưng chưa hoàn tất liên kết Student Portal (portalLinked === false).
 * Học viên không có email hoặc đã liên kết (portalLinked === true) hoặc deploy skew (undefined) -> false.
 */
export function isPendingPortalStudent(student: {
	email?: string | null;
	portalLinked?: boolean;
}): boolean {
	return Boolean(student.email?.trim()) && student.portalLinked === false;
}

/**
 * #616: Lọc các lời mời tổ chức đang chờ (status === "pending") và loại bỏ email
 * đã tồn tại trong danh sách học viên chờ xác nhận để tránh trùng lặp.
 */
export function filterUniquePendingInvites<
	T extends { email?: string | null; status?: string },
>(invitations: T[] | undefined, pendingStudentEmails: Set<string>): T[] {
	return (invitations ?? []).filter(
		(inv) =>
			inv.status === "pending" &&
			!pendingStudentEmails.has((inv.email ?? "").trim().toLowerCase()),
	);
}
