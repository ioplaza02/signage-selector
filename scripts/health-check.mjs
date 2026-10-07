// 取得結果の健全性チェック
//   node scripts/health-check.mjs <前回の displays.json> <今回の displays.json>
// 問題があれば理由を表示して終了コード1（GitHub Actions側で本番反映を止め、PRとIssueを作る）

import { readFile } from "node:fs/promises";

const [prevPath, nextPath] = process.argv.slice(2);
const load = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };
const prev = await load(prevPath);
const next = await load(nextPath);

const problems = [];
if (!next || !Array.isArray(next.displays)) {
  problems.push("今回の displays.json が読み込めません。");
} else {
  const n = next.displays.length;
  const p = prev?.displays?.length ?? 0;
  if (n === 0) problems.push("ディスプレイが1件も取得できていません。");
  if (p > 0 && n < p * 0.9) problems.push(`ディスプレイの件数が1割以上減りました（前回 ${p} → 今回 ${n}）。`);
  const lacking = (key) => next.displays.filter((d) => d[key] == null).length;
  for (const key of ["sizeInch", "widthMm", "weightKg"]) {
    const k = lacking(key);
    if (n > 0 && k / n > 0.3) problems.push(`「${key}」が取れていない機種が3割を超えています（${k}/${n}）。`);
  }
  const noMount = next.displays.filter((d) => ["DA-WM2", "DA-WML2", "DA-ES1"].every((m) => !d.mounts?.[m]?.sym || d.mounts[m].sym === "x")).length;
  if (n > 0 && noMount / n > 0.5) problems.push(`対応する金具が1つも無い機種が半数を超えています（${noMount}/${n}）。対応表の形式が変わった可能性があります。`);
}

if (problems.length) {
  console.log("健全性チェックで問題を検出しました:");
  for (const m of problems) console.log("- " + m);
  process.exit(1);
}
console.log(`健全性チェックOK（${next.displays.length}機種）`);
