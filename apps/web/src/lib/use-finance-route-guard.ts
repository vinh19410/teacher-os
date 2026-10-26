import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useData } from "./data-store";

export const FINANCE_FORBIDDEN_TOAST = "Bạn không có quyền xem Sổ công nợ";
export const FINANCE_FORBIDDEN_TOAST_ID = "finance-forbidden";

/**
 * TOS-17 (#451): chặn các vai trò không có quyền tài chính (`ta`,
 * `class_teacher`, hoặc giá trị lạ) truy cập `/debts`, `/tuition` và
 * `/tuition/$invoiceId`. Điều hướng về `/dashboard` kèm toast một lần và
 * trả `false` để route dừng render ngay (tránh bắn thêm request API tài
 * chính từ component con).
 */
export function useFinanceRouteGuard(): boolean {
	const { data } = useData();
	const navigate = useNavigate();
	const canAccessFinance = data.viewer?.canAccessFinance ?? true;

	useEffect(() => {
		if (!canAccessFinance) {
			toast.error(FINANCE_FORBIDDEN_TOAST, {
				id: FINANCE_FORBIDDEN_TOAST_ID,
			});
			void navigate({ to: "/dashboard", replace: true });
		}
	}, [canAccessFinance, navigate]);

	return canAccessFinance;
}
