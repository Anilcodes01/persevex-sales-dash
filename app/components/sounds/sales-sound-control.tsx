"use client";
import "./sales-sound-control.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useSalesLive } from "../../hooks/use-sales-live";

type SoundKind = "sale_submitted" | "payment_received";
const FILES: Record<SoundKind,string> = {
  sale_submitted: "/sounds/mixkit-software-interface-back-2575.wav",
  payment_received: "/sounds/mixkit-page-forward-single-chime-1107.wav",
};
const noop=() => {};
const refresh=async () => true;

export function SalesSoundControl({ accountId, floating = false, expanded = false }: { accountId: string; floating?: boolean; expanded?: boolean }) {
  const [volume,setVolume]=useState(0);
  const desiredVolume=useRef(0);
  const previousVolume=useRef(25);
  const initializing=useRef<Promise<void> | null>(null);
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
    allowed.current=false; queue.current=[]; active.current?.stop(); desiredVolume.current=0; setVolume(0);
  },onNotification:notify});
  async function changeVolume(value: number) {
    if(value>0) previousVolume.current=value;
    desiredVolume.current=value;
    setVolume(value);
    if(gain.current) gain.current.gain.value=value/100;
    if(value===0) {
      allowed.current=false;
      queue.current=[];
      active.current?.stop();
      return;
    }
    try {
      if(!initializing.current) {
        initializing.current=(async () => {
          const context=audio.current ?? new AudioContext();
          audio.current=context;
          // Resume while handling the slider gesture, before loading audio files.
          await context.resume();
          if(!mounted.current || audio.current!==context) return;
          if(!gain.current || gain.current.context!==context) {
            gain.current=context.createGain();
            gain.current.connect(context.destination);
          }
          gain.current.gain.value=desiredVolume.current/100;
          await Promise.all((Object.keys(FILES) as SoundKind[]).map(async kind => {
            if(buffers.current[kind]) return;
            const response=await fetch(FILES[kind]);
            if(!response.ok) throw new Error("Sound file could not be loaded.");
            const buffer=await context.decodeAudioData(await response.arrayBuffer());
            if(mounted.current && audio.current===context) buffers.current[kind]=buffer;
          }));
        })().finally(() => { initializing.current=null; });
      }
      await initializing.current;
      if(!mounted.current) return;
      if(gain.current) gain.current.gain.value=desiredVolume.current/100;
      allowed.current=desiredVolume.current>0;
    } catch {
      if(mounted.current && desiredVolume.current>0) {
        allowed.current=false;
        desiredVolume.current=0;
        setVolume(0);
        toast.error("Could not enable sound. Move the volume slider up to try again.");
      }
    }
  }
  return <div className={`sales-sound-control group flex items-center ${floating ? "tv-sound-control" : ""}`}>
    <button
      type="button"
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={volume>0 ? "Mute notification sounds" : "Unmute notification sounds"}
      title={volume>0 ? "Mute" : "Unmute"}
      onClick={() => { void changeVolume(volume>0 ? 0 : previousVolume.current); }}
    >
      {volume>0 ? <Volume2 className="size-5" aria-hidden="true" /> : <VolumeX className="size-5" aria-hidden="true" />}
    </button>
    <div className={`flex w-0 items-center overflow-hidden opacity-0 transition-all duration-150 group-hover:w-24 group-hover:opacity-100 group-focus-within:w-24 group-focus-within:opacity-100 motion-reduce:transition-none ${expanded ? "" : "max-w-20"}`}>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={volume}
      aria-label="Sale and payment notification volume"
      aria-valuetext={volume===0 ? "Muted" : `${volume} percent`}
      title={volume===0 ? "Muted — increase volume to enable sounds" : `Notification volume: ${volume}%`}
      className="w-20 shrink-0 cursor-pointer accent-primary"
      style={{ background: `linear-gradient(to right, currentColor ${volume}%, color-mix(in srgb, currentColor 30%, transparent) ${volume}%)` }}
      onChange={event => { void changeVolume(Number(event.target.value)); }}
    />
    </div>
  </div>;
}
