/**
 * A minimal zip writer (files stored, not compressed): enough for the company export, whose Excel files and photos
 * are compressed already. UTF-8 names; one archive must stay under 4 GB.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date fields for a JavaScript date (local time, as zip tools show it). */
function dosTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  private names = new Set<string>();

  /** Add a file; a name already used gets " (2)", " (3)"... before its extension. */
  add(path: string, data: Uint8Array, modified = new Date()) {
    const name = new TextEncoder().encode(this.unique(path));
    const { time, date } = dosTime(modified);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // UTF-8 names
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true);
    this.parts.push(header.buffer, name, data as Uint8Array<ArrayBuffer>);
    this.entries.push({ name, crc, size: data.length, offset: this.offset, time, date });
    this.offset += 30 + name.length + data.length;
  }

  private unique(path: string) {
    let out = path;
    for (let i = 2; this.names.has(out.toLowerCase()); i++) {
      const dot = path.lastIndexOf('.');
      out = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)} (${i})${path.slice(dot)}` : `${path} (${i})`;
    }
    this.names.add(out.toLowerCase());
    return out;
  }

  get count() {
    return this.entries.length;
  }

  finish(): Blob {
    const start = this.offset;
    let size = 0;
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, e.time, true);
      h.setUint16(14, e.date, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.name.length, true);
      h.setUint32(42, e.offset, true);
      this.parts.push(h.buffer, e.name as Uint8Array<ArrayBuffer>);
      size += 46 + e.name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, start, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: 'application/zip' });
  }
}
