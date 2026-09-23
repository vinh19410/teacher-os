import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { AlertCircle, LogOut, MailCheck, ShieldAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface StudentErrorViewProps {
	code?: string;
	userEmail?: string;
}

export function StudentErrorView({ code, userEmail }: StudentErrorViewProps) {
	const handleSignOut = async () => {
		try {
			await authClient.signOut();
		} catch {
			// Best-effort sign-out
		} finally {
			window.location.assign("/login");
		}
	};

	let title = "Không thể truy cập cổng học viên";
	let description =
		"Đã xảy ra lỗi trong quá trình xác thực thông tin học viên. Vui lòng thử lại sau.";
	let icon = <AlertCircle className="h-8 w-8 text-muted-fg" />;

	if (code === STUDENT_ERROR_CODES.NOT_LINKED) {
		title = "Tài khoản chưa được liên kết";
		description = `Email ${userEmail ? `(${userEmail})` : ""} chưa được liên kết với hồ sơ học viên nào trên hệ thống. Vui lòng thông báo cho giáo viên để thêm email này vào danh sách lớp.`;
		icon = <AlertCircle className="h-8 w-8 text-muted-fg" />;
	} else if (code === STUDENT_ERROR_CODES.EMAIL_UNVERIFIED) {
		title = "Email chưa được xác thực";
		description =
			"Vì lý do bảo mật, tài khoản cần được xác thực email trước khi xem thông tin lớp học. Bạn hãy đăng nhập bằng tài khoản Google để được xác thực tự động.";
		icon = <MailCheck className="h-8 w-8 text-accent-blue" />;
	} else if (code === STUDENT_ERROR_CODES.AMBIGUOUS) {
		title = "Thông tin tài khoản chưa rõ ràng";
		description =
			"Hệ thống ghi nhận nhiều hơn một hồ sơ học viên trùng với email của bạn. Vui lòng liên hệ trung tâm để được chuẩn hóa danh tính.";
		icon = <ShieldAlert className="h-8 w-8 text-danger" />;
	}

	return (
		<div className="flex min-h-[70svh] items-center justify-center p-4">
			<div className="w-full max-w-[480px] rounded-[var(--radius-lg)] border border-line bg-surface/50 p-6 text-center shadow-[var(--elev-raised)] sm:p-8">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
					{icon}
				</div>

				<h2 className="font-[620] font-display text-[22px] text-fg tracking-tight">
					{title}
				</h2>
				<p className="mt-2 text-[14px] text-muted-fg leading-relaxed">
					{description}
				</p>

				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={handleSignOut}
						className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-bg px-5 py-2.5 font-[510] text-[14px] text-fg transition-colors hover:border-line-hover hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<LogOut className="h-4 w-4" />
						<span>Đăng xuất</span>
					</button>
				</div>
			</div>
		</div>
	);
}
