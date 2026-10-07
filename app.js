/* サイネージセレクター
 * データ：data/displays.json（毎日自動更新）＋ data/static.json（手で管理）
 */
"use strict";

const SITE_PASSWORD = "signage2026"; // 簡易的な鍵（本物のセキュリティではありません）
const STALE_DAYS = 40;

const state = {
  view: "main",
  mount: "wall",            // wall | floor
  f: { size: new Set(), hours: new Set(), portrait: false, dust: false, outdoor: false, player: false, wall: false },
  showEol: false,
  sel: null,                // 選択中ディスプレイの型番
  mountSel: null,           // 選択中の金具
  play: "stb",
  device: { stb: null, win: null }, // 選択中の再生機
  wants: new Set(),
  wallCols: 2, wallRows: 2,
};
let D = [];      // ディスプレイ
let S = null;    // 固定データ
let META = {};

/* ---------- 共通 ---------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mountOf = (sku) => S.mounts.find((m) => m.sku === sku);
const fmtCm = (mm) => (mm == null ? "—" : `約${(mm / 10).toFixed(0)}cm`);
const fmtKg = (kg) => (kg == null ? "—" : `約${kg}kg`);

const ICON = {
  wall: `<svg width="76" height="56" viewBox="0 0 76 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="2" y="2" width="72" height="50" rx="3" opacity=".45"/><line x1="2" y1="52" x2="74" y2="52"/><rect x="10" y="10" width="34" height="20" rx="1.5" fill="#EEF1F4"/><circle cx="58" cy="22" r="3.5"/><line x1="58" y1="26" x2="58" y2="38"/><line x1="58" y1="38" x2="54" y2="51"/><line x1="58" y1="38" x2="62" y2="51"/><line x1="58" y1="30" x2="53" y2="35"/><line x1="58" y1="30" x2="63" y2="35"/></svg>`,
  floor: `<svg width="64" height="56" viewBox="0 0 64 56" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="22" y="2" width="20" height="34" rx="2" transform="rotate(-6 32 19)" fill="#EEF1F4"/><line x1="27" y1="36" x2="20" y2="54"/><line x1="37" y1="36" x2="44" y2="54"/><line x1="2" y1="54" x2="62" y2="54"/></svg>`,
  builtin: `<svg width="60" height="48" viewBox="0 0 60 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="46" height="30" rx="2"/><path d="M21 13 L31 19 L21 25 Z" fill="currentColor"/><rect x="46" y="38" width="12" height="7" rx="1"/><line x1="44" y1="34" x2="48" y2="38"/></svg>`,
  stb: `<svg width="60" height="48" viewBox="0 0 60 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="16" width="44" height="18" rx="4"/><circle cx="44" cy="25" r="2" fill="#0F5E57" stroke="none"/><line x1="14" y1="25" x2="30" y2="25"/></svg>`,
  win: `<svg width="60" height="48" viewBox="0 0 60 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="26" height="26" rx="4"/><line x1="10" y1="30" x2="24" y2="30"/><rect x="32" y="6" width="26" height="20" rx="2"/><line x1="32" y1="12" x2="58" y2="12"/><rect x="36" y="15" width="8" height="7" fill="#0F5E57" stroke="none"/></svg>`,
};
ICON.app = `<svg width="56" height="48" viewBox="0 0 56 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="44" height="34" rx="3"/><line x1="6" y1="14" x2="50" y2="14"/><rect x="12" y="20" width="14" height="14" fill="#0F5E57" stroke="none"/><line x1="30" y1="22" x2="44" y2="22"/><line x1="30" y1="28" x2="40" y2="28"/></svg>`;
ICON.usb = `<svg width="56" height="48" viewBox="0 0 56 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="14" y="16" width="30" height="16" rx="3"/><rect x="44" y="19" width="8" height="10" rx="1"/><line x1="20" y1="24" x2="34" y2="24"/></svg>`;
ICON.iss = `<svg width="56" height="48" viewBox="0 0 56 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M28 4 L46 10 V24 C46 34 38 41 28 44 C18 41 10 34 10 24 V10 Z"/><path d="M20 24 L26 30 L37 18" stroke="#0F5E57" stroke-width="3"/></svg>`;
// 工具アイコン（images/tool.png を置くと表示。無ければ何も出さない）
const TOOL_IMG = `<img src="images/tool.png" alt="" class="tool-icon" onerror="this.remove()">`;

function screenIcon(d, portrait) {
  const size = d.sizeInch || 50;
  let w = Math.round(size * 1.35), h = Math.round((w * 9) / 16);
  if (portrait) [w, h] = [h, w];
  return `<div class="screen-icon ${d.dustproof ? "is-dust" : ""}" style="width:${w}px;height:${h}px">${size}型</div>`;
}
const statusBadge = (st) =>
  ({ eol: `<span class="badge badge-gray">生産終了</span>`, limited: `<span class="badge badge-warn">店頭在庫限り</span>`, paused: `<span class="badge badge-warn">一時受注停止</span>` }[st] || "");

/* ---------- ディスプレイの特徴（同じサイズでも違いが分かるように） ---------- */
function traits(d) {
  const syms = ["DA-WM2", "DA-WML2", "DA-ES1"].map((k) => d.mounts?.[k]?.sym).filter(Boolean);
  const port = syms.some((s) => s === "o" || s === "v");
  const land = syms.some((s) => s === "o" || s === "h");
  const noTilt = !!d.tiltNG || ["DA-WM2", "DA-WML2"].some((k) => (d.mounts?.[k]?.notes || []).some((n) => /傾けない/.test(n)));
  return { port, land, noTilt };
}

