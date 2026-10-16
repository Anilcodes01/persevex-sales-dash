"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSalesLive } from "../../hooks/use-sales-live";

type SoundKind = "sale_submitted" | "payment_received";
const FILES: Record<SoundKind,string> = {
  sale_submitted: "/sounds/mixkit-software-interface-back-2575.wav",
  payment_received: "/sounds/mixkit-page-forward-single-chime-1107.wav",
};
const noop=() => {};
const refresh=async () => true;

export function SalesSoundControl({ accountId, floating = false }: { accountId: string; floating?: boolean }) {
  const [enabled,setEnabled]=useState(false);
  const [loading,setLoading]=useState(false);
  const [volume,setVolume]=useState(25);
  const audio=useRef<AudioContext | null>(null);
  const gain=useRef<GainNode | null>(null);
  const buffers=useRef<Partial<Record<SoundKind,AudioBuffer>>>({});
  const active=useRef<AudioBufferSourceNode | null>(null);
  const queue=useRef<SoundKind[]>([]);
  const allowed=useRef(false);
  const lastVersion=useRef(-1);
  const mounted=useRef(true);
  const advance=useRef<() => void>(() => {});
  useEffect(() => {
    mounted.current=true;
    return () => { mounted.current=false; allowed.current=false; queue.current=[]; active.current?.stop(); void audio.current?.close(); audio.current=null; };
  },[]);
  const pump=useCallback(() => {
    if(!allowed.current || active.current || !audio.current || !gain.current) return;
    if(audio.current.state !== "running") { queue.current=[]; return; }
    const kind=queue.current.shift(); if(!kind) return;
    const buffer=buffers.current[kind]; if(!buffer) return;
    const source=audio.current.createBufferSource(); source.buffer=buffer; source.connect(gain.current);
    active.current=source;
    source.onended=() => { source.disconnect(); if(active.current===source) active.current=null; advance.current(); };
    source.start();
  },[]);
  useEffect(() => { advance.current=pump; },[pump]);
  const notify=useCallback((kind: SoundKind, version: number) => {
    if(version<=lastVersion.current) return;
    lastVersion.current=version;
    if(!allowed.current || queue.current.length>=4) return;
    queue.current.push(kind); pump();
  },[pump]);
  useSalesLive({accountId,refresh,onAccessChanged:noop,onConnected:noop,onSessionExpired:() => {
    allowed.current=false; queue.current=[]; active.current?.stop(); setEnabled(false);
  },onNotification:notify});
  async function toggle() {
    if(loading) return;
    if(allowed.current) { allowed.current=false; queue.current=[]; active.current?.stop(); setEnabled(false); return; }
    setLoading(true);
    try {
      const context=audio.current ?? new AudioContext(); audio.current=context;
      // Resume within the click gesture before awaiting file downloads.
      await context.resume();
      if(!gain.current || gain.current.context!==context) { gain.current=context.createGain(); gain.current.connect(context.destination); }
      gain.current.gain.value=volume/100;
      await Promise.all((Object.keys(FILES) as SoundKind[]).map(async kind => {
        if(buffers.current[kind]) return;
        const response=await fetch(FILES[kind]); if(!response.ok) throw new Error("Sound file could not be loaded.");
        buffers.current[kind]=await context.decodeAudioData(await response.arrayBuffer());
      }));
      if(!mounted.current) return;
      queue.current=[]; allowed.current=true; setEnabled(true);
    } catch { if(mounted.current) toast.error("Could not enable sound. Try clicking Enable sound again."); }
    finally { if(mounted.current) setLoading(false); }
  }
  return <div className={`sales-sound-control ${floating ? "tv-sound-control" : ""}`}>
    <Button type="button" variant="outline" size="icon" disabled={loading} aria-label={enabled ? "Mute sale sounds" : "Enable sale sounds"} title={enabled ? "Mute sale sounds" : "Enable sale sounds"} aria-pressed={enabled} onClick={() => void toggle()}>{enabled ? <Volume2 /> : <VolumeX />}</Button>
    {enabled && <input type="range" min="0" max="100" value={volume} aria-label="Sale sound volume" onChange={event => { const value=Number(event.target.value); setVolume(value); if(gain.current) gain.current.gain.value=value/100; }} />}
  </div>;
}
