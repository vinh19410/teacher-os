import {
	type AuthQuote,
	AuthSplitLayout,
} from "@teacher-os/ui/components/auth-split-layout";
import { TeacherDesk } from "@teacher-os/ui/components/illustrations";
import type { ReactNode } from "react";

// Quote cột phải cho cổng quản trị (pattern Login design v2).
const ADMIN_AUTH_QUOTE: AuthQuote = {
	text: "Kho đề, bài nghe và kết quả chấm — quản tập trung trong một nơi duy nhất.",
	author: "Cô Mỹ Dạy Tiếng Anh · Cổng quản trị",
};

/** Khung auth admin: AuthSplitLayout với quote + minh họa TeacherDesk cố
 * định (các route auth admin dùng chung — login/register/forgot/reset). */
export function AdminAuthShell({
	formLabel,
	children,
}: {
	formLabel: string;
	children: ReactNode;
}) {
	return (
		<AuthSplitLayout
			formLabel={formLabel}
			brandLabel="Cô Mỹ Dạy Tiếng Anh · Quản trị"
			quote={ADMIN_AUTH_QUOTE}
			illustration={
				<TeacherDesk decorative className="w-full max-w-lg self-center" />
			}
		>
			{children}
		</AuthSplitLayout>
	);
}