/* ---------- 金具の判定 ---------- */
function evalMount(d, sku, portrait) {
  const m = mountOf(sku);
  const t = d.mounts?.[sku] || { sym: "x", notes: [] };
  const floor = m.type === "floor";
  const want = floor || portrait ? "portrait" : "landscape";
  const okLand = t.sym === "o" || t.sym === "h";
  const okPort = t.sym === "o" || t.sym === "v";
  const ok = want === "portrait" ? okPort : okLand;
  const heavy = d.weightKg != null && d.weightKg > m.loadKg;
  // 正面から見た横幅：縦置きならディスプレイの高さが横幅になる
  const faceW = want === "portrait" ? d.heightMm : d.widthMm;
  const over = !floor && ok && faceW != null && m.totalWidthMm > faceW;
  const inRange = d.sizeInch != null && d.sizeInch >= m.guideMin && d.sizeInch <= m.guideMax;
  const notes = [];
  if (!ok) notes.push(t.sym === "x" ? "対応表で非対応の組み合わせです。" : want === "portrait" ? "この組み合わせは横向きのみ対応です。" : "この組み合わせは縦向きのみ対応です。");
  if (heavy) notes.push(`ディスプレイの質量（${d.weightKg}kg）が耐荷重（${m.loadKg}kg）を超えます。`);
  if (d.weightKg == null) notes.push("ディスプレイの質量が取得できていません。仕様ページでご確認ください。");
  if (ok && !inRange) notes.push(`この金具の目安サイズ（${m.guideSize}）の範囲外です。`);
  for (const n of t.notes || []) if (!notes.includes(n)) notes.push(n);
  if (!floor) notes.push("壁面への設置は工事専門業者へご依頼ください。");
  if (floor && m.storage) notes.push(m.storage);
  const noTilt = d.tiltNG || (t.notes || []).some((n) => /傾けない/.test(n));
  // 傾きの表記は「傾き：」で始めてそろえる
  const angle = floor ? "傾き：画面が約18°後ろに傾いた状態で固定"
    : m.tilt ? (noTilt ? "傾き：壁と平行のみ（このディスプレイは傾けて設置できません）" : `傾き：下向きに${m.tilt}`)
    : "傾き：壁と平行（この金具に角度調整はありません）";
  return { m, t, ok: ok && !heavy, over, inRange, notes, angle, okLand, okPort, floor };
}

function mountCandidates() { return S.mounts.filter((m) => m.type === state.mount); }
function displayFits(d) { return mountCandidates().some((m) => evalMount(d, m.sku, state.f.portrait).ok); }

// 取り付けられる金具の中から「おすすめ」を1つ決める：目安サイズ内＆はみ出し無し → 目安サイズ内 → はみ出し無し → 先頭
function rankMounts(d) {
  const list = mountCandidates().map((m) => ({ m, e: evalMount(d, m.sku, state.f.portrait) }));
  const ok = list.filter((x) => x.e.ok);
  const best = ok.find((x) => x.e.inRange && !x.e.over) || ok.find((x) => x.e.inRange) || ok.find((x) => !x.e.over) || ok[0];
  for (const x of list) {
    x.verdict = !x.e.ok ? "取り付け不可" : x === best ? "おすすめ" : x.e.over ? "取付可・はみ出し注意" : "取付可";
    x.tone = !x.e.ok ? "bad" : x === best ? "good" : x.e.over ? "warn" : "plain";
  }
  return { list, best };
}

function filteredDisplays() {
  const f = state.f;
  if (f.outdoor) return [];
  return D.filter((d) => {
    if (d.status === "eol" && !state.showEol) return false;
    if (f.size.size) {
      const s = d.sizeInch || 0;
      const b = s >= 65 ? "65" : s >= 50 ? "50" : "40";
      if (!f.size.has(b)) return false;
    }
    if (f.hours.size && !f.hours.has(String(d.hours))) return false;
    if (f.dust && !d.dustproof) return false;
    if (f.player && !d.mediaPlayer) return false;
    if (f.wall && !d.displayWall) return false;
    return displayFits(d);
  }).sort((a, b) => (a.sizeInch || 0) - (b.sizeInch || 0) || a.sku.localeCompare(b.sku));
}

