export function confirmedVisitorContact(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Confirm your contact details first.');
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
  const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
  if (v.consent !== true || !name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || phone.length > 30 || (phone && !/^\+?[\d ()-]{7,30}$/.test(phone))) throw new Error('Confirm your name, valid email and optional phone, and allow follow-up.');
  return { name, email, phone };
}