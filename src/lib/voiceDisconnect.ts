export function voiceDisconnectMessage(code:number,reason:string) {
  if(reason==='silence_timeout') return 'Conversation ended after the silence check-in. You can start again whenever you are ready.';
  if(reason==='time_limit') return 'Voice time limit reached. You can start another conversation.';
  return `Voice connection ended${code ? ` (code ${code})` : ''}. Your page is still available. Press Talk to reconnect.`;
}