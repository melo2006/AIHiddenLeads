import { useEffect, useRef, useState } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { PhoneForwarded, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

async function request(action: string, handoffToken: string) {
  const {data,error}=await supabase.functions.invoke('browser-voice-handoff',{body:{action,handoffToken}});
  if(error){const detail=error instanceof FunctionsHttpError?await error.context.json().catch(()=>null):null;throw new Error(detail?.error||error.message);}
  return data;
}
export default function BrowserVoiceHandoff({token,onActive,onEnded,microphone,pill=false,startSignal=0}:{token:string;onActive:(active:boolean)=>void;onEnded?:(outcome:'completed'|'unavailable')=>void;microphone:string;pill?:boolean;startSignal?:number}){
 const [status,setStatus]=useState(''),[active,setActive]=useState(false),[used,setUsed]=useState(false);
 const device=useRef<Device|null>(null),call=useRef<Call|null>(null),timer=useRef<ReturnType<typeof setInterval>>(),generation=useRef(0),callback=useRef(onActive),polling=useRef(false),ended=useRef(onEnded),joined=useRef(false);
 callback.current=onActive;ended.current=onEnded;
 const cleanup=()=>{clearInterval(timer.current);timer.current=undefined;call.current?.removeAllListeners();call.current?.disconnect();call.current=null;device.current?.destroy();device.current=null;};
 // Handoff improvement batch (2026-11-12): finish() also reports the
 // terminal OUTCOME up — before onActive(false) — so the voice
 // session's come-back can tell a completed manager call from a
 // no-answer/error instead of the old outcome-blind welcome-back.
 // 'completed' is reported only for the row's terminal 'completed'
 // status, or when the visitor returns after the call had joined.
 const finish=(message:string,outcome?:'completed'|'unavailable')=>{generation.current++;cleanup();setActive(false);setStatus(message);if(outcome)ended.current?.(outcome);callback.current(false);};
 useEffect(()=>()=>{generation.current++;cleanup();void request('cancel',token).catch(()=>{});},[token]);
 async function begin(){
  if(active||used)return;
  const run=++generation.current;
  setActive(true);setStatus('Connecting to manager…');callback.current(true);
  try{
   const data=await request('token',token);if(run!==generation.current)return;
   const d=new Device(data.token,{closeProtection:true});device.current=d;
   const fail=()=>{void request('cancel',token).catch(()=>{});finish('Connection interrupted — back with Aspen.','unavailable');};
   d.on('error',fail);
   if(microphone!=='default')await d.audio.setInputDevice(microphone);
   const c=await d.connect({params:{handoffToken:token}});
   if(run!==generation.current){c.disconnect();return;}
   call.current=c;setUsed(true);setStatus("Calling manager — Aspen stays with you until you're through.");
   const poll=async()=>{
    if(polling.current||run!==generation.current)return;polling.current=true;
    try{
     const result=await request('status',token);if(run!==generation.current)return;
     if(['failed','cancelled','completed'].includes(result.status)){finish(result.status==='completed'?'Manager call ended — back with Aspen.':'No manager available — back with Aspen.',result.status==='completed'?'completed':'unavailable');return;}
     if(result.status==='joined')joined.current=true;
     setStatus(result.status==='joined'?'Connected to manager':result.status==='awaiting_owner'?'Manager is reviewing your request…':"Calling manager — Aspen stays with you until you're through.");
    }catch{if(run===generation.current)fail();}finally{polling.current=false;}
   };
   c.on('error',fail);
   c.on('disconnect',()=>{void poll();});
   timer.current=setInterval(()=>void poll(),1500);void poll();
  }catch(e){if(run===generation.current)finish(e instanceof Error?e.message:'Could not connect — back with Aspen.','unavailable');}
 }
 // Voice-asked transfer (Batch 1, 2026-11-12): the server sends a
 // {type:'start_handoff'} WS message a few seconds after Aspen announces
 // the transfer; GeminiConversation counts those into startSignal. A NEW
 // positive value auto-starts the same begin() the pill tap runs (begin
 // itself guards active/used). The mount-time value is latched into the
 // ref, so mounting or re-rendering with an already-counted signal can
 // never fire a dial on its own.
 const lastStartSignal=useRef(startSignal);
 useEffect(()=>{
  if(startSignal===lastStartSignal.current)return;
  lastStartSignal.current=startSignal;
  if(startSignal>0)void begin();
 // begin() reads only refs + state setters + the current token/microphone
 // props; the signal change is the one trigger this effect answers to.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[startSignal]);
 // Pill variant (caption-panel rearrangement, 2026-11-11; moved in
 // Batch 1, 2026-11-12): the transfer lives in the Voice/Type toggle row
 // as a compact phone-icon + "Manager" pill instead of its own full-width
 // row. Same begin/cancel actions, same visibility (the parent still
 // gates on live phase + token). The toggle row hosts the pill in a
 // right-aligned flex column, so the status line hangs under the pill,
 // right-aligned and wrapping inside that zone — NOT a full-width
 // centered line (that shape belonged to the old flex-wrap controls row
 // and would stretch the toggle row). The visible label is a bare text
 // node, not a <span>, so small-viewport span rules elsewhere can never
 // shrink or hide it.
 // Button state colours (2026-11-14, Ron-approved spec): while a manager
 // handoff is ACTIVE the pill wears the green ON fill ("Return to Aspen" =
 // a live manager call is in progress); idle is the neutral near-black
 // outline with a dark-grey hover wash (.aspen-panel-btn keeps touch free
 // of the old sticky violet hover).
 if(pill)return <>
  {active?<Button size="sm" variant="default" className="aspen-manager-pill !flex-row !min-h-11 !px-3 rounded-full" onClick={()=>{void request('cancel',token).catch(()=>{});finish('Back with Aspen.',joined.current?'completed':'unavailable');}} aria-label="Return to Aspen"><RotateCcw className="mr-1 h-4 w-4"/>Return to Aspen</Button>:!used&&<Button size="sm" variant="outline" className="aspen-manager-pill aspen-panel-btn !flex-row !min-h-11 !px-3 rounded-full hover:bg-muted hover:text-foreground" onClick={()=>void begin()} aria-label="Talk to manager"><PhoneForwarded className="mr-1 h-4 w-4"/>Manager</Button>}
  {status&&<p role="status" className="max-w-full break-words text-right text-xs text-muted-foreground">{status}</p>}
 </>;
 return <div className="space-y-1 border-t border-border pt-2">
  {active?<Button size="sm" variant="default" onClick={()=>{void request('cancel',token).catch(()=>{});finish('Back with Aspen.',joined.current?'completed':'unavailable');}} aria-label="Return to Aspen"><RotateCcw className="mr-1 h-4 w-4"/>Return to Aspen</Button>:!used&&<Button size="sm" variant="outline" className="aspen-panel-btn hover:bg-muted hover:text-foreground" onClick={()=>void begin()} aria-label="Talk to manager"><PhoneForwarded className="mr-1 h-4 w-4"/>Talk to manager</Button>}
  {status&&<p role="status" className="break-words text-xs text-muted-foreground">{status}</p>}
 </div>;
}