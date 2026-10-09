import type { StudentTeacher } from "@teacher-os/api/contracts";
import { useState } from "react";
import { cn } from "@/lib/cn";

const SIZE_CLASS = {
	sm: "h-7 w-7 text-[12px]",
	md: "h-11 w-11 text-base",
} as const;

export function teacherInitial(name: string): string {
	const trimmed = name.trim();
	return trimmed ? trimmed.charAt(0).toUpperCase() : "G";
}

export function TeacherAvatar({
	teacher,
	size = "sm",
}: {
	teacher: StudentTeacher;
	size?: keyof typeof SIZE_CLASS;
}) {
	const [failed, setFailed] = useState(false);

	// alt="" vì tên giáo viên luôn hiện ngay cạnh avatar. no-referrer: ảnh
	// Google hay trả 403 khi request mang referrer.
	if (teacher.image && !failed) {
		return (
			<img
				src={teacher.image}
				alt=""
				referrerPolicy="no-referrer"
				onError={() => setFailed(true)}
				className={cn("shrink-0 rounded-full object-cover", SIZE_CLASS[size])}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				"neu-sm flex shrink-0 items-center justify-center rounded-full font-medium text-hot",
				SIZE_CLASS[size],
			)}
		>
			{teacherInitial(teacher.name)}
		</span>
	);
}
