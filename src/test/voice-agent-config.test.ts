// @vitest-environment node
import { expect, test } from 'vitest';
import { greeting, timeGreeting, isPublicUrl, DEFAULT_AGENT, businessDemoConfig, voicePreviewInstruction } from '../../supabase/functions/_shared/voice-config';
test('real voice audition speaks the saved business greeting',()=>{
  const opening=greeting({...DEFAULT_AGENT,businessName:'Client Roofing',greeting:'{timeGreeting}, this is {agentName} at {businessName}.'},9);
  expect(voicePreviewInstruction(opening)).toContain('Good morning, this is Aspen at Client Roofing.');
  expect(voicePreviewInstruction(opening)).not.toContain('book appointments');
});
test('greeting uses visitor morning time',()=>expect(timeGreeting(9)).toBe('Good morning'));
test('greeting uses visitor afternoon time',()=>expect(timeGreeting(15)).toBe('Good afternoon'));
test('greeting uses visitor evening time',()=>expect(timeGreeting(20)).toBe('Good evening'));
test('unknown visitor is asked their name',()=>expect(greeting(DEFAULT_AGENT,9)).toContain('What is your name?'));
test('known visitor is not asked their name again',()=>{const g=greeting(DEFAULT_AGENT,15,'Ron');expect(g).toContain('Ron');expect(g).not.toContain('What is your name?');});
test('deep knowledge URL is allowed',()=>expect(isPublicUrl('https://media.p3mediatx.com/815-rio-vista?listing=1')).toBe(true));
test('private literal URL is rejected',()=>expect(isPublicUrl('http://127.0.0.1/secret')).toBe(false));
test('bank simulation does not inherit the platform sales greeting or knowledge',()=>{
  const config=businessDemoConfig('BankUnited','Verified checking account documentation',{...DEFAULT_AGENT,greeting:'Let us set up AI Hidden Leads'});
  expect(greeting(config,9)).toContain('BankUnited');
  expect(greeting(config,9)).not.toContain('Let us set up AI Hidden Leads');
  expect(config.knowledge).toBe('');
  expect(config.sourceKnowledge).toBe('Verified checking account documentation');
});