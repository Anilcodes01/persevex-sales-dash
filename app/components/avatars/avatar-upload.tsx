"use client";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { EmployeeAvatar } from "./employee-avatar";

export function AvatarUpload({ accountId, name }: { accountId: string; name: string }) {
  const id=useId();
  const input=useRef<HTMLInputElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const image=useRef<ImageBitmap | null>(null);
  const serial=useRef(0);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [crop,setCrop]=useState<PercentCrop>({unit:"%",x:0,y:0,width:100,height:100});
  const [source,setSource]=useState<{url:string;width:number;height:number} | null>(null);
  useEffect(() => () => { serial.current++; image.current?.close(); },[]);
  useEffect(() => {
    const bitmap=image.current, context=canvas.current?.getContext("2d");
    if(!bitmap || !context || !ready) return;
    context.clearRect(0,0,256,256);
    context.drawImage(bitmap,bitmap.width*crop.x/100,bitmap.height*crop.y/100,bitmap.width*crop.width/100,bitmap.height*crop.height/100,0,0,256,256);
  },[ready,crop]);
  function cancel() { serial.current++; image.current?.close(); image.current=null; setReady(false); setSource(null); if(input.current) input.current.value=""; }
  async function select(file?: File) {
    if(!file) return;
    const request=++serial.current;
    try {
      if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024) throw new Error("Choose a JPG, PNG or WebP under 5 MB.");
      const bitmap=await createImageBitmap(file);
      if(request!==serial.current) { bitmap.close(); return; }
      if(bitmap.width>12000 || bitmap.height>12000) { bitmap.close(); throw new Error("Choose an image under 12,000 pixels per side."); }
      const preview=document.createElement("canvas");
      const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
      preview.width=Math.max(1,Math.round(bitmap.width*scale));
      preview.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=preview.getContext("2d");
      if(!context) { bitmap.close(); throw new Error("Image processing is unavailable."); }
      context.drawImage(bitmap,0,0,preview.width,preview.height);
      image.current?.close(); image.current=bitmap;
      setSource({url:preview.toDataURL("image/png"),width:preview.width,height:preview.height});
      setCrop(centerCrop(makeAspectCrop({unit:"%",width:90},1,bitmap.width,bitmap.height),bitmap.width,bitmap.height));
      setReady(true);
    } catch(error) { toast.error(error instanceof Error ? error.message : "Could not open image"); }
  }
  async function save(remove=false) {
    setBusy(true);
    try {
      const body=remove ? undefined : await new Promise<Blob>((resolve,reject) => canvas.current?.toBlob(blob => blob && blob.size<=256*1024 ? resolve(blob) : reject(new Error("Could not crop photo")),"image/png"));
      const response=await fetch(`/api/employee/avatar?accountId=${encodeURIComponent(accountId)}${remove ? "&remove=true" : ""}`,{method:"POST",credentials:"same-origin",headers:remove ? undefined : {"Content-Type":"image/png"},body});
      if(!response.ok) { const result=await response.json(); throw new Error(result.error || "Could not save photo"); }
      window.dispatchEvent(new CustomEvent("avatar-updated",{detail:accountId})); cancel(); toast.success(remove ? "Photo removed." : "Photo saved.");
    } catch(error) { toast.error(error instanceof Error ? error.message : "Could not save photo"); }
    finally { setBusy(false); }
  }
  return <section className="avatar-upload-control" aria-label={`Profile photo for ${name}`}>
    <input id={id} ref={input} type="file" className="sr-only" tabIndex={-1} accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void select(event.target.files?.[0])} />
    <Button type="button" variant="ghost" className="avatar-upload-circle" disabled={busy} aria-label="Choose profile photo" onClick={() => input.current?.click()}>
      <span className="avatar-upload-photo" hidden={ready}><EmployeeAvatar accountId={accountId} name={name} /></span>
      <canvas ref={canvas} width={256} height={256} hidden={!ready} aria-label="Cropped photo preview" />
      <span className="avatar-camera-badge"><Camera size={18} /></span>
    </Button>
    <div className="avatar-upload-caption"><strong>Profile photo</strong><p>Click the photo to upload. JPG, PNG or WebP · up to 5 MB.</p></div>
    {ready && <WorkspaceDialog title="Crop profile photo" description="Drag and resize the circle to frame your photo." locked={busy} onClose={cancel} className="avatar-crop-dialog">
    <div className="avatar-crop-controls">
      <p>Drag the circle to position your photo. Drag its edges to resize the crop.</p>
      {source && <div className="avatar-library-cropper"><ReactCrop crop={crop} onChange={(_,percent) => setCrop(percent)} aspect={1} circularCrop keepSelection minWidth={24} minHeight={24} disabled={busy}>
        <Image unoptimized src={source.url} width={source.width} height={source.height} alt="Drag to crop your profile photo" draggable={false} />
      </ReactCrop></div>}
      <div className="avatar-crop-actions"><Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancel crop</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save photo"}</Button></div>
    </div>
    </WorkspaceDialog>}
    {!ready && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(true)}>Remove photo</Button>}
    <small>Photo changes are saved separately from account details.</small>
  </section>;
}