const prodLink = (url, label = "商品ページへ") =>
  url ? `<a class="prod-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : "";
const nextBtn = (id, label) => `<div class="next-wrap"><button type="button" class="next-btn" data-scroll="${id}">次へ：${label} ↓</button></div>`;

/* ---------- メインの流れ ---------- */
function renderMain() {
  const list = filteredDisplays();
  if (!list.find((d) => d.sku === state.sel)) state.sel = list[0]?.sku || null;
  const d = D.find((x) => x.sku === state.sel);
  const f = state.f;
  const portraitView = state.mount === "floor" || f.portrait;
  const chk = (name, val, label, on) => `<label class="chk"><input type="checkbox" data-filter="${name}" value="${val}" ${on ? "checked" : ""}> ${label}</label>`;

  const mountBtns = [
    { id: "wall", name: "壁に掛ける", sub: "壁掛け金具 DA-WM2／DA-WML2" },
    { id: "floor", name: "床に置く", sub: "イーゼルスタンド DA-ES1（縦向き）" },
  ].map((m) => `<button type="button" class="choice ${state.mount === m.id ? "is-on" : ""}" data-mount="${m.id}">${ICON[m.id]}<span><strong>${m.name}</strong><small>${m.sub}</small></span></button>`).join("");

  const cards = list.length
    ? list.map((x) => {
      const tr = traits(x);
      return `
      <div class="card disp-card ${x.sku === state.sel ? "is-on" : ""}">
        <button type="button" class="card-hit" data-disp="${esc(x.sku)}" aria-pressed="${x.sku === state.sel}">
          <div class="disp-head">
            <div class="icon-slot">${screenIcon(x, portraitView)}</div>
            <div><strong class="sku">${esc(x.sku)}</strong><small class="muted">幅 ${fmtCm(x.widthMm)} ・ ${fmtKg(x.weightKg)}</small></div>
          </div>
          <div class="tags">
            <span class="tag ${tr.port ? "tag-teal" : "tag-no"}">${tr.port ? (tr.land ? "縦置きOK" : "縦置きのみ") : "横置きのみ"}</span>
            <span class="tag ${tr.noTilt ? "tag-no" : "tag-teal"}">${tr.noTilt ? "傾けて設置できない" : "傾けて設置OK"}</span>
            ${x.hours ? `<span class="tag tag-teal">${x.hours}時間連続稼働</span>` : ""}
            ${x.dustproof ? `<span class="tag tag-blue">防塵IP5X</span>` : ""}
            ${x.mediaPlayer ? `<span class="tag tag-amber">プレーヤー内蔵</span>` : ""}
            ${x.displayWall ? `<span class="tag tag-gray">ディスプレイウォール対応</span>` : ""}
            ${statusBadge(x.status)}
          </div>
        </button>
        ${prodLink(x.url)}
      </div>`;
    }).join("")
    : `<div class="empty">${f.outdoor ? "屋外に対応した商品は現在ありません。防塵（IP5X）モデルも屋内専用で、防水ではありません。" : "条件に合うディスプレイがありません。条件を減らしてみてください。"}</div>`;

  // 金具
  let mountHtml = "", chosenMount = null;
  if (d) {
    const { list: ranked, best } = rankMounts(d);
    if (!ranked.find((x) => x.m.sku === state.mountSel && x.e.ok)) state.mountSel = best?.m.sku || null;
    chosenMount = ranked.find((x) => x.m.sku === state.mountSel) || null;
    mountHtml = ranked.map((x) => {
      const { m, e } = x;
      const on = m.sku === state.mountSel;
      return `
      <div class="card mount-card tone-${x.tone} ${on ? "is-on" : ""}">
        <button type="button" class="card-hit" data-mountsel="${esc(m.sku)}" ${e.ok ? "" : "disabled"} aria-pressed="${on}">
          <div class="mount-head">
            <span class="mount-name">${TOOL_IMG}<strong>${esc(m.sku)}</strong></span>
            <span class="verdict v-${x.tone}">${x.verdict}</span>
          </div>
          <div class="mount-body">
            <span class="mount-photo"><img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy"></span>
            <div class="mount-spec">
              <span>目安：${esc(m.guideSize)}</span>
              <span>横幅：${m.totalWidthMm}mm${m.unitWidthMm ? `（金具本体${m.bodyWidthMm}mm＋STB収納ユニット${m.unitWidthMm}mm）` : ""}</span>
              <span>耐荷重：${m.loadKg}kg${e.t.screw ? `　ネジ：${esc(e.t.screw)}` : ""}</span>
            </div>
          </div>
          ${e.over ? `<div class="alert alert-bad">STB収納ユニットを取り付けたままだと、横からはみ出す場合があります</div>` : ""}
          <div class="pills">
            ${e.floor ? "" : `<span class="pill ${e.okLand ? "is-yes" : "is-no"}"><i class="o-land"></i>横 ${e.okLand ? "✓" : "✗"}</span>`}
            <span class="pill ${e.okPort ? "is-yes" : "is-no"}"><i class="o-port"></i>縦 ${e.okPort ? "✓" : "✗"}</span>
            <span class="pill">${esc(e.angle)}</span>
          </div>
          ${e.floor ? "" : `<p class="unit-note">STB収納ユニットは左右どちらにも付け替えられます。</p>`}
          <ul class="notes">${e.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        </button>
        ${prodLink(m.url)}
      </div>`;
    }).join("");
  }

  // 再生
  if (state.play === "builtin" && d && !d.mediaPlayer) state.play = "stb";
  const players = S.players.map((p) => {
    const disabled = p.id === "builtin" && d && !d.mediaPlayer;
    return `<button type="button" class="choice ${state.play === p.id ? "is-on" : ""}" data-play="${p.id}" ${disabled ? "disabled" : ""}>${ICON[p.id]}<span><strong>${esc(p.name)}</strong><small>${disabled ? "このディスプレイは内蔵していません" : esc(p.sub)}</small></span></button>`;
  }).join("");
  const P = S.players.find((p) => p.id === state.play);
  const devs = (P.devices || []).filter((x) => state.showEol || x.status !== "eol");
  if (devs.length && !devs.find((x) => x.sku === state.device[P.id])) state.device[P.id] = devs[0].sku;
  const dev = devs.find((x) => x.sku === state.device[P.id]);
  const devHtml = devs.length ? `
    <strong class="sub-h">再生機を選ぶ</strong>
    <div class="grid-cards">${devs.map((x) => `
      <div class="card dev-card ${x.sku === state.device[P.id] ? "is-on" : ""}">
        <button type="button" class="card-hit" data-device="${esc(x.sku)}" aria-pressed="${x.sku === state.device[P.id]}">
          <div class="disp-head"><div class="icon-slot small">${ICON[x.icon]}</div>
          <div><strong class="sku">${esc(x.sku)}</strong><small class="muted">${esc(x.desc)}</small></div></div>
          ${statusBadge(x.status)}
        </button>
        ${prodLink(x.url)}
      </div>`).join("")}</div>` : "";
  const needs = P.needs.map((n) => `<div class="need"><span class="check">✔</span><span><strong>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.item)}</a>` : esc(n.item)}</strong> <span class="muted">${esc(n.note)}</span></span></div>`).join("");
  const manualUrl = P.manualUrl || (d ? d.url : S.links.stand);

  const iss = d ? (d.sizeInch && d.sizeInch <= 55
    ? "訪問安心保守（オンサイト）と交換品お届け保守（デリバリィ）から選べます。"
    : "65型以上のため、訪問安心保守（オンサイト）のみ選べます（デリバリィは55型以下が対象）。") : "";

  // 選んだセット（次のアクションにつなげる）
  const setItems = d ? [
    { role: "映す", icon: screenIcon(d, portraitView), name: d.sku, sub: `${d.sizeInch ?? "?"}型ディスプレイ`, url: d.url },
    chosenMount ? { role: "取り付ける", icon: `<img src="${esc(chosenMount.m.image)}" alt="" class="set-photo">`, name: chosenMount.m.sku, sub: chosenMount.m.type === "wall" ? "壁掛け金具" : "イーゼルスタンド", url: chosenMount.m.url } : null,
    dev ? { role: "再生させる", icon: ICON[dev.icon], name: dev.sku, sub: "再生機", url: dev.url } : { role: "再生させる", icon: ICON.builtin, name: "内蔵メディアプレーヤー", sub: "ディスプレイに搭載", url: d.url },
    P.app ? { role: "再生アプリ", icon: ICON.app, name: P.app.name, sub: "必ず必要です", url: P.app.url } : null,
    { role: "保存用", icon: ICON.usb, name: P.id === "stb" ? "USBメモリー／microSDカード" : "USBメモリー", sub: "市販品をご用意ください", url: null, hide: P.id === "win" },
    { role: "保守", icon: ICON.iss, name: "ISS 保守サービス", sub: "購入から60日以内にお申込み", url: S.links.issLcd },
  ].filter((x) => x && !x.hide) : [];
  state._copyText = setItems.map((x) => `${x.role}：${x.name}`).join("\n");

  const done = { place: true, disp: !!d, mount: !!chosenMount, play: true, iss: !!d, set: !!d };
  const steps = [["s-place", "設置場所"], ["s-disp", "映す"], ["s-mount", "取り付ける"], ["s-play", "再生させる"], ["s-iss", "保守"], ["s-set", "選んだセット"]];
  const stepKeys = ["place", "disp", "mount", "play", "iss", "set"];

  $("#view-main").innerHTML = `
    <nav class="stepper" aria-label="進み具合">
      ${steps.map(([id, l], i) => `<button type="button" class="step-btn ${done[stepKeys[i]] ? "is-done" : ""}" data-scroll="${id}"><span class="step-no">${i + 1}</span>${l}</button>`).join(`<span class="step-sep">›</span>`)}
    </nav>

    <section class="panel" id="s-place">
      <h2>① どこに設置しますか？</h2>
      <div class="choices">${mountBtns}</div>
      ${nextBtn("s-disp", "② 映す")}
    </section>

    <section class="split" id="s-disp">
      <aside class="panel sidebar">
        <h2 class="h-sm">ディスプレイの条件</h2>
        <div class="fgroup"><strong>画面サイズ</strong>
          ${chk("size", "40", "40〜49型", f.size.has("40"))}${chk("size", "50", "50〜55型", f.size.has("50"))}${chk("size", "65", "65型以上", f.size.has("65"))}</div>
        <div class="fgroup"><strong>連続稼働時間</strong>
          ${chk("hours", "18", "18時間まで", f.hours.has("18"))}${chk("hours", "24", "24時間（つけっぱなし）", f.hours.has("24"))}</div>
        ${state.mount === "wall" ? `<div class="fgroup"><strong>設置向き</strong>${chk("portrait", "1", "縦に設置したい", f.portrait)}</div>` : ""}
        <div class="fgroup"><strong>設置環境</strong>
          ${chk("dust", "1", "防塵（IP5X）・強化ガラス", f.dust)}${chk("outdoor", "1", "屋外で使いたい", f.outdoor)}
          <small class="muted">屋外に対応した商品は現在ありません。防塵モデルも屋内専用・防水ではありません。</small></div>
        <div class="fgroup"><strong>機能</strong>
          ${chk("player", "1", "メディアプレーヤー内蔵", f.player)}${chk("wall", "1", "ディスプレイウォール対応", f.wall)}</div>
        <label class="toggle"><input type="checkbox" id="show-eol" ${state.showEol ? "checked" : ""}> 生産終了品も表示</label>
      </aside>
      <div class="main-col">
        <h2>② 映す：ディスプレイを選ぶ <small class="muted">${list.length}機種</small></h2>
        <div class="grid-cards">${cards}</div>
        ${d ? nextBtn("s-mount", "③ 取り付ける") : ""}
      </div>
    </section>

    ${d ? `
    <section class="panel" id="s-mount">
      <h2>③ 取り付ける：${state.mount === "wall" ? "壁掛け金具を選ぶ" : "イーゼルスタンド"}</h2>
      ${state.mount === "floor" ? `<p class="muted">イーゼルスタンドは、ディスプレイを縦向きにして設置する前提でご案内しています。</p>` : ""}
      <div class="grid-mounts">${mountHtml}</div>
      ${nextBtn("s-play", "④ 再生させる")}
    </section>

    <section class="panel" id="s-play">
      <h2>④ 再生させる：再生のしかたを選ぶ</h2>
      <div class="choices">${players}</div>
      ${devHtml}
      <div class="needs">
        <strong>あわせて必要なもの</strong>
        ${needs}
        <div class="alert alert-bad">⚠ ${esc(P.warn)}</div>
        <a href="${esc(manualUrl)}" target="_blank" rel="noopener" class="small-link">${esc(P.manualLabel)}</a>
      </div>
      ${nextBtn("s-iss", "⑤ 保守")}
    </section>

    <section class="panel" id="s-iss">
      <h2>⑤ 保守サービス（ISS）</h2>
      <div class="alert alert-warn"><strong>お申込みは商品ご購入から60日以内（サービス購入と利用登録まで）</strong></div>
      <ul class="list">
        <li>${iss}</li>
        ${state.mount === "wall" ? "<li>壁掛けの場合、ディスプレイの上端が床から2mを超えると訪問保守の作業対象外になります。</li>" : ""}
        <li>液晶パネル破損にも対応する「破損対応タイプ」もあります。</li>
      </ul>
      <a href="${esc(S.links.issLcd)}" target="_blank" rel="noopener" class="small-link">液晶ディスプレイの保守サービス（アイ・オー・データ公式）を見る →</a>
      ${nextBtn("s-set", "選んだセットを確認")}
    </section>

    <section class="panel set-panel" id="s-set">
      <div class="set-head">
        <h2>選んだセット</h2>
        <button type="button" class="btn-copy" id="copy-set">型番をコピー</button>
      </div>
      <p class="muted small">各商品の「商品ページへ」から、仕様の確認やお見積り・ご購入にお進みください。</p>
      <div class="set-grid">
        ${setItems.map((x) => `
          <div class="set-card">
            <span class="set-role">${esc(x.role)}</span>
            <div class="set-icon">${x.icon}</div>
            <strong class="sku">${esc(x.name)}</strong>
            <small class="muted">${esc(x.sub)}</small>
            ${prodLink(x.url, x.role === "保守" ? "保守サービスを見る" : "商品ページへ")}
          </div>`).join("")}
      </div>
      <p id="copy-msg" class="muted small" hidden>コピーしました</p>
    </section>` : ""}

    <section class="footnotes">
      <p>※ Android STBは表示を回転できるため、縦に設置する場合も、横向きのコンテンツを倒して作る必要はなく、9:16の縦コンテンツをそのまま使えます。</p>
      <p>※ I-O DATA Device Management（IDM）で、離れた場所から機器の状態確認や再起動の指示ができます。<a href="${esc(S.links.idm)}" target="_blank" rel="noopener">詳しくはこちら</a></p>
    </section>`;
}

