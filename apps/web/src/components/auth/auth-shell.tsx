import {
	type AuthQuote,
	AuthSplitLayout,
} from "@teacher-os/ui/components/auth-split-layout";
import { TeacherDesk } from "@teacher-os/ui/components/illustrations";
import type { ReactNode } from "react";

// Quote cột phải theo pattern Login design v2 (nguồn: mock Lan IELTS Studio).
const WEB_AUTH_QUOTE: AuthQuote = {
	text: "Lớp học, bài tập IELTS, chấm bài và học phí VietQR — một bàn làm việc yên tĩnh cho giáo viên tự do.",
	author: "Nguyễn Hoàng Lan, Lan IELTS Studio",
};

/** Khung auth web: AuthSplitLayout với quote + minh họa TeacherDesk cố định
 * (4+ route auth dùng chung — forgot/reset/verify/login). */
export function WebAuthShell({
	formLabel,
	children,
}: {
	formLabel: string;
	children: ReactNode;
}) {
	return (
		<AuthSplitLayout
			formLabel={formLabel}
			brandLabel="Teacher OS"
			quote={WEB_AUTH_QUOTE}
			illustration={
				<TeacherDesk decorative className="w-full max-w-lg self-center" />
			}
		>
			{children}
		</AuthSplitLayout>
	);
}
