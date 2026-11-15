// Voice-asked manager transfer (Batch 1, 2026-11-12): the Gemini Live
// proxy declares a `request_manager_transfer` tool on exactly the
// sessions gemini-session issues a browser-handoff capability for
// (a valid saved transfer destination, not a preview, not a share), so
// a visitor who ASKS Aspen for a manager / the owner / a real person
// gets the same live handoff the on-screen Manager button starts.
// The proxy answers the tool with the announcement built here and, a
// few seconds later (so the spoken line lands first), tells the
// browser to begin the handoff leg. The destination itself never
// comes from the model or the visitor — it stays the saved
// config.transferPhone destination behind transferDestination().

/** Delay between the tool answer and the {type:'start_handoff'}
 *  client message, so Aspen's spoken announcement lands before the
 *  browser leg starts and pauses her audio. */
export const MANAGER_HANDOFF_DELAY_MS = 4000;

/** Setup instruction appended ONLY when the transfer tool is declared
 *  (the proxy adds it conditionally, so sessions without the tool keep
 *  a byte-identical system prompt).
 *
 *  Hardening (booking-gate fix, 2026-11-14): the tool WAS declared in
 *  live session 19b82691, yet the model refused a bundled "transfer
 *  me or book me" ask — it answered only the appointment half and
 *  deflected that to the /book page. The added sentences make an
 *  explicit transfer request a direct order to call the tool first,
 *  forbid claiming she cannot transfer while the tool is available,
 *  and sequence bundled asks transfer-first. The original safeguards
 *  are unchanged: never call unprompted, never claim success before
 *  the tool result, and the button/callback fallback when the tool
 *  is absent. */
export const MANAGER_TRANSFER_POLICY = `MANAGER TRANSFER TOOL: When the visitor asks to speak to a manager, the owner, or a real person, call request_manager_transfer. Say the announcement the tool result returns, exactly once, and then stop talking while the transfer connects. The announcement itself tells the visitor you will stay right here until they are through and then step away — do not repeat that promise in other words, and never say you have stepped away, or that anyone has answered, before the handoff actually connects. Never claim the transfer has happened, or that anyone has answered, before the tool succeeds. An explicit request to speak to a manager, the owner, or a real person is a direct instruction, not a preference to discuss: when request_manager_transfer is available in this session, you MUST call it before offering anything else — never say you cannot transfer, cannot connect them, or that no manager is available, and never substitute a booking, a callback or a web page for the transfer they asked for. If the visitor bundles a transfer request with another request in the same ask, handle the transfer FIRST — call request_manager_transfer and say its announcement — and only then address the other request, as far as you still can once the transfer is under way. If request_manager_transfer is not available in this session, do not promise a live transfer — offer the on-screen Manager button instead, and if there is no button either, take their name and number for a callback. A TRANSFER REQUEST OUTRANKS EVERY FAREWELL (Publish #63, 2026-11-15): it is never answered with a closing line, a goodbye, or a session wrap-up — if any closing or farewell instruction also seems to apply, the transfer wins and is handled first. A visitor who repeats a transfer request, or answers anything that sounded like a sign-off by asking again for a person, is still asking for the transfer: call the tool then.`;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The announcement Aspen says as the transfer starts, aware of the
 * business she is answering for:
 *  - config.transferRole, when a non-empty string, names the role
 *    ("the owner", "a sales director") and wins over everything else.
 *  - A realtor-landing session transfers to "a realtor".
 *  - config.transferManagerName, when it is a real name rather than
 *    the placeholder 'the manager', is the person being dialed.
 *  - Otherwise the generic "the manager".
 * The business name rides along as "from {businessName}" whenever the
 * session config carries one.
 *
 * Handoff improvement batch (2026-11-12, Ron's design): the
 * announcement carries a second sentence — she STAYS until the
 * connection is through, then steps away so the visitor talks to
 * the person directly. It rides inside the announcement (said once,
 * word for word, per the tool-result instruction) rather than as a
 * separate line, so the say-it-once + stop-talking contract and the
 * 4s handoff-start timing are unchanged.
 */
export function managerTransferAnnouncement(config: Record<string, unknown>): string {
  const role = clean(config.transferRole);
  const managerName = clean(config.transferManagerName);
  const businessName = clean(config.businessName);
  const from = businessName ? ` from ${businessName}` : '';
  const stay = (target: string) => `I'll transfer you to ${target}${from} now. I'll stay right here until you're through — then I'll step away, and you can talk to ${target} directly.`;
  if (role) return stay(role);
  if (config.realtorLanding) return stay('a realtor');
  if (managerName && managerName !== 'the manager') return stay(managerName);
  return stay('the manager');
}