/* ---------- やりたいことで選ぶ ---------- */
function renderWants() {
  const W = S.wants;
  const chip = (c) => `<button type="button" class="chip ${state.wants.has(c.id) ? "is-on" : ""}" aria-pressed="${state.wants.has(c.id)}" data-want="${c.id}">${esc(c.label)}</button>`;
  const picked = W.play.filter((c) => state.wants.has(c.id));
  const MARK = { o: ["✓", "m-ok"], p: ["△", "m-warn"], x: ["✗", "m-bad"] };
  const methods = S.players.map((p) => {
    const rows = picked.map((c) => ({ c, v: c[p.id] }));
    const hasX = rows.some((r) => r.v[0] === "x"), hasP = rows.some((r) => r.v[0] === "p");
    const badge = !rows.length ? "—" : hasX ? "対応できない項目あり" : hasP ? "条件付きで対応" : "すべて対応";
    const tone = !rows.length ? "none" : hasX ? "bad" : hasP ? "warn" : "good";
    return `
      <div class="card method tone-${tone}">
        <div class="mount-head"><span class="mount-name">${ICON[p.id]}<strong>${esc(p.name)}</strong></span><span class="verdict v-${tone}">${badge}</span></div>
        <small class="muted">${esc(p.sub)}</small>
        ${rows.map((r) => `<div class="mrow"><span class="mark ${MARK[r.v[0]][1]}">${MARK[r.v[0]][0]}</span><span><strong>${esc(r.c.label)}</strong><br><small class="muted">${esc(r.v[1])}</small></span></div>`).join("")}
        ${p.manualUrl ? `<a href="${esc(p.manualUrl)}" target="_blank" rel="noopener" class="small-link">${esc(p.manualLabel)}</a>` : ""}
      </div>`;
  }).join("");
  const dispPicked = W.display.filter((c) => state.wants.has(c.id));

  $("#view-wants").innerHTML = `
    <section class="panel">
      <h1 class="h-page">サイネージでやりたいことを選んでください（いくつでも）</h1>
      <div class="fgroup"><strong class="muted">再生のしかた</strong><div class="chips">${W.play.map(chip).join("")}</div></div>
      <div class="fgroup"><strong class="muted">ディスプレイ・設置</strong><div class="chips">${W.display.map(chip).join("")}</div></div>
    </section>
    <section class="panel">
      <h2>再生のしかたごとの対応</h2>
      ${picked.length ? "" : `<p class="muted">「再生のしかた」を選ぶと、3つの方法でできる・できないを比べられます。</p>`}
      <div class="grid-mounts">${methods}</div>
    </section>
    ${state.wants.has("power") ? `
    <section class="panel">
      <h2>自動で電源ON/OFF：組み合わせで実現します</h2>
      <div class="grid-mounts">
        <div class="soft"><strong>内蔵プレーヤー</strong><br>ディスプレイのスケジュール機能で電源ON → 電源ON後に自動再生 → 時刻になったら電源OFF</div>
        <div class="soft"><strong>Android STB＋デジタルポスター</strong><br>ディスプレイのスケジュール機能 → STBの電源も連動 → STBの「起動時アプリ設定」でデジタルポスターを自動起動</div>
        <div class="soft"><strong>Windows＋時間割看板2</strong><br>時間割看板2の自動実行で再生 → スケジュールシャットダウンで終了。PCの起動はPC側の設定が必要です</div>
      </div>
      <p class="muted small">※ STBの「自動再起動スケジュール」は電源を入れ直す機能です。毎日の電源ON/OFFではなく、長く安定して動かすための定期リフレッシュ用です。</p>
      <div class="dashed small">
        <strong>参考：市販のコンセントタイマーと組み合わせる方法（I-O DATA製品ではありません）</strong>
        <ol>
          <li>通電したときに機器が自動で起動する設定になっているかをご確認ください。</li>
          <li>コンセントの電源が切れると強制的にシャットダウンされます。Windows PCの場合は、時間割看板2で先にシャットダウンさせてからタイマーで電源を切ってください。</li>
        </ol>
      </div>
    </section>` : ""}
    ${dispPicked.length ? `
    <section class="panel">
      <h2>ディスプレイの絞り込みに反映されます</h2>
      ${dispPicked.map((c) => `<p><strong>${esc(c.label)}</strong> → ${esc(c.effect)}</p>`).join("")}
    </section>` : ""}
    <div class="right"><button type="button" class="btn-primary" id="apply-wants">この条件でセットを選ぶ →</button></div>`;
}

