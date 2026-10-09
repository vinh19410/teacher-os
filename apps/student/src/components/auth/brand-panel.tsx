import { StudentSpot } from "@teacher-os/ui/components/illustrations";

export interface BrandPanelProps {
	now?: Date;
}

/**
 * Cột trái trang auth theo pattern phase 3 phía web: nền raise + viền phải
 * hairline (thay nền ink đặc), wordmark `Teacher/OS` mono, minh họa
 * StudentSpot thay TeacherDesk. Copy tiếng Việt giữ nguyên.
 */
export default function BrandPanel({ now: _now }: BrandPanelProps = {}) {
	return (
		<section className="relative flex flex-col overflow-hidden border-line app:border-r app:border-solid bg-surface-warm px-[clamp(28px,4.5vw,64px)] py-[clamp(32px,4vw,56px)] max-[960px]:items-center max-[960px]:gap-6 max-[960px]:border-b max-[960px]:px-6 max-[960px]:py-8 max-[960px]:pb-9 max-[960px]:text-center">
			<div className="flex items-center gap-3 max-[960px]:hidden">
				<span className="font-mono text-fg text-xs uppercase tracking-[0.25em]">
					Teacher<span className="text-hot">/</span>OS
				</span>
			</div>

			<div className="flex flex-1 flex-col justify-center gap-[clamp(28px,4vh,48px)] py-[clamp(32px,6vh,72px)] max-[960px]:gap-[14px] max-[960px]:py-0">
				<div>
					<p className="mb-[14px] font-mono text-[11px] text-meta uppercase tracking-[0.2em]">
						Cổng thông tin học viên
					</p>
					<h1 className="max-w-[15ch] font-display font-extrabold text-[clamp(30px,3.1vw,46px)] leading-[0.95] tracking-[-0.045em] max-[960px]:max-w-[18ch] max-[960px]:text-[clamp(24px,6vw,30px)]">
						Lịch học &amp; bài tập của bạn,{" "}
						<span className="text-hot underline decoration-meta underline-offset-8">
							gọn gàng
						</span>{" "}
						và chuẩn xác.
					</h1>
					<p className="mt-4 max-w-[46ch] text-meta text-sm leading-[1.55] max-[960px]:hidden">
						Theo dõi tiến độ từng buổi học, hạn nộp bài tập và nhận điểm chi
						tiết trực tiếp từ giáo viên.
					</p>
				</div>

				<StudentSpot className="w-full max-w-md app:self-auto self-start max-[960px]:hidden" />
			</div>

			<p className="text-meta text-xs max-[960px]:hidden">
				© 2022 Teacher OS · Học viên
			</p>
		</section>
	);
}
