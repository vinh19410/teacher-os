/**
 * Enrollments read repo (issue #61) — owns the kernel→display mapping for
 * the enrollments collection. Pure by design: no provider import here.
 * The row already is the display shape ({id, classId, studentId, createdAt});
 * the mapping exists so the slice keeps the per-collection repo convention
 * (AddInvoiceModal joins student/class labels at the call site).
 */
import type {
	KernelEnrollmentRow,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import type { ClassGroup, KernelHydratedData } from "@/lib/mock-data";

export function mapEnrollments(
	snapshot: KernelSnapshot,
): KernelEnrollmentRow[] {
	return snapshot.enrollments;
}

export type StudentClassGroup = ClassGroup & {
	enrollmentStatus?: string;
};

export function classesByStudent(
	data: Pick<KernelHydratedData, "classes" | "enrollments">,
	studentId: string,
): StudentClassGroup[] {
	const enrollmentsForStudent = data.enrollments.filter(
		(e) => e.studentId === studentId,
	);
	const statusByClass = new Map(
		enrollmentsForStudent.map((e) => [e.classId, e.status]),
	);

	return data.classes
		.filter((c) => statusByClass.has(c.id))
		.map((c) => ({
			...c,
			enrollmentStatus: statusByClass.get(c.id),
		}));
}