function applyWants() {
  const w = state.wants;
  if (w.has("h24")) state.f.hours = new Set(["24"]);
  if (w.has("dust")) state.f.dust = true;
  if (w.has("outdoor")) state.f.outdoor = true;
  if (w.has("portrait")) { if (state.mount === "wall") state.f.portrait = true; }
  // すべて対応できる再生方法があれば、それを選んでおく
  const picked = S.wants.play.filter((c) => w.has(c.id));
  if (picked.length) {
    const best = S.players.find((p) => picked.every((c) => c[p.id][0] === "o"))
             || S.players.find((p) => picked.every((c) => c[p.id][0] !== "x"));
    if (best) state.play = best.id;
    if (best?.id === "builtin") state.f.player = true;
  }
  go("main");
}

/* ---------- ディスプレイウォール ---------- */
function renderWall() {
  const cols = state.wallCols, rows = state.wallRows, total = cols * rows;
  const quad = (big) => `<div class="quad ${big ? "big" : ""}"><div class="q1">1</div><div class="q2">2</div><div class="q3">3</div><div class="q4">4</div></div>`;
  const presets = [[2, 2, "田の字（2×2）"], [4, 1, "横一列（4台）"], [3, 1, "横一列（3台）"], [1, 3, "縦一列（3台）"], [3, 3, "3×3"]]
    .map(([c, r, l]) => `<button type="button" class="preset ${c === cols && r === rows ? "is-on" : ""}" data-preset="${c},${r}">
        <span class="mini" style="grid-template-columns:repeat(${c},1fr);width:${Math.min(84, c * 21)}px">${"<i></i>".repeat(c * r)}</span><small>${l}</small></button>`).join("");
  let cells = "";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
    cells += `<button type="button" class="cell ${c < cols && r < rows ? "is-on" : ""}" data-cell="${c + 1},${r + 1}" aria-label="横${c + 1}×縦${r + 1}を選ぶ"></button>`;

  const wd = D.filter((d) => d.displayWall && (state.showEol || d.status !== "eol"));
  const list = wd.length ? wd.map((d) => {
    const over = d.wallMax && total > d.wallMax;
    const size = d.widthMm && d.heightMm ? `約${(d.widthMm * cols / 1000).toFixed(1)}m × ${(d.heightMm * rows / 1000).toFixed(1)}m` : "—";
    return `<a class="card wall-card ${over ? "is-dim" : ""}" href="${esc(d.url)}" target="_blank" rel="noopener">
      ${screenIcon(d, false)}<strong>${esc(d.sku)}</strong>
      <small class="muted">最大${d.wallMax || "?"}画面・${d.hours ? d.hours + "時間連続稼働" : ""}${d.dustproof ? "・防塵IP5X" : ""}</small>
      <small>全体サイズ目安：${size}</small>${statusBadge(d.status)}</a>`;
  }).join("") : `<div class="empty">対応機種のデータがありません。</div>`;

  const small = S.wallSmall.map((s) => `<a class="card small-card ${total > s.max ? "is-dim" : ""}" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="screen-icon" style="width:44px;height:25px"></span><span><strong>${esc(s.sku)}</strong><br><small class="muted">${esc(s.size)}・最大${s.max}画面</small></span></a>`).join("");

  $("#view-wall").innerHTML = `
    <section class="panel">
      <h1 class="h-page">複数の画面をつなげて、大きく見せる</h1>
      <p>再生機から入ってきた1つの映像を、複数のディスプレイに分けて映します。最大25画面（5×5）まで組めます。</p>
      <div class="alert alert-warn">ディスプレイウォールでは、ディスプレイの内蔵メディアプレーヤーは使いません。外部の再生機（STB・PCなど）からHDMIで入ってきた映像を映す機能です。</div>
    </section>

    <section class="panel">
      <h2>しくみ（2×2の場合）</h2>
      <div class="flow">
        <div class="step">${quad(false)}<small>再生機が<br>4Kの映像を1つ出力</small></div>
        <span class="arrow">→</span>
        <div class="step"><div class="copies">${quad(false).repeat(4)}</div><small>HDMI分配器が<br>同じ4K映像をそのまま4台へ</small></div>
        <span class="arrow">→</span>
        <div class="step"><div class="tiles"><div class="q1">1</div><div class="q2">2</div><div class="q3">3</div><div class="q4">4</div></div><small>各ディスプレイが自分の担当部分を<br>拡大して表示</small></div>
      </div>
      <p class="muted">分配器は、入ってきた映像をどのディスプレイにも丸ごと同じように送ります。ディスプレイウォール機能をオンにすると、各ディスプレイが「私は左上」「私は右上」と自分の位置を覚え、映像のうち担当する部分だけを拡大（2×2なら2倍）して映します。これで全体が1枚につながって見えます。枠（ベゼル）によるズレは「額縁補正」で軽減できます。</p>
    </section>

    <section class="split">
      <div class="panel grow">
        <h2>① 並べ方を選ぶ</h2>
        <p class="muted">「田の字」だけでなく、横一列・縦一列などの並べ方もできます</p>
        <div class="presets">${presets}</div>
        <p class="muted small">ほかの並べ方は、マス目の右下にしたい位置をクリック（横 × 縦）</p>
        <div class="cells">${cells}</div>
        <div class="big-label">横${cols} × 縦${rows}（${total}画面）</div>
      </div>
      <div class="panel grow">
        <h2>② 必要なもの（自動計算）</h2>
        <div class="kv"><span>対応ディスプレイ（同じ型番）</span><strong>${total} 台</strong></div>
        <div class="kv"><span>壁掛け金具</span><strong>${total} 台</strong></div>
        <div class="kv"><span>再生機（STB・PCなど）</span><strong>1 台</strong></div>
        <div class="kv"><span>HDMI分配器（4ポート）</span><strong>${total <= 4 ? "1 台" : "要相談"}</strong></div>
        <div class="kv"><span>HDMIケーブル</span><strong>${total + 1} 本</strong></div>
        <p class="small">※再生機にAndroid STB（デジタルポスター）を使う場合は、動画・画像を入れる<strong>USBメモリーまたはmicroSDカード</strong>も必要です。</p>
        ${total > 4 ? `<div class="alert alert-warn small">5画面以上は分配器を複数組み合わせる構成になります。販売店・当社へご相談ください。</div>` : ""}
        <p class="muted small">おすすめ分配器：<a href="${esc(S.links.splitter1)}" target="_blank" rel="noopener">GP-HDSP14H460</a>、<a href="${esc(S.links.splitter2)}" target="_blank" rel="noopener">DA-4HD/4K</a>　※ディスプレイ1台ごとに保守サービス（ISS）の対象です。</p>
      </div>
    </section>

    <section class="panel">
      <h2>コンテンツの作り方</h2>
      <p>入力は1つですが、<strong>画面ごとに別々の映像を出すことも、全部つながった1枚の映像に見せることも、コンテンツの作り方次第でできます。</strong>どちらも、ふつうの16:9の映像として作ります。</p>
      <div class="flow">
        <div class="step">${quad(true)}<small>作るとき：16:9の映像を4つに区切る</small></div>
        <span class="arrow">→</span>
        <div class="step"><div class="row4"><div class="q1">1</div><div class="q2">2</div><div class="q3">3</div><div class="q4">4</div></div><small>映すとき：横一列（1×4）に並ぶ</small></div>
      </div>
      <ul class="list">
        <li>横一列に4台並べる場合、作るときの<strong>左上が一番左</strong>、<strong>右上が左から2番目</strong>、左下が3番目、右下が4番目の画面になります。</li>
        <li>横一列に3台並べる場合も同じ作り方です。<strong>右下の枠は映す画面がないので表示されません</strong>（絵を入れても映りません）。</li>
        <li>4つの枠にそれぞれ別の絵を入れれば「画面ごとに別々の映像」、1枚の絵をまたがって入れれば「つながった大きな映像」になります。1本の映像の中で両方を切り替えることもできます。</li>
        <li>すべての画面が同じ映像から出ているので、切り替わりのタイミングは自動でそろいます。</li>
      </ul>
    </section>

    <section class="panel">
      <h2>③ 対応ディスプレイ</h2>
      <p class="muted">仕様に「ディスプレイウォール」の記載がある機種を表示しています</p>
      <div class="grid-cards">${list}</div>
      <div class="sub-block">
        <strong>例外：小さめのモデルにも対応機種があります（最大4画面）</strong>
        <div class="choices">${small}</div>
        ${total > 4 ? `<small class="text-bad">選んだ並べ方（${total}画面）には、この2機種は使えません。</small>` : ""}
      </div>
    </section>

    <section class="panel">
      <h2>ご注意</h2>
      <ul class="list">
        <li>元の映像を分けて拡大するため、並べる台数が多いほど1画面あたりの精細さは下がります。</li>
        <li>壁掛け金具の収納ユニットが、隣のディスプレイの金具と干渉しないか設置前にご確認ください。</li>
        <li>詳しい設定方法は、各ディスプレイの取扱説明書（ディスプレイウォール設定）をご覧ください。</li>
      </ul>
    </section>`;
}

