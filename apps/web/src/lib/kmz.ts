/**
 * A KMZ is a zip with the KML inside (doc.kml, else the first .kml). Read here with the browser's own inflate
 * (DecompressionStream), so no zip library is loaded for one file.
 */
export async function kmlFromKmz(bytes: ArrayBuffer): Promise<string> {
  const view = new DataView(bytes);
  // The end of the central directory: its signature, searched back from the end over any zip comment.
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65_557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Not a KMZ file');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: { name: string; method: number; size: number; local: number }[] = [];
  for (let k = 0; k < count && view.getUint32(at, true) === 0x02014b50; k++) {
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    entries.push({
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      local: view.getUint32(at + 42, true),
      name: new TextDecoder().decode(new Uint8Array(bytes, at + 46, nameLen)),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  const kml = entries.find((e) => /(^|\/)doc\.kml$/i.test(e.name)) ?? entries.find((e) => /\.kml$/i.test(e.name));
  if (!kml) throw new Error('No KML inside the KMZ');
  const start = kml.local + 30 + view.getUint16(kml.local + 26, true) + view.getUint16(kml.local + 28, true);
  const data = new Uint8Array(bytes, start, kml.size);
  if (kml.method === 0) return new TextDecoder().decode(data);
  if (kml.method !== 8) throw new Error('Unsupported compression in the KMZ');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A KMZ of one KML (doc.kml, stored, as Google Earth reads it), for a network downloaded to edit there. */
export function kmzFromKml(kml: string): Blob {
  const data = new TextEncoder().encode(kml);
  const name = new TextEncoder().encode('doc.kml');
  const crc = crc32(data);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(8, 0, true); // stored
  local.setUint32(14, crc, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, name.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, name.length, true);
  central.setUint32(42, 0, true); // its local header is the first thing in the file
  const dirAt = 30 + name.length + data.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + name.length, true);
  end.setUint32(16, dirAt, true);
  return new Blob([local, name, data, central, name, end], { type: 'application/vnd.google-earth.kmz' });
}
