/** Moments and durations as files, commands and the editor write them. */

const UNITS = new Map<string, number>([["s", 1], ["m", 60], ["h", 3600], ["d", 86400], ["w", 604800]]);

/** Seconds in `30d`, `12h`, `90m`, `45s`, `2w`; -1 for anything else. */
export function durationSeconds(text: string) {
	const unit = UNITS.get(text.substring(text.length - 1).toLowerCase()) ?? 0;
	const amount = Number(text.substring(0, text.length - 1));
	if (unit == 0 || text.length < 2 || isNaN(amount) || amount <= 0) return -1;
	return amount * unit;
}

/** `2026-12-01`, `2026-12-01T00:00`, `2026-12-01T00:00:00Z` (UTC) as ms since 1970; 0 for empty or unreadable text. */
export function momentOf(text: string) {
	const date = text.trim().replace(" ", "T").replace("Z", "");
	const halves = `${date}T00:00`.split("T");
	const parts = halves[0].split("-");
	const clock = halves[1].split(":");
	if (parts.length != 3 || clock.length < 2) return 0;

	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const dayOfMonth = Number(parts[2]);
	const hours = Number(clock[0]);
	const minutes = Number(clock[1]);
	const seconds = clock.length > 2 ? Number(clock[2]) : 0;
	if ([year, month, dayOfMonth, hours, minutes, seconds].some(value => isNaN(value))) return 0;
	return Date.UTC(year, month - 1, dayOfMonth, hours, minutes, Math.floor(seconds));
}

/** A moment as the file and the editor write it, `2026-12-01T00:00:00Z`; "" for 0. */
export function textOf(moment: number) {
	if (moment == 0) return "";
	return `${new Date(moment).toISOString().substring(0, 19)}Z`;
}

/** What is left of a moment, for the console: `29d 4h`, `3h 10m`, `5m`; "" for 0. */
export function leftOf(moment: number, now: number) {
	if (moment == 0) return "";

	const seconds = Math.max(0, Math.floor((moment - now) / 1000));
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}
