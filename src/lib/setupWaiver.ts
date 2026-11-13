/**
 * Setup-fee waiver date (Ron's decision, 2026-11-13): the $199 setup fee
 * is waived through the LAST DAY OF THE CURRENT MONTH, renewed month by
 * month. The date is computed at render time from the viewer's clock so
 * the printed deadline can never go stale — on the 1st it rolls to the
 * new month's last day on its own. Voice/agent facts never carry the
 * hard date; they say "waived through the end of the month".
 */

/** Last day of the month containing `now` (local time), as a Date at local midnight. */
export function setupWaiverEndDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

/** "November 30" / "30 de noviembre" / "30 de novembro", per locale. */
export function formatSetupWaiverEnd(locale: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(
    setupWaiverEndDate(now),
  );
}
