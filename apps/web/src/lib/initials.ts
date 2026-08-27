/** Sidebar/profile initials: last one or two name words, uppercase. */
export function initialsFromName(displayName: string): string {
	if (!displayName.trim()) return "GV";
	return (
		displayName
			.trim()
			.split(/\s+/)
			.slice(-2)
			.map((part) => part[0])
			.join("")
			.toUpperCase() || "GV"
	);
}
