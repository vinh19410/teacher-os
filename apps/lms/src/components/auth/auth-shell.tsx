import {
	type AuthQuote,
	AuthSplitLayout,
} from "@teacher-os/ui/components/auth-split-layout";
import { TeacherDesk } from "@teacher-os/ui/components/illustrations";
import type { ReactNode } from "react";

const LMS_AUTH_QUOTE: AuthQuote = {
	text: "Lớp học, bài tập IELTS, chấm bài và lộ trình học tập — tất cả gọn gàng trong một không gian duy nhất.",
	author: "Cô Mỹ Dạy Tiếng Anh · Hệ thống học tập",
};

/**
 * Khung auth hợp nhất cho cổng LMS: sử dụng `AuthSplitLayout` (kèm `ThemeToggle`
 * ở góc trên phải) với minh họa `TeacherDesk` và token design v2.
 */
export function LmsAuthShell({
	formLabel,
	children,
}: {
	formLabel: string;
	children: ReactNode;
}) {
	return (
		<AuthSplitLayout
			formLabel={formLabel}
			brandLabel="Cô Mỹ Dạy Tiếng Anh"
			quote={LMS_AUTH_QUOTE}
			illustration={
				<TeacherDesk decorative className="w-full max-w-lg self-center" />
			}
		>
			{children}
		</AuthSplitLayout>
	);
}