function copySet() {
  const text = state._copyText || "";
  const done = () => { const m = $("#copy-msg"); if (m) { m.hidden = false; setTimeout(() => (m.hidden = true), 2000); } };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch {}
  ta.remove();
}

/* ---------- 画面切り替え・イベント ---------- */
function go(view) {
  state.view = view;
  for (const v of ["main", "wants", "wall"]) $(`#view-${v}`).hidden = v !== view;
  if (view === "main") renderMain();
  if (view === "wants") renderWants();
  if (view === "wall") renderWall();
  const hash = view === "main" ? "" : "#" + view;
  if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname);
  window.scrollTo(0, 0);
}
function refresh() { // スクロール位置を保ったまま描き直す
  const y = window.scrollY;
  if (state.view === "main") renderMain();
  if (state.view === "wants") renderWants();
  if (state.view === "wall") renderWall();
  window.scrollTo(0, y);
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-nav],[data-mount],[data-disp],[data-mountsel],[data-device],[data-play],[data-want],[data-preset],[data-cell],[data-scroll],#apply-wants,#copy-set");
  if (!t) return;
  if (t.dataset.nav) { ev.preventDefault(); go(t.dataset.nav); return; }
  if (t.dataset.scroll) { document.getElementById(t.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (t.id === "copy-set") { copySet(); return; }
  if (t.dataset.mount) { state.mount = t.dataset.mount; state.mountSel = null; if (state.mount === "floor") state.f.portrait = false; }
  else if (t.dataset.disp) { state.sel = t.dataset.disp; state.mountSel = null; }
  else if (t.dataset.mountsel) state.mountSel = t.dataset.mountsel;
  else if (t.dataset.device) state.device[state.play] = t.dataset.device;
  else if (t.dataset.play) state.play = t.dataset.play;
  else if (t.dataset.want) { const w = t.dataset.want; state.wants.has(w) ? state.wants.delete(w) : state.wants.add(w); }
  else if (t.dataset.preset) { const [c, r] = t.dataset.preset.split(",").map(Number); state.wallCols = c; state.wallRows = r; }
  else if (t.dataset.cell) { const [c, r] = t.dataset.cell.split(",").map(Number); if (c * r < 2) return; state.wallCols = c; state.wallRows = r; }
  else if (t.id === "apply-wants") { applyWants(); return; }
  refresh();
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "show-eol") { state.showEol = t.checked; refresh(); return; }
  const k = t.dataset.filter;
  if (!k) return;
  if (k === "size" || k === "hours") t.checked ? state.f[k].add(t.value) : state.f[k].delete(t.value);
  else state.f[k] = t.checked;
  refresh();
});
window.addEventListener("hashchange", () => {
  const v = location.hash.replace("#", "");
  go(["wants", "wall"].includes(v) ? v : "main");
});

