import { Button } from "@teacher-os/ui/components/button";
import { SnailIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PLAYBACK_RATES = { normal: 1, slow: 0.6 } as const;

type PlaySpeed = keyof typeof PLAYBACK_RATES;

/**
 * 2 nút phát âm từ vựng: Nghe (tốc độ thường) / Nghe chậm (0.6x, giữ cao độ).
 *
 * Contract: `src` là blob object URL do component cha tạo/revoke qua
 * `fetchVocabAudioObjectUrl` — không truyền URL CDN/signed trực tiếp.
 */
export function VocabPronunciationButtons({
	src,
	testIdPrefix,
	disabled = false,
}: {
	src: string;
	testIdPrefix: string;
	disabled?: boolean;
}) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const playTokenRef = useRef(0);
	const rateRef = useRef<number>(PLAYBACK_RATES.normal);
	const [playing, setPlaying] = useState<PlaySpeed | null>(null);

	// Đổi src: dừng phát, bump token để catch của promise play() cũ không clobber state.
	const prevSrcRef = useRef(src);
	useEffect(() => {
		if (prevSrcRef.current === src) return;
		prevSrcRef.current = src;
		playTokenRef.current += 1;
		audioRef.current?.pause();
		setPlaying(null);
	}, [src]);

	// Đăng ký đúng 1 lần; listener `playing` đọc rateRef.current (không capture rate của lần click).
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const onEnded = () => setPlaying(null);
		const onPlaying = () => {
			audio.playbackRate = rateRef.current;
		};
		audio.addEventListener("ended", onEnded);
		audio.addEventListener("playing", onPlaying);
		return () => {
			audio.removeEventListener("ended", onEnded);
			audio.removeEventListener("playing", onPlaying);
			// Unmount giữa lúc đang phát: dừng playback của media element bị detach.
			audio.pause();
		};
	}, []);

	const play = (speed: PlaySpeed) => {
		const audio = audioRef.current;
		if (!audio) return;
		playTokenRef.current += 1;
		const token = playTokenRef.current;
		rateRef.current = PLAYBACK_RATES[speed];
		audio.pause();
		audio.currentTime = 0;
		audio.playbackRate = PLAYBACK_RATES[speed];
		audio.preservesPitch = true;
		if ("webkitPreservesPitch" in audio) {
			(
				audio as HTMLAudioElement & { webkitPreservesPitch: boolean }
			).webkitPreservesPitch = true;
		}
		setPlaying(speed);
		void audio.play().catch(() => {
			// Promise play() của lần bấm trước có thể reject AbortError sau khi
			// lần bấm mới đã setPlaying — chỉ reset nếu token vẫn là lần hiện hành.
			if (playTokenRef.current === token) {
				setPlaying(null);
			}
		});
	};

	return (
		<div
			data-testid={testIdPrefix}
			role="group"
			aria-label="Phát âm"
			className="flex items-center justify-center gap-2"
		>
			<Button
				type="button"
				variant="outline"
				data-testid={`${testIdPrefix}-normal`}
				disabled={disabled}
				aria-pressed={playing === "normal"}
				aria-label="Nghe phát âm tốc độ bình thường"
				onClick={() => play("normal")}
				className="min-h-11 border-line text-fg aria-pressed:border-hot aria-pressed:text-hot"
			>
				<Volume2Icon aria-hidden />
				Nghe
			</Button>
			<Button
				type="button"
				variant="outline"
				data-testid={`${testIdPrefix}-slow`}
				disabled={disabled}
				aria-pressed={playing === "slow"}
				aria-label="Nghe phát âm tốc độ chậm"
				onClick={() => play("slow")}
				className="min-h-11 border-line text-fg aria-pressed:border-hot aria-pressed:text-hot"
			>
				<SnailIcon aria-hidden />
				Nghe chậm
			</Button>
			{/* biome-ignore lint/a11y/useMediaCaption: phát âm từ vựng đơn lẻ, không có lời thoại để caption. */}
			<audio ref={audioRef} src={src} preload="metadata" className="hidden" />
		</div>
	);
}
