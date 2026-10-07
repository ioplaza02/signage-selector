// サイネージセレクター用データ収集スクリプト
//   node scripts/scrape.mjs
//
// 1. 対応表（液晶ディスプレイオプション（スタンド／金具）対応表）から
//    40型以上のディスプレイと、壁掛け金具 DA-WM2 / DA-WML2・イーゼル DA-ES1 の対応を読む
// 2. 各ディスプレイの商品ページ（index.htm、足りなければ spec.htm）から
//    外形寸法・質量・連続稼働時間・防塵・内蔵プレーヤー・ディスプレイウォール・販売状況を読む
// 3. data/displays.json に保存
//
// リクエストは並列にせず1件ずつ2秒間隔、専用User-Agentを使う（NASセレクターと同じ方針）。

import { writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BASE = "https://www.iodata.jp";
const STAND_URL = `${BASE}/pio/io/lcd/stand.htm`;
const UA = "SignageSelectorBot/1.0 (+https://ioplaza02.github.io/signage-selector/)";
const WAIT_MS = 2000;
const OUT = new URL("../data/displays.json", import.meta.url);
const MOUNTS = ["DA-WM2", "DA-WML2", "DA-ES1"];
// 対象にするサイズ区分（34型以下・らくらくボードなどは対象外）
const TARGET_SECTIONS = [/65型以上/, /55～50型/, /49～40型/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;

async function fetchText(url) {
  const wait = lastFetch + WAIT_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.text();
}

// ---------- HTMLの小さな道具 ----------
const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function stripTags(html) {
  return decode(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t　]+/g, " ").replace(/\n\s*/g, "\n").trim();
}
const oneLine = (s) => stripTags(s).replace(/\s+/g, " ").trim();

// <table> を、rowspan / colspan を展開した2次元配列にする。
// 各セルは { text, html } を持つ。展開でできたコピーには copy:true が付く。
export function tableToGrid(tableHtml) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRe = /<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi;
    let c;
    while ((c = cellRe.exec(m[1])) !== null) {
      const attrs = c[2];
      const rs = Number((attrs.match(/rowspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
      const cs = Number((attrs.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
      cells.push({ html: c[3], text: oneLine(c[3]), rs, cs });
    }
    rows.push(cells);
  }
  const grid = [];
  const pending = []; // pending[col] = { cell, left }
  for (let r = 0; r < rows.length; r++) {
    const out = [];
    let col = 0;
    const queue = rows[r].slice();
    const place = () => {
      while (pending[col] && pending[col].left > 0) {
        out[col] = { ...pending[col].cell, copy: true };
        pending[col].left--;
        col++;
      }
    };
    place();
    for (const cell of queue) {
      place();
      for (let k = 0; k < cell.cs; k++) {
        out[col] = { html: cell.html, text: cell.text, copy: k > 0 };
        if (cell.rs > 1) pending[col] = { cell: { html: cell.html, text: cell.text }, left: cell.rs - 1 };
        col++;
      }
    }
    place();
    grid.push(out.map((x) => x || { html: "", text: "" }));
  }
  return grid;
}

// 記号の読み取り：○/〇=縦横可、△=横のみ、▲=縦のみ、×=非対応
export function readSymbol(text) {
  const t = text.trim();
  if (/^[○〇]/.test(t)) return "o";
  if (/^△/.test(t)) return "h";
  if (/^▲/.test(t)) return "v";
  if (/^[×✕]/.test(t)) return "x";
  return null;
}
const noteRefs = (text) => [...text.matchAll(/※\s*(\d+)/g)].map((x) => x[1]);

// ---------- 1. 対応表 ----------
export function parseStandPage(html) {
  const result = new Map(); // primarySku -> display
  const sections = html.split(/<h2[^>]*>/i).slice(1);
  for (const sec of sections) {
    const title = oneLine(sec.split(/<\/h2>/i)[0]);
    if (!TARGET_SECTIONS.some((re) => re.test(title))) continue;

    // このセクションの注記（※1 …）。番号の意味はセクションごとに違うので、ここで文章に置き換える
    const notes = {};
    for (const line of stripTags(sec).split("\n")) {
      const nm = line.match(/^※\s*(\d+)\s*(.+)$/);
      if (nm && !notes[nm[1]]) notes[nm[1]] = nm[2].trim();
    }

    const tables = sec.match(/<table[\s\S]*?<\/table>/gi) || [];
    for (const t of tables) {
      const grid = tableToGrid(t);
      // 見出し行から、対象金具の列番号を探す
      const colOf = {};
      let headerRows = 0;
      for (let r = 0; r < Math.min(3, grid.length); r++) {
        let found = false;
        grid[r].forEach((cell, ci) => {
          for (const mnt of MOUNTS) {
            if (new RegExp(`\\b${mnt}\\b`).test(cell.text) && colOf[mnt] === undefined) { colOf[mnt] = ci; found = true; }
          }
          if (/縦方向で取付時/.test(cell.text)) { colOf.__power = ci; found = true; }
        });
        if (found) headerRows = r + 1;
      }
      if (!Object.keys(colOf).length) continue;

      for (let r = headerRows; r < grid.length; r++) {
        const row = grid[r];
        const nameHtml = row[0]?.html || "";
        const links = [...nameHtml.matchAll(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
          .map((x) => ({ href: x[1], sku: oneLine(x[2]) }))
          .filter((x) => /^[A-Z]{2,4}-[A-Z0-9/-]+$/.test(x.sku));
        if (!links.length) continue;
        const primary = links.find((l) => l.sku.startsWith("LCD-")) || links[0];
        let d = result.get(primary.sku);
        if (!d) {
          d = {
            sku: primary.sku,
            aliases: links.filter((l) => l.sku !== primary.sku).map((l) => l.sku),
            url: new URL(primary.href, STAND_URL).href.replace(/index\.htm$/, ""),
            section: title.replace(/対応スタンド・金具/, "").trim(),
            mounts: {},
          };
          result.set(primary.sku, d);
        }
        for (const mnt of MOUNTS) {
          const ci = colOf[mnt];
          if (ci === undefined) continue;
          const txt = row[ci]?.text || "";
          const sym = readSymbol(txt);
          const slot = d.mounts[mnt] || (d.mounts[mnt] = { sym: null, screw: null, notes: [] });
          if (sym) {
            slot.sym = sym;
            for (const n of noteRefs(txt)) if (notes[n] && !slot.notes.includes(notes[n])) slot.notes.push(notes[n]);
          } else if (/M\d/.test(txt)) {
            slot.screw = txt.replace(/※\s*\d+[、,]?/g, "").replace(/\s+/g, " ").trim();
            for (const n of noteRefs(txt)) if (notes[n] && !slot.notes.includes(notes[n])) slot.notes.push(notes[n]);
          }
        }
        if (colOf.__power !== undefined) {
          const p = (row[colOf.__power]?.text || "").trim();
          if (p) d.portraitPowerButton = p === "×" ? null : p;
        }
      }
    }
  }
  for (const d of result.values()) for (const mnt of MOUNTS) if (!d.mounts[mnt]) d.mounts[mnt] = { sym: "x", screw: null, notes: [] };
  return [...result.values()];
}

// ---------- 2. 商品ページ ----------
export function parseProductPage(html, sku) {
  const text = stripTags(html);
  const flat = text.replace(/\s+/g, " ");
  const out = {};

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const size = (oneLine(title).match(/(\d{2,3})型/) || flat.match(/(\d{2,3})型/) || [])[1];
  if (size) out.sizeInch = Number(size);

  // 外形寸法（スタンドなし）：「約124×6×71cm」
  const dimArea = flat.slice(Math.max(0, flat.indexOf("外形寸法")), flat.indexOf("外形寸法") + 200);
  const dimM = dimArea.match(/スタンドなし\s*約?\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*(cm|mm)/)
            || (flat.indexOf("外形寸法") >= 0 ? dimArea.match(/約?\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*(cm|mm)/) : null);
  if (dimM) {
    const k = dimM[4] === "cm" ? 10 : 1;
    out.widthMm = Math.round(Number(dimM[1]) * k);
    out.depthMm = Math.round(Number(dimM[2]) * k);
    out.heightMm = Math.round(Number(dimM[3]) * k);
  }
  // 質量（スタンドなし）
  const qi = flat.search(/質量\s/);
  if (qi >= 0) {
    const area = flat.slice(qi, qi + 120);
    const km = area.match(/スタンドなし\s*約?\s*([\d.]+)\s*kg/) || area.match(/約?\s*([\d.]+)\s*kg/);
    if (km) out.weightKg = Number(km[1]);
  }
  out.hours = /24時間連続稼働/.test(flat) ? 24 : /18時間連続稼働/.test(flat) ? 18 : null;
  out.dustproof = /IP5X/.test(flat);
  out.temperedGlass = /強化ガラス/.test(flat);
  out.mediaPlayer = /メディアプレー?ヤー機能/.test(flat);
  out.displayWall = /ディスプレイウォール/.test(flat);
  if (out.displayWall) {
    const g = flat.match(/ディスプレイウォール[^。]{0,20}最大\s*(\d)\s*[×x]\s*(\d)/) || flat.match(/最大\s*(\d+)\s*画面/);
    out.wallMax = g ? (g[2] ? Number(g[1]) * Number(g[2]) : Number(g[1])) : null;
  }
  out.tiltNG = /傾斜設置(は|も)?不可/.test(flat);
  out.vesa = (flat.match(/VESAマウントインターフェイス\s*○?\s*[（(]\s*(\d+\s*[×x]\s*\d+)\s*mm/) || [])[1]?.replace(/\s/g, "") || null;
  // 販売状況：型番・JANコードの表の中から、この型番の行だけを見る（-AG 等の別行に引っ張られないように）
  const priceTable = (html.match(/<table[\s\S]*?JANコード[\s\S]*?<\/table>/i) || [""])[0];
  const rowHtml = sku
    ? ((priceTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []).find((tr) => new RegExp(`>\\s*${sku.replace(/[/-]/g, "\\$&")}\\s*<`).test(tr)) || priceTable)
    : priceTable;
  out.status = /生産終了|icon_close/.test(rowHtml) ? "eol"
             : /店頭在庫限り|icon_limit/.test(rowHtml) ? "limited"
             : /一時受注停止/.test(rowHtml) ? "paused" : "current";
  return out;
}

// ---------- メイン ----------
async function main() {
  const started = new Date();
  console.log("対応表を取得:", STAND_URL);
  const displays = parseStandPage(await fetchText(STAND_URL));
  console.log(`  ${displays.length} 機種を検出`);

  const missing = [];
  for (const d of displays) {
    let info = {};
    try {
      info = parseProductPage(await fetchText(d.url), d.sku);
      if (!info.widthMm || !info.weightKg) {
        try {
          const base = /\.htm$/.test(d.url) ? d.url : (d.url.endsWith("/") ? d.url : d.url + "/");
          const spec = parseProductPage(await fetchText(new URL("spec.htm", base).href), d.sku);
          for (const [k, v] of Object.entries(spec)) if (info[k] == null || info[k] === false) info[k] = v;
        } catch { /* spec.htm が無い商品もある */ }
      }
    } catch (e) {
      if (/^404/.test(e.message)) info.status = "eol";
      console.warn("  取得失敗:", d.sku, e.message);
    }
    Object.assign(d, info);
    const lack = ["sizeInch", "widthMm", "weightKg", "hours"].filter((k) => d[k] == null);
    if (lack.length) missing.push(`${d.sku}: ${lack.join(", ")}`);
    console.log(`  ${d.sku}  ${d.sizeInch ?? "?"}型 幅${d.widthMm ?? "?"}mm ${d.weightKg ?? "?"}kg ${d.hours ?? "?"}h  WM2:${d.mounts["DA-WM2"].sym} WML2:${d.mounts["DA-WML2"].sym} ES1:${d.mounts["DA-ES1"].sym}  ${d.status ?? ""}`);
  }

  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const data = { updatedAt: started.toISOString(), source: STAND_URL, displays };
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n保存しました: data/displays.json（${displays.length}機種、前回 ${prev?.displays?.length ?? "-"}機種）`);
  if (missing.length) {
    console.log("\n取れなかった項目:");
    for (const m of missing) console.log("  " + m);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
