import { createFileRoute, redirect } from "@tanstack/react-router";

/** Mục "Luyện tập" — rơi về skill đầu theo nav (KHÔNG có Dictation). */
export const Route = createFileRoute("/_auth/practice/")({
	beforeLoad: () => {
		throw redirect({
			to: "/practice/$skill",
			params: { skill: "reading" },
			search: {},
			replace: true,
		});
	},
});
