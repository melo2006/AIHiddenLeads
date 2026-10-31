// Fictional examples demonstrate approved-answer boundaries, not an operating telephone line.
export const PHONE_SIMULATION = {
  business: 'Example Key & Lock',
  hours: 'Monday–Friday, 8 AM–6 PM',
  serviceArea: 'Within 15 miles of the shop',
  scenarios: [
    { id: 'locked-out', label: 'Locked out', caller: 'I’m locked out of my house. Can someone come now?', reply: 'I can take your location and callback number for the locksmith. I can’t confirm an arrival time until the team accepts the request. Is anyone in immediate danger? If so, contact emergency services first.' },
    { id: 'keys', label: 'Keys & parts', caller: 'Can you copy a car key, and how much is it?', reply: 'Which make, model and year is the vehicle? The team needs those details to confirm the key type, stock and price. I won’t quote a price that hasn’t been approved.' },
    { id: 'hours', label: 'Opening hours', caller: 'When can I come to the shop?', reply: 'Our example shop is open Monday through Friday, 8 AM to 6 PM. Would you like me to take a message about the service you need? This demonstration does not make a real booking.' },
  ],
} as const;