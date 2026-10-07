// 動作確認用のサンプルデータを作る（scrape.mjs を一度も実行していないときだけ使う）
//   node scripts/make-sample.mjs
import { writeFile } from "node:fs/promises";

const m = (wm2, wml2, es1) => ({
  "DA-WM2": { sym: wm2, screw: wm2 === "x" ? null : "M6×25", notes: [] },
  "DA-WML2": { sym: wml2, screw: wml2 === "x" ? null : "M6×25", notes: [] },
  "DA-ES1": { sym: es1, screw: es1 === "x" ? null : "M6×15", notes: [] },
});
const u = (p) => `https://www.iodata.jp/product/lcd/4k/${p}/`;
const displays = [
  { sku: "LCD-U751D-P", sizeInch: 75, hours: 24, dustproof: true, mediaPlayer: true, displayWall: true, wallMax: 25, tiltNG: true, mounts: m("x", "o", "x") },
  { sku: "LCD-U651D", sizeInch: 65, hours: 18, mediaPlayer: true, displayWall: true, wallMax: 25, mounts: m("o", "o", "x") },
  { sku: "LCD-U551D", sizeInch: 55, widthMm: 1240, heightMm: 710, weightKg: 15.0, hours: 18, mediaPlayer: true, displayWall: true, wallMax: 25, status: "paused", mounts: m("o", "o", "o") },
  { sku: "LCD-U551D-P", sizeInch: 55, widthMm: 1250, heightMm: 730, weightKg: 22.2, hours: 24, dustproof: true, mediaPlayer: true, displayWall: true, wallMax: 25, tiltNG: true, status: "paused", mounts: m("o", "o", "x") },
  { sku: "LCD-U501V", sizeInch: 50, hours: 18, mounts: m("o", "o", "o") },
  { sku: "LCD-U501VX", sizeInch: 50, hours: 18, mounts: m("h", "x", "x") },
  { sku: "LCD-HU431DB", sizeInch: 43, hours: 24, mounts: m("o", "o", "o") },
  { sku: "LCD-U431D", sizeInch: 43, hours: 18, mounts: m("o", "x", "v") },
].map((d) => ({ aliases: [], url: u(d.sku.toLowerCase()), widthMm: null, heightMm: null, weightKg: null, dustproof: false, mediaPlayer: false, displayWall: false, wallMax: null, tiltNG: false, status: "current", ...d }));
await writeFile(new URL("../data/displays.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), sample: true, displays }, null, 2) + "\n");
console.log("サンプルデータを作りました（" + displays.length + "機種）");
