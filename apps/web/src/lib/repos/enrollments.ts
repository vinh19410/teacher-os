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

export function mapEnrollments(
	snapshot: KernelSnapshot,
): KernelEnrollmentRow[] {
	return snapshot.enrollments;
}
