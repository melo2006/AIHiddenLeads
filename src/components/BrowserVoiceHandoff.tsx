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
export default function BrowserVoiceHandoff({token,onActive,microphone,pill=false}:{token:string;onActive:(active:boolean)=>void;microphone:string;pill?:boolean}){
 const [status,setStatus]=useState(''),[active,setActive]=useState(false),[used,setUsed]=useState(false);
 const device=useRef<Device|null>(null),call=useRef<Call|null>(null),timer=useRef<ReturnType<typeof setInterval>>(),generation=useRef(0),callback=useRef(onActive),polling=useRef(false);
 callback.current=onActive;
 const cleanup=()=>{clearInterval(timer.current);timer.current=undefined;call.current?.removeAllListeners();call.current?.disconnect();call.current=null;device.current?.destroy();device.current=null;};
 const finish=(message:string)=>{generation.current++;cleanup();setActive(false);setStatus(message);callback.current(false);};
 useEffect(()=>()=>{generation.current++;cleanup();void request('cancel',token).catch(()=>{});},[token]);
 async function begin(){
  if(active||used)return;
  const run=++generation.current;
  setActive(true);setStatus('Connecting to manager…');callback.current(true);
  try{
   const data=await request('token',token);if(run!==generation.current)return;
   const d=new Device(data.token,{closeProtection:true});device.current=d;
   const fail=()=>{void request('cancel',token).catch(()=>{});finish('Connection interrupted — back with Aspen.');};
   d.on('error',fail);
   if(microphone!=='default')await d.audio.setInputDevice(microphone);
   const c=await d.connect({params:{handoffToken:token}});
   if(run!==generation.current){c.disconnect();return;}
   call.current=c;setUsed(true);setStatus('Calling manager — please stay here.');
   const poll=async()=>{
    if(polling.current||run!==generation.current)return;polling.current=true;
    try{
     const result=await request('status',token);if(run!==generation.current)return;
     if(['failed','cancelled','completed'].includes(result.status)){finish(result.status==='completed'?'Manager call ended — back with Aspen.':'No manager available — back with Aspen.');return;}
     setStatus(result.status==='joined'?'Connected to manager':result.status==='awaiting_owner'?'Manager is reviewing your request…':'Calling manager — please stay here.');
    }catch{if(run===generation.current)fail();}finally{polling.current=false;}
   };
   c.on('error',fail);
   c.on('disconnect',()=>{void poll();});
   timer.current=setInterval(()=>void poll(),1500);void poll();
  }catch(e){if(run===generation.current)finish(e instanceof Error?e.message:'Could not connect — back with Aspen.');}
 }
 // Pill variant (caption-panel rearrangement, 2026-11-11): the transfer
 // lives INSIDE the voice control row as a compact phone-icon + "Manager"
 // pill instead of its own full-width row. Same begin/cancel actions,
 // same visibility (the parent still gates on live phase + token); the
 // status line wraps onto its own line under the row (w-full inside the
 // row's flex-wrap container). The visible label is a bare text node, not
 // a <span>, so the control row's "[&_span]:text-[10px]" label shrink and
 // its small-viewport span-hiding rule can never shrink or hide it.
 if(pill)return <>
  {active?<Button size="sm" variant="outline" className="aspen-manager-pill !flex-row !min-h-11 !px-3 rounded-full" onClick={()=>{void request('cancel',token).catch(()=>{});finish('Back with Aspen.');}} aria-label="Return to Aspen"><RotateCcw className="mr-1 h-4 w-4"/>Return to Aspen</Button>:!used&&<Button size="sm" variant="outline" className="aspen-manager-pill !flex-row !min-h-11 !px-3 rounded-full" onClick={()=>void begin()} aria-label="Talk to manager"><PhoneForwarded className="mr-1 h-4 w-4"/>Manager</Button>}
  {status&&<p role="status" className="w-full break-words text-center text-xs text-muted-foreground">{status}</p>}
 </>;
 return <div className="space-y-1 border-t border-border pt-2">
  {active?<Button size="sm" variant="outline" onClick={()=>{void request('cancel',token).catch(()=>{});finish('Back with Aspen.');}} aria-label="Return to Aspen"><RotateCcw className="mr-1 h-4 w-4"/>Return to Aspen</Button>:!used&&<Button size="sm" variant="outline" onClick={()=>void begin()} aria-label="Talk to manager"><PhoneForwarded className="mr-1 h-4 w-4"/>Talk to manager</Button>}
  {status&&<p role="status" className="break-words text-xs text-muted-foreground">{status}</p>}
 </div>;
}