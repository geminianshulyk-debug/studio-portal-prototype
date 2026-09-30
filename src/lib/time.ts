export function countdown(iso: string, now = Date.now()) {
  const ms = new Date(iso.length === 10 ? iso + 'T23:59:00' : iso).getTime() - now;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor((abs % 864e5) / 36e5), m = Math.floor((abs % 36e5) / 6e4);
  const txt = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { late: ms < 0, text: ms < 0 ? `${txt} overdue` : `${txt} left`, urgent: ms < 48 * 36e5 };
}
