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
 *  a byte-identical system prompt). */
export const MANAGER_TRANSFER_POLICY = `MANAGER TRANSFER TOOL: When the visitor asks to speak to a manager, the owner, or a real person, call request_manager_transfer. Say the announcement the tool result returns, exactly once, and then stop talking while the transfer connects. Never claim the transfer has happened, or that anyone has answered, before the tool succeeds. If request_manager_transfer is not available in this session, do not promise a live transfer — offer the on-screen Manager button instead, and if there is no button either, take their name and number for a callback.`;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The one short line Aspen says as the transfer starts, aware of the
 * business she is answering for:
 *  - config.transferRole, when a non-empty string, names the role
 *    ("the owner", "a sales director") and wins over everything else.
 *  - A realtor-landing session transfers to "a realtor".
 *  - config.transferManagerName, when it is a real name rather than
 *    the placeholder 'the manager', is the person being dialed.
 *  - Otherwise the generic "the manager".
 * The business name rides along as "from {businessName}" whenever the
 * session config carries one.
 */
export function managerTransferAnnouncement(config: Record<string, unknown>): string {
  const role = clean(config.transferRole);
  const managerName = clean(config.transferManagerName);
  const businessName = clean(config.businessName);
  const from = businessName ? ` from ${businessName}` : '';
  if (role) return `I'll transfer you to ${role}${from} now.`;
  if (config.realtorLanding) return `I'll transfer you to a realtor${from} now.`;
  if (managerName && managerName !== 'the manager') return `I'll transfer you to ${managerName}${from} now.`;
  return `I'll transfer you to the manager${from} now.`;
}
