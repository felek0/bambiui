import { checkedSourceFiles, utf8 } from "./source-files.ts";

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded UTF-8 text-only ZIP STORE. DOS timestamp is always 1980-01-01. */
export function createSourceZIP(files: ReadonlyMap<string, string>): Uint8Array<ArrayBuffer> {
  const entries = checkedSourceFiles(files).map(([path, data]) => ({ name: utf8(`bambiui-source/${path}`), data, crc: crc32(data), offset: 0 }));
  const localSize = entries.reduce((size, entry) => size + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = entries.reduce((size, entry) => size + 46 + entry.name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22), view = new DataView(bytes.buffer);
  let cursor = 0;
  const u16 = (offset: number, value: number) => view.setUint16(cursor + offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(cursor + offset, value, true);
  for (const entry of entries) {
    entry.offset = cursor;
    u32(0, 0x04034b50); u16(4, 20); u16(6, 0x0800); u16(12, 33);
    u32(14, entry.crc); u32(18, entry.data.length); u32(22, entry.data.length); u16(26, entry.name.length);
    bytes.set(entry.name, cursor + 30); bytes.set(entry.data, cursor + 30 + entry.name.length);
    cursor += 30 + entry.name.length + entry.data.length;
  }
  for (const entry of entries) {
    u32(0, 0x02014b50); u16(4, 20); u16(6, 20); u16(8, 0x0800); u16(14, 33);
    u32(16, entry.crc); u32(20, entry.data.length); u32(24, entry.data.length); u16(28, entry.name.length); u32(42, entry.offset);
    bytes.set(entry.name, cursor + 46);
    cursor += 46 + entry.name.length;
  }
  u32(0, 0x06054b50); u16(8, entries.length); u16(10, entries.length); u32(12, centralSize); u32(16, localSize);
  return bytes;
}
