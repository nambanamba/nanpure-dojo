// 問題づくり: node tools/gen.js [秒] [1テクあたりの数]
// 「そのテクニックを使わないと先へ進めない」問題を集めて puzzles.js に書く。
// どの手も答えと食い違わないか（消した候補が正解でないか）を毎回確かめる。
const fs = require('fs'), path = require('path');
const N = require('../engine.js');
const SEC = +(process.argv[2] || 300), PER = +(process.argv[3] || 8);
const OUT = path.join(__dirname, '..', 'puzzles.js');

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fullGrid() {
  const v = new Array(81).fill(0);
  (function rec(i) {
    if (i === 81) return true;
    for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (N.PEERS[i].some(p => v[p] === d)) continue;
      v[i] = d; if (rec(i + 1)) return true; v[i] = 0;
    }
    return false;
  })(0);
  return v.join('');
}
function makePuzzle() {
  const sol = fullGrid(), g = [...sol];
  for (const i of shuffle([...Array(41)].map((_, k) => k))) {
    const j = 80 - i, a = g[i], b = g[j];
    g[i] = '0'; g[j] = '0';
    if (N.countSolutions(g.join(''), 2) !== 1) { g[i] = a; g[j] = b; }
  }
  return { g: g.join(''), sol };
}

const bank = {};
for (const t of N.TECHS) if (!t.basic) bank[t.id] = [];
if (fs.existsSync(OUT)) {
  const old = JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, ''));
  for (const k in old) if (bank[k]) bank[k] = old[k];
}
const t0 = Date.now(); let made = 0, bad = 0;
while ((Date.now() - t0) / 1000 < SEC) {
  if (Object.values(bank).every(a => a.length >= PER)) break;
  const { g, sol } = makePuzzle(); made++;
  const r = N.solveLogic(g);
  // 検算: どの手も答えと合っているか
  let ok = true;
  for (const s of r.steps) {
    for (const p of s.place || []) if (+sol[p.i] !== p.d) ok = false;
    for (const e of s.elim || []) if (+sol[e.i] === e.d) ok = false;
    if (!ok) { bad++; console.log('NG', s.tech, g); break; }
  }
  if (!ok || !r.solved) continue;
  let top = -1; for (const s of r.steps) top = Math.max(top, N.TECH_INDEX[s.tech]);
  const id = N.TECHS[top].id;
  if (!bank[id] || bank[id].length >= PER) continue;
  const start = r.steps.findIndex(s => s.tech === id);
  const uses = r.steps.filter(s => N.TECH_INDEX[s.tech] >= 2).length;
  bank[id].push({ g, s: start, n: uses });
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${id} ${bank[id].length}/${PER}`);
  fs.writeFileSync(OUT, 'window.PUZZLES = ' + JSON.stringify(bank) + ';\n');
}
fs.writeFileSync(OUT, 'window.PUZZLES = ' + JSON.stringify(bank) + ';\n');
console.log(`made ${made}, bad ${bad}`);
for (const k in bank) console.log(k, bank[k].length);
