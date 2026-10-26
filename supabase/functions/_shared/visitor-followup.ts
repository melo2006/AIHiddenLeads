export const CONTACT_READBACK_POLICY = `CONTACT CONFIRMATION POLICY (overrides older contact instructions): Before requesting platform follow-up, ask the visitor to spell their first and last name, even when supplied on the form. Read the name spelling back letter by letter at a brisk but intelligible pace, and ask if correct. Spell the email address back, saying at, dot, hyphen and underscore explicitly. Read the phone number digit by digit if offered; never require an optional phone. Wait for the visitor's verbal confirmation or corrections; do not infer agreement from silence. Correct and repeat any changed details before continuing. Then show the on-screen confirmation so the visitor can check what they heard and explicitly consent. Verbal approval alone never saves details, and a button click never replaces the verbal readback. Never claim saving succeeded before the successful tool result.`;

export function contactReadback(contact: { name: string; email: string; phone: string }) {
  return {
    name: contact.name.trim().split(/\s+/).map(part => Array.from(part).join(' - ')).join(' / '),
    email: Array.from(contact.email.trim()).map(char => ({ '@': 'at', '.': 'dot', '-': 'hyphen', '_': 'underscore' }[char] || char)).join(' '),
    phone: Array.from(contact.phone).filter(char => /\d/.test(char)).join(' '),
  };
}

export function confirmedVisitorContact(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Confirm your contact details first.');
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
  const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
  if (v.consent !== true || !name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || phone.length > 30 || (phone && !/^\+?[\d ()-]{7,30}$/.test(phone))) throw new Error('Confirm your name, valid email and optional phone, and allow follow-up.');
  return { name, email, phone };
}