/* ---------- 起動 ---------- */
async function start() {
  const [disp, stat] = await Promise.all([
    fetch("data/displays.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/static.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  D = disp.displays || [];
  META = disp;
  S = stat;
  const up = META.updatedAt ? new Date(META.updatedAt) : null;
  if (up) {
    const days = Math.floor((Date.now() - up.getTime()) / 86400000);
    const el = $("#updated-at");
    el.textContent = `データ最終更新日：${up.getFullYear()}年${up.getMonth() + 1}月${up.getDate()}日`;
    if (days > STALE_DAYS) { el.textContent += `（${days}日間更新されていません）`; el.classList.add("text-bad"); }
  }
  if (META.sample) {
    const b = $("#data-banner");
    b.hidden = false;
    b.textContent = "表示中のデータは動作確認用のサンプルです。scripts/scrape.mjs を実行すると実際のデータに置き換わります。";
  }
  const v = location.hash.replace("#", "");
  go(["wants", "wall"].includes(v) ? v : "main");
}

function unlock() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  start().catch((e) => {
    $("#view-main").innerHTML = `<div class="panel"><p class="text-bad">データを読み込めませんでした（${esc(e.message)}）。</p></div>`;
  });
}
(function gate() {
  let ok = false;
  try { ok = sessionStorage.getItem("signage-ok") === "1"; } catch {}
  if (ok) return unlock();
  $("#gate-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if ($("#gate-input").value === SITE_PASSWORD) {
      try { sessionStorage.setItem("signage-ok", "1"); } catch {}
      unlock();
    } else {
      $("#gate-error").hidden = false;
    }
  });
  $("#gate-input").focus();
})();
