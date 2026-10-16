import { HttpError } from "../http/helpers";
export const MAX_AVATAR_BYTES = 256 * 1024;
// Only normalized, non-animated 256px PNGs. No SVG, metadata or embedded files.
export async function validateAvatar(bytes: Uint8Array) {
  const fail = () => { throw new HttpError(400, "Upload a valid 256 × 256 PNG avatar"); };
  if (bytes.length < 45 || bytes.length > MAX_AVATAR_BYTES) fail();
  const signature = [137,80,78,71,13,10,26,10];
  if (!signature.every((v,i) => bytes[i] === v)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, seenHeader = false, ended = false, channels = 0;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) fail();
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(offset+4, offset+8+length)) {
      crc ^= byte;
      for (let bit=0; bit<8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset+8+length)) fail();
    const type = String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if (!seenHeader && type !== "IHDR") fail();
    if (type === "IHDR") {
      if (seenHeader || length !== 13 || view.getUint32(offset+8) !== 256 || view.getUint32(offset+12) !== 256) fail();
      if (bytes[offset+16] !== 8 || ![2,6].includes(bytes[offset+17]) || bytes[offset+18] || bytes[offset+19] || bytes[offset+20]) fail();
      channels = bytes[offset+17] === 6 ? 4 : 3;
      seenHeader = true;
    } else if (type === "IDAT") compressed.push(bytes.slice(offset+8,offset+8+length));
    else if (type === "IEND") { if (length || !compressed.length) fail(); ended = true; offset += 12; break; }
    else if (!((type === "sRGB" && length === 1) || (type === "gAMA" && length === 4) || (type === "cHRM" && length === 32) || (type === "pHYs" && length === 9))) fail();
    offset += length + 12;
  }
  if (!ended || offset !== bytes.length) fail();
  const packed = new Uint8Array(compressed.reduce((n,c) => n+c.length,0));
  let pos=0; for (const chunk of compressed) { packed.set(chunk,pos); pos+=chunk.length; }
  try {
    const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    const expected = 256*(256*channels+1);
    let total=0;
    for (;;) {
      const { done,value } = await reader.read();
      if (done) break;
      for (let index=0; index<value.length; index++) {
        if ((total+index) % (256*channels+1) === 0 && value[index] > 4) { await reader.cancel(); fail(); }
      }
      total+=value.length;
      if (total>expected) { await reader.cancel(); fail(); }
    }
    if (total !== expected) fail();
  } catch { fail(); }
}
