"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement));
    } catch {
      toast.error("Fullscreen is unavailable in this browser or window.");
    } finally {
      pending.current = false;
    }
  }
  const label = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
  return (
    <Button type="button" variant="outline" size="icon" className="tv-fullscreen-button" onClick={toggle} aria-label={label} title={label} aria-pressed={fullscreen}>
      {fullscreen ? <Minimize /> : <Maximize />}
    </Button>
  );
}
