import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
function nearSegment(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) < 0.024;
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = col / size, y = row / size;
      const house = x > .26 && x < .74 && y > .29 + Math.abs(x - .5) * .9 && y < .73;
      const door = x > .43 && x < .57 && y > .59;
      const check = nearSegment(x, y, .39, .49, .47, .56) || nearSegment(x, y, .47, .56, .63, .40);
      const color = check ? [118, 167, 107] : house && !door ? [231, 242, 213] : [22, 62, 55];
      const offset = row * (size * 3 + 1) + 1 + col * 3;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  writeFileSync(`icon-${size}.png`, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
