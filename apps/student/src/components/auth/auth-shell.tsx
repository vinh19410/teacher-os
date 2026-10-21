import {
	type AuthQuote,
	AuthSplitLayout,
} from "@teacher-os/ui/components/auth-split-layout";
import { StudentSpot } from "@teacher-os/ui/components/illustrations";
import type { ReactNode } from "react";

// Quote cột phải cho cổng học viên (pattern Login design v2).
const STUDENT_AUTH_QUOTE: AuthQuote = {
	text: "Lịch học, bài tập và điểm số của bạn luôn rõ ràng ở một nơi — chỉ cần tập trung học.",
	author: "Teacher OS · Cổng học viên",
};

/** Khung auth student: AuthSplitLayout với quote + minh họa StudentSpot cố
 * định (4 route auth dùng chung — login/forgot/reset/verify). */
export function StudentAuthShell({
	formLabel,
	children,
}: {
	formLabel: string;
	children: ReactNode;
}) {
	return (
		<AuthSplitLayout
			formLabel={formLabel}
			brandLabel="Teacher OS · Học viên"
			quote={STUDENT_AUTH_QUOTE}
			illustration={
				<StudentSpot decorative className="w-full max-w-lg self-center" />
			}
		>
			{children}
		</AuthSplitLayout>
	);
}
