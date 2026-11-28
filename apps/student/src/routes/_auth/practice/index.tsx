import { createFileRoute, redirect } from "@tanstack/react-router";
import { PRACTICE_ROUTES_LIVE } from "@/components/layout/student-nav";

/** Mục "Luyện tập" — về Từ vựng khi tắt cờ tự luyện trên PROD, về Reading khi bật đầy đủ. */
export const Route = createFileRoute("/_auth/practice/")({
	beforeLoad: () => {
		if (!PRACTICE_ROUTES_LIVE) {
			throw redirect({
				to: "/practice/vocabulary",
				search: {},
				replace: true,
			});
		}
		throw redirect({
			to: "/practice/$skill",
			params: { skill: "reading" },
			search: {},
			replace: true,
		});
	},
});
