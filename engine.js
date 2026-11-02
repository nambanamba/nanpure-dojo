// ナンプレ道場 — 解き方エンジン（ブラウザと node の両方で動く）
(function (root) {
  'use strict';
  const ROW = i => (i / 9) | 0, COL = i => i % 9;
  const BOX = i => ((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0);
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push([...Array(9)].map((_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push([...Array(9)].map((_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3, a = [];
    for (let k = 0; k < 9; k++) a.push((br + ((k / 3) | 0)) * 9 + bc + (k % 3));
    UNITS.push(a);
  }
  const CELL_UNITS = [...Array(81)].map((_, i) => [ROW(i), 9 + COL(i), 18 + BOX(i)]);
  const SEES = [...Array(81)].map(() => new Uint8Array(81));
  const PEERS = [...Array(81)].map(() => []);
  for (let a = 0; a < 81; a++) for (let b = 0; b < 81; b++)
    if (a !== b && (ROW(a) === ROW(b) || COL(a) === COL(b) || BOX(a) === BOX(b))) { SEES[a][b] = 1; PEERS[a].push(b); }
  const sees = (a, b) => SEES[a][b] === 1;
  const bit = d => 1 << (d - 1);
  const pc = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const digits = m => { const a = []; for (let d = 1; d <= 9; d++) if (m & bit(d)) a.push(d); return a; };
  const name = i => `R${ROW(i) + 1}C${COL(i) + 1}`;
  const names = a => a.map(name).join('・');
  const unitName = u => u < 9 ? `${u + 1}行目` : u < 18 ? `${u - 8}列目` : `ブロック${u - 17}`;
  const dl = m => digits(m).join('・');
  function combos(arr, k) {
    const out = [], cur = [];
    (function rec(s) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = s; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
    })(0);
    return out;
  }

  // ---------- 状態 ----------
  function fromString(s) {
    const v = new Int8Array(81), c = new Uint16Array(81);
    for (let i = 0; i < 81; i++) { const ch = s[i]; v[i] = ch >= '1' && ch <= '9' ? +ch : 0; }
    for (let i = 0; i < 81; i++) {
      if (v[i]) continue;
      let m = 511;
      for (const p of PEERS[i]) if (v[p]) m &= ~bit(v[p]);
      c[i] = m;
    }
    return { v, c };
  }
  const clone = st => ({ v: Int8Array.from(st.v), c: Uint16Array.from(st.c) });
  function place(st, i, d) {
    st.v[i] = d; st.c[i] = 0;
    for (const p of PEERS[i]) st.c[p] &= ~bit(d);
  }
  function applyStep(st, step) {
    for (const p of step.place || []) place(st, p.i, p.d);
    for (const e of step.elim || []) st.c[e.i] &= ~bit(e.d);
  }
  const isSolved = st => st.v.every(x => x > 0);
  function cellsWith(st, cells, d) { const b = bit(d); return cells.filter(i => !st.v[i] && (st.c[i] & b)); }
  function placedIn(st, u, d) { return UNITS[u].some(i => st.v[i] === d); }
  function elimSeeingAll(st, d, from, exclude) {
    const out = [], b = bit(d);
    for (let i = 0; i < 81; i++) {
      if (st.v[i] || !(st.c[i] & b) || exclude.includes(i)) continue;
      if (from.every(f => sees(i, f))) out.push({ i, d });
    }
    return out;
  }
  const mk = (list, d, k) => list.map(i => ({ i, d, k }));

  // ---------- テクニック ----------
  function hiddenSingle(st) {
    const order = [...Array(9)].map((_, k) => 18 + k).concat([...Array(18)].map((_, k) => k));
    for (const u of order) for (let d = 1; d <= 9; d++) {
      if (placedIn(st, u, d)) continue;
      const p = cellsWith(st, UNITS[u], d);
      if (p.length === 1) return {
        place: [{ i: p[0], d }], cells: p, units: [u], marks: mk(p, d, 'key'), digit: d,
        h1: `${unitName(u)}を見てみよう。`,
        h2: `${unitName(u)}で、数字 ${d} が入れるマスをさがそう。`,
        text: `${unitName(u)}の中で、数字 <b>${d}</b> が入れるのは <b>${name(p[0])}</b> だけです。だから ${name(p[0])} = ${d}。`
      };
    }
    return null;
  }
  function nakedSingle(st) {
    for (let i = 0; i < 81; i++) if (!st.v[i] && pc(st.c[i]) === 1) {
      const d = digits(st.c[i])[0];
      return {
        place: [{ i, d }], cells: [i], marks: mk([i], d, 'key'), digit: d,
        h1: `候補が1つしかないマスがあります。`, h2: `${name(i)} を見てみよう。`,
        text: `${name(i)} の候補は <b>${d}</b> だけです。行・列・ブロックのほかの数字がすべて入っているからです。`
      };
    }
    return null;
  }
  function locked(st) {
    // ポインティング
    for (let b = 18; b < 27; b++) for (let d = 1; d <= 9; d++) {
      const p = cellsWith(st, UNITS[b], d);
      if (p.length < 2) continue;
      for (const [f, base] of [[ROW, 0], [COL, 9]]) {
        if (!p.every(i => f(i) === f(p[0]))) continue;
        const line = base + f(p[0]);
        const elim = cellsWith(st, UNITS[line], d).filter(i => BOX(i) !== b - 18).map(i => ({ i, d }));
        if (elim.length) return {
          elim, cells: p, units: [b, line], marks: mk(p, d, 'key'), digit: d, sub: 'ポインティング',
          h1: `数字 ${d} の「ロックされた候補」があります。`,
          h2: `${unitName(b)}の数字 ${d} の候補の並び方を見てみよう。`,
          text: `${unitName(b)}では、数字 <b>${d}</b> の候補が ${names(p)} の ${unitName(line)}にだけ並んでいます。` +
            `だから ${d} は${unitName(b)}の中の${unitName(line)}のどこかに必ず入ります。` +
            `<br>→ ${unitName(line)}の、ブロックの外にある ${d}（${names(elim.map(e => e.i))}）は消せます。`
        };
      }
    }
    // クレーミング
    for (let u = 0; u < 18; u++) for (let d = 1; d <= 9; d++) {
      const p = cellsWith(st, UNITS[u], d);
      if (p.length < 2 || !p.every(i => BOX(i) === BOX(p[0]))) continue;
      const b = 18 + BOX(p[0]);
      const elim = cellsWith(st, UNITS[b], d).filter(i => !p.includes(i)).map(i => ({ i, d }));
      if (elim.length) return {
        elim, cells: p, units: [u, b], marks: mk(p, d, 'key'), digit: d, sub: 'クレーミング',
        h1: `数字 ${d} の「ロックされた候補」があります。`,
        h2: `${unitName(u)}の数字 ${d} の候補がどのブロックにあるか見てみよう。`,
        text: `${unitName(u)}では、数字 <b>${d}</b> の候補（${names(p)}）が全部${unitName(b)}の中にあります。` +
          `だから${unitName(b)}の ${d} は、${unitName(u)}のこのマスのどれかです。` +
          `<br>→ ${unitName(b)}のほかのマスの ${d}（${names(elim.map(e => e.i))}）は消せます。`
      };
    }
    return null;
  }
  function nakedSubset(n, label) {
    return st => {
      for (let u = 0; u < 27; u++) {
        const empt = UNITS[u].filter(i => !st.v[i]);
        if (empt.length <= n) continue;
        const pool = empt.filter(i => pc(st.c[i]) >= 2 && pc(st.c[i]) <= n);
        for (const cs of combos(pool, n)) {
          let m = 0; for (const i of cs) m |= st.c[i];
          if (pc(m) !== n) continue;
          const elim = [];
          for (const i of empt) if (!cs.includes(i)) for (const d of digits(st.c[i] & m)) elim.push({ i, d });
          if (!elim.length) continue;
          const marks = []; for (const i of cs) for (const d of digits(st.c[i])) marks.push({ i, d, k: 'key' });
          return {
            elim, cells: cs, units: [u], marks,
            h1: `${unitName(u)}に「${label}」があります。`,
            h2: `${unitName(u)}で、候補が ${dl(m)} だけのマスを見てみよう。`,
            text: `${unitName(u)}の ${names(cs)} の${n}マスは、候補を合わせても {${dl(m)}} の${n}種類しかありません。` +
              `${n}マスに${n}種類なので、${dl(m)} はこの${n}マスで使い切ります。` +
              `<br>→ ${unitName(u)}のほかのマスから ${dl(m)} を消せます。`
          };
        }
      }
      return null;
    };
  }
  function hiddenSubset(n, label) {
    return st => {
      for (let u = 0; u < 27; u++) {
        const empt = UNITS[u].filter(i => !st.v[i]);
        if (empt.length <= n) continue;
        const ds = [];
        for (let d = 1; d <= 9; d++) {
          if (placedIn(st, u, d)) continue;
          const p = cellsWith(st, UNITS[u], d);
          if (p.length >= 2 && p.length <= n) ds.push(d);
        }
        for (const dc of combos(ds, n)) {
          const cs = new Set(); let dm = 0;
          for (const d of dc) { dm |= bit(d); for (const i of cellsWith(st, UNITS[u], d)) cs.add(i); }
          if (cs.size !== n) continue;
          const arr = [...cs].sort((a, b) => a - b), elim = [];
          for (const i of arr) for (const d of digits(st.c[i] & ~dm)) elim.push({ i, d });
          if (!elim.length) continue;
          const marks = []; for (const i of arr) for (const d of digits(st.c[i] & dm)) marks.push({ i, d, k: 'key' });
          return {
            elim, cells: arr, units: [u], marks,
            h1: `${unitName(u)}に「${label}」があります。`,
            h2: `${unitName(u)}で、数字 ${dc.join('・')} が入れるマスを数えてみよう。`,
            text: `${unitName(u)}で、数字 ${dc.join('・')} が入れるのは ${names(arr)} の${n}マスだけです。` +
              `${n}種類の数字が${n}マスに入るので、この${n}マスは ${dc.join('・')} で埋まります。` +
              `<br>→ この${n}マスにあるほかの候補は消せます。`
          };
        }
      }
      return null;
    };
  }
  function fish(n, label) {
    return st => {
      for (let d = 1; d <= 9; d++) for (const rowsBase of [true, false]) {
        const base = [], pos = {};
        for (let k = 0; k < 9; k++) {
          const u = rowsBase ? k : 9 + k;
          if (placedIn(st, u, d)) continue;
          const p = cellsWith(st, UNITS[u], d);
          if (p.length >= 2 && p.length <= n) { base.push(k); pos[k] = p; }
        }
        for (const bc of combos(base, n)) {
          const cover = new Set(), cells = [];
          for (const k of bc) for (const i of pos[k]) { cover.add(rowsBase ? COL(i) : ROW(i)); cells.push(i); }
          if (cover.size !== n) continue;
          const elim = [];
          for (const x of cover) {
            const u = rowsBase ? 9 + x : x;
            for (const i of cellsWith(st, UNITS[u], d)) if (!bc.includes(rowsBase ? ROW(i) : COL(i))) elim.push({ i, d });
          }
          if (!elim.length) continue;
          const bn = bc.map(k => `${k + 1}`).join('・'), cn = [...cover].sort().map(k => `${k + 1}`).join('・');
          const B = rowsBase ? '行' : '列', C = rowsBase ? '列' : '行';
          return {
            elim, cells, units: bc.map(k => rowsBase ? k : 9 + k), marks: mk(cells, d, 'key'), digit: d,
            h1: `数字 ${d} の「${label}」があります。`,
            h2: `数字 ${d} の候補が${n === 2 ? '2つ' : '2〜3つ'}しかない${B}を見てみよう。`,
            text: `数字 <b>${d}</b> は、${bn}${B}目で入れる場所が ${cn}${C}目にしかありません。` +
              `${n}本の${B}にそれぞれ${d}が1つずつ入るので、${cn}${C}目の${d}は全部この${n}本の${B}の中で決まります。` +
              `<br>→ ${cn}${C}目の、ほかの${B}にある ${d}（${names(elim.map(e => e.i))}）は消せます。`
          };
        }
      }
      return null;
    };
  }
  function skyscraper(st) {
    for (let d = 1; d <= 9; d++) for (const rowsBase of [true, false]) {
      const lines = [];
      for (let k = 0; k < 9; k++) {
        const p = cellsWith(st, UNITS[rowsBase ? k : 9 + k], d);
        if (p.length === 2) lines.push(p);
      }
      const cross = rowsBase ? COL : ROW;
      for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
        const A = lines[a], B = lines[b];
        for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
          if (cross(A[x]) !== cross(B[y]) || cross(A[1 - x]) === cross(B[1 - y])) continue;
          const e1 = A[1 - x], e2 = B[1 - y];
          const elim = elimSeeingAll(st, d, [e1, e2], [...A, ...B]);
          if (!elim.length) continue;
          const B_ = rowsBase ? '行' : '列', C = rowsBase ? '列' : '行';
          return {
            elim, cells: [...A, ...B], units: [], digit: d,
            marks: [...mk([A[x], B[y]], d, 'key'), ...mk([e1, e2], d, 'alt')],
            h1: `数字 ${d} の「スカイスクレイパー」があります。`,
            h2: `数字 ${d} の候補がちょうど2つの${B_}を2本さがそう。端がそろっている${C}があるはず。`,
            text: `数字 <b>${d}</b> は、${names(A)} と ${names(B)} の2本の${B_}でそれぞれ2か所にしか入れません。` +
              `土台の ${name(A[x])} と ${name(B[y])} は同じ${C}にあるので、両方が ${d} にはなれません。` +
              `だから屋根の <b>${name(e1)}</b> か <b>${name(e2)}</b> の少なくとも一方は ${d} です。` +
              `<br>→ 屋根の2マスの両方から見えるマスの ${d}（${names(elim.map(e => e.i))}）は消せます。`
          };
        }
      }
    }
    return null;
  }
  function kite(st) {
    for (let d = 1; d <= 9; d++) {
      const rows = [], cols = [];
      for (let k = 0; k < 9; k++) {
        const r = cellsWith(st, UNITS[k], d); if (r.length === 2) rows.push(r);
        const c = cellsWith(st, UNITS[9 + k], d); if (c.length === 2) cols.push(c);
      }
      for (const R of rows) for (const C of cols) for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
        const rr = R[x], cc = C[y], ro = R[1 - x], co = C[1 - y];
        if (new Set([rr, cc, ro, co]).size !== 4 || BOX(rr) !== BOX(cc)) continue;
        const elim = elimSeeingAll(st, d, [ro, co], [rr, cc, ro, co]);
        if (!elim.length) continue;
        return {
          elim, cells: [rr, cc, ro, co], units: [18 + BOX(rr)], digit: d,
          marks: [...mk([rr, cc], d, 'key'), ...mk([ro, co], d, 'alt')],
          h1: `数字 ${d} の「2ストリングカイト」があります。`,
          h2: `数字 ${d} の候補がちょうど2つの行と列で、片方の端が同じブロックにあるものをさがそう。`,
          text: `数字 <b>${d}</b> は、${ROW(rr) + 1}行目では ${names(R)}、${COL(cc) + 1}列目では ${names(C)} にしか入れません。` +
            `${name(rr)} と ${name(cc)} は同じブロックなので、両方が ${d} にはなれません。` +
            `だから反対側の <b>${name(ro)}</b> か <b>${name(co)}</b> の少なくとも一方は ${d} です。` +
            `<br>→ その2マスの両方から見えるマスの ${d}（${names(elim.map(e => e.i))}）は消せます。`
        };
      }
    }
    return null;
  }
  const bivalues = st => { const a = []; for (let i = 0; i < 81; i++) if (!st.v[i] && pc(st.c[i]) === 2) a.push(i); return a; };
  function xyWing(st) {
    const bv = bivalues(st);
    for (const P of bv) for (const A of bv) {
      if (A === P || !sees(A, P)) continue;
      const sh = st.c[A] & st.c[P];
      if (pc(sh) !== 1) continue;
      const z = st.c[A] & ~st.c[P], need = (st.c[P] & ~sh) | z;
      for (const B of bv) {
        if (B === P || B === A || !sees(B, P) || st.c[B] !== need) continue;
        const zd = digits(z)[0];
        const elim = elimSeeingAll(st, zd, [A, B], [P, A, B]);
        if (!elim.length) continue;
        const x = digits(sh)[0], y = digits(st.c[P] & ~sh)[0];
        return {
          elim, cells: [P, A, B], units: [], digit: zd,
          marks: [...mk([P], x, 'key'), ...mk([P], y, 'key2'), { i: A, d: x, k: 'key' }, { i: B, d: y, k: 'key2' }, ...mk([A, B], zd, 'alt')],
          h1: `「XYウィング」があります（消せる数字は ${zd}）。`,
          h2: `候補が2つのマス {${x}・${y}} を中心に、{${x}・${zd}} と {${y}・${zd}} のマスをさがそう。`,
          text: `中心 <b>${name(P)}</b> {${x}・${y}}、はさみ <b>${name(A)}</b> {${x}・${zd}} と <b>${name(B)}</b> {${y}・${zd}}。` +
            `<br>・中心が ${x} なら、${name(A)} は ${zd}。<br>・中心が ${y} なら、${name(B)} は ${zd}。` +
            `<br>どちらでも、はさみのどちらかは ${zd} です。<br>→ 両方のはさみから見えるマスの ${zd}（${names(elim.map(e => e.i))}）は消せます。`
        };
      }
    }
    return null;
  }
  function xyzWing(st) {
    const bv = bivalues(st);
    for (let P = 0; P < 81; P++) {
      if (st.v[P] || pc(st.c[P]) !== 3) continue;
      const wings = bv.filter(i => sees(i, P) && (st.c[i] & ~st.c[P]) === 0);
      for (let a = 0; a < wings.length; a++) for (let b = a + 1; b < wings.length; b++) {
        const A = wings[a], B = wings[b];
        if (st.c[A] === st.c[B]) continue;
        const z = st.c[A] & st.c[B]; if (pc(z) !== 1) continue;
        const zd = digits(z)[0];
        const elim = elimSeeingAll(st, zd, [P, A, B], [P, A, B]);
        if (!elim.length) continue;
        return {
          elim, cells: [P, A, B], units: [], digit: zd,
          marks: [...mk([P, A, B], zd, 'alt'), ...digits(st.c[P] & ~z).map(d => ({ i: P, d, k: 'key' })),
            ...digits(st.c[A] & ~z).map(d => ({ i: A, d, k: 'key' })), ...digits(st.c[B] & ~z).map(d => ({ i: B, d, k: 'key' }))],
          h1: `「XYZウィング」があります（消せる数字は ${zd}）。`,
          h2: `候補が3つのマス {${dl(st.c[P])}} を中心にさがそう。`,
          text: `中心 <b>${name(P)}</b> {${dl(st.c[P])}}、はさみ <b>${name(A)}</b> {${dl(st.c[A])}} と <b>${name(B)}</b> {${dl(st.c[B])}}。` +
            `<br>中心が何であっても、3マスのどれかは必ず ${zd} になります（中心が ${zd} の場合もある）。` +
            `<br>→ 3マス<b>全部</b>から見えるマスの ${zd}（${names(elim.map(e => e.i))}）は消せます。`
        };
      }
    }
    return null;
  }
  function wWing(st) {
    const bv = bivalues(st);
    for (let a = 0; a < bv.length; a++) for (let b = a + 1; b < bv.length; b++) {
      const A = bv[a], B = bv[b];
      if (st.c[A] !== st.c[B] || sees(A, B)) continue;
      const [d1, d2] = digits(st.c[A]);
      for (const [x, y] of [[d1, d2], [d2, d1]]) {
        const elim = elimSeeingAll(st, y, [A, B], [A, B]);
        if (!elim.length) continue;
        for (let u = 0; u < 27; u++) {
          const p = cellsWith(st, UNITS[u], x);
          if (p.length !== 2 || p.includes(A) || p.includes(B)) continue;
          let P, Q;
          if (sees(p[0], A) && sees(p[1], B)) [P, Q] = p; else if (sees(p[1], A) && sees(p[0], B)) [Q, P] = p; else continue;
          return {
            elim, cells: [A, B, P, Q], units: [u], digit: y,
            marks: [...mk([A, B], x, 'key'), ...mk([P, Q], x, 'key'), ...mk([A, B], y, 'alt')],
            h1: `「Wウィング」があります（消せる数字は ${y}）。`,
            h2: `同じ候補 {${x}・${y}} の2マスと、${x} が2か所しか入らないグループをさがそう。`,
            text: `<b>${name(A)}</b> と <b>${name(B)}</b> はどちらも {${x}・${y}}。` +
              `${unitName(u)}では ${x} が ${name(P)} と ${name(Q)} にしか入れず、${name(P)} は ${name(A)} から、${name(Q)} は ${name(B)} から見えます。` +
              `<br>もし両方が ${x} なら、${unitName(u)}に ${x} が入る場所がなくなります。だから少なくとも一方は ${y} です。` +
              `<br>→ 両方から見えるマスの ${y}（${names(elim.map(e => e.i))}）は消せます。`
          };
        }
      }
    }
    return null;
  }
  function coloring(st) {
    for (let d = 1; d <= 9; d++) {
      const adj = new Map();
      for (let u = 0; u < 27; u++) {
        const p = cellsWith(st, UNITS[u], d);
        if (p.length !== 2) continue;
        for (const [x, y] of [[p[0], p[1]], [p[1], p[0]]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); }
      }
      const color = new Map();
      for (const s of adj.keys()) {
        if (color.has(s)) continue;
        const comp = [s]; color.set(s, 0);
        for (let q = 0; q < comp.length; q++) for (const n of adj.get(comp[q])) if (!color.has(n)) { color.set(n, 1 - color.get(comp[q])); comp.push(n); }
        if (comp.length < 4) continue;
        const C = [comp.filter(i => color.get(i) === 0), comp.filter(i => color.get(i) === 1)];
        const marks = [...mk(C[0], d, 'key'), ...mk(C[1], d, 'key2')];
        const base = { cells: comp, units: [], digit: d, marks, h1: `数字 ${d} で「シンプルカラーリング」が使えます。`,
          h2: `数字 ${d} が2か所しか入らないグループ（強リンク）をつないで、交互に色をぬってみよう。` };
        const intro = `数字 <b>${d}</b> の強リンク（2か所しか入らないグループ）をつなぎ、交互に<span class="tk">緑</span>と<span class="tk2">青</span>にぬりました。どちらか一方の色が全部正解です。`;
        for (let k = 0; k < 2; k++) {
          const bad = C[k].some(a => C[k].some(b => sees(a, b)));
          if (bad) return { ...base, elim: C[k].map(i => ({ i, d })),
            text: intro + `<br>${k ? '青' : '緑'}のマスどうしが同じグループの中にあります。同じ数字が2つ入ってしまうので、${k ? '青' : '緑'}は間違いです。` +
              `<br>→ ${k ? '青' : '緑'}のマス全部から ${d} を消せます（${k ? '緑' : '青'}が正解）。` };
        }
        const elim = [];
        for (let i = 0; i < 81; i++) if (!st.v[i] && (st.c[i] & bit(d)) && !color.has(i) && C[0].some(a => sees(a, i)) && C[1].some(b => sees(b, i))) elim.push({ i, d });
        if (elim.length) return { ...base, elim,
          text: intro + `<br>緑と青の両方から見えるマスは、どちらの色が正解でも ${d} にはなれません。` +
            `<br>→ ${names(elim.map(e => e.i))} の ${d} は消せます。` };
      }
    }
    return null;
  }
  function uniqueRect(st) {
    for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      const q = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (q.some(i => st.v[i]) || new Set(q.map(BOX)).size !== 2) continue;
      for (const t of q) {
        const o = q.filter(i => i !== t), m = st.c[o[0]];
        if (pc(m) !== 2 || st.c[o[1]] !== m || st.c[o[2]] !== m || (st.c[t] & m) !== m || st.c[t] === m) continue;
        const elim = digits(m).map(d => ({ i: t, d }));
        const marks = []; for (const i of o) for (const d of digits(m)) marks.push({ i, d, k: 'key' });
        return {
          elim, cells: q, units: [], marks,
          h1: `「ユニークレクタングル」があります。`,
          h2: `候補が {${dl(m)}} だけのマスが長方形の3つの角にあるところをさがそう。`,
          text: `${names(o)} の3マスは候補が {${dl(m)}} だけで、${name(t)} と長方形（2行・2列・2ブロック）をつくります。` +
            `もし ${name(t)} も ${dl(m)} のどちらかなら、4マスの ${dl(m)} を入れかえた答えも成り立ち、答えが2つになってしまいます。` +
            `答えは1つなので、${name(t)} には ${dl(m)} 以外が入ります。<br>→ ${name(t)} の ${dl(m)} は消せます。`
        };
      }
    }
    return null;
  }
  function bug(st) {
    let tri = -1;
    for (let i = 0; i < 81; i++) {
      if (st.v[i]) continue;
      const n = pc(st.c[i]);
      if (n === 2) continue;
      if (n === 3 && tri < 0) { tri = i; continue; }
      return null;
    }
    if (tri < 0) return null;
    for (const d of digits(st.c[tri])) {
      if (cellsWith(st, UNITS[ROW(tri)], d).length !== 3) continue;
      return {
        place: [{ i: tri, d }], cells: [tri], units: [ROW(tri)], marks: mk(cellsWith(st, UNITS[ROW(tri)], d), d, 'key'), digit: d,
        h1: `「BUG+1」の形です。候補が3つのマスが1つだけあります。`,
        h2: `${name(tri)} の候補のうち、${ROW(tri) + 1}行目で3回出てくる数字は？`,
        text: `のこりのマスはすべて候補2つで、${name(tri)} だけが {${dl(st.c[tri])}} の3つです。` +
          `もしここも2択になると、全部のマスが2択になり答えが2つできてしまいます（BUG）。` +
          `${ROW(tri) + 1}行目では ${d} が3回出てきて、このマスが ${d} でないと2択がくずれません。<br>→ ${name(tri)} = <b>${d}</b>。`
      };
    }
    return null;
  }

  const TECHS = [
    { id: 'hsingle', name: '隠れたシングル', fn: hiddenSingle, basic: true },
    { id: 'nsingle', name: '裸のシングル', fn: nakedSingle, basic: true },
    { id: 'locked', name: 'ロックされた候補', fn: locked, lv: 1 },
    { id: 'npair', name: 'ネイキッドペア', fn: nakedSubset(2, 'ネイキッドペア'), lv: 1 },
    { id: 'hpair', name: 'ヒドゥンペア', fn: hiddenSubset(2, 'ヒドゥンペア'), lv: 1 },
    { id: 'ntriple', name: 'ネイキッドトリプル', fn: nakedSubset(3, 'ネイキッドトリプル'), lv: 1 },
    { id: 'htriple', name: 'ヒドゥントリプル', fn: hiddenSubset(3, 'ヒドゥントリプル'), lv: 1 },
    { id: 'xwing', name: 'Xウィング', fn: fish(2, 'Xウィング'), lv: 2 },
    { id: 'skyscraper', name: 'スカイスクレイパー', fn: skyscraper, lv: 2 },
    { id: 'kite', name: '2ストリングカイト', fn: kite, lv: 2 },
    { id: 'xywing', name: 'XYウィング', fn: xyWing, lv: 2 },
    { id: 'xyzwing', name: 'XYZウィング', fn: xyzWing, lv: 3 },
    { id: 'wwing', name: 'Wウィング', fn: wWing, lv: 3 },
    { id: 'swordfish', name: 'ソードフィッシュ', fn: fish(3, 'ソードフィッシュ'), lv: 3 },
    { id: 'coloring', name: 'シンプルカラーリング', fn: coloring, lv: 3 },
    { id: 'ur1', name: 'ユニークレクタングル', fn: uniqueRect, lv: 3 },
    { id: 'bug', name: 'BUG+1', fn: bug, lv: 3 },
  ];
  const TECH_INDEX = Object.fromEntries(TECHS.map((t, k) => [t.id, k]));

  function findStep(st, maxIdx = TECHS.length - 1) {
    for (let k = 0; k <= maxIdx; k++) {
      const s = TECHS[k].fn(st);
      if (s) { s.tech = TECHS[k].id; s.techName = TECHS[k].name; return s; }
    }
    return null;
  }
  function solveLogic(givens, maxIdx) {
    const st = fromString(givens), steps = [];
    for (let guard = 0; guard < 500; guard++) {
      if (isSolved(st)) break;
      if (st.v.some((x, i) => !x && !st.c[i])) break;
      const s = findStep(st, maxIdx);
      if (!s) break;
      steps.push(s); applyStep(st, s);
    }
    return { steps, solved: isSolved(st), state: st };
  }

  // ---------- 総当たり（答え・唯一解の確認） ----------
  function countSolutions(s, limit = 2, out) {
    const v = [...s].map(ch => (ch >= '1' && ch <= '9' ? +ch : 0));
    const R = new Uint16Array(9), C = new Uint16Array(9), B = new Uint16Array(9);
    for (let i = 0; i < 81; i++) if (v[i]) {
      const b = bit(v[i]);
      if ((R[ROW(i)] | C[COL(i)] | B[BOX(i)]) & b) return 0;
      R[ROW(i)] |= b; C[COL(i)] |= b; B[BOX(i)] |= b;
    }
    let count = 0;
    (function rec() {
      let best = -1, bm = 0, bn = 10;
      for (let i = 0; i < 81; i++) if (!v[i]) {
        const m = 511 & ~(R[ROW(i)] | C[COL(i)] | B[BOX(i)]), n = pc(m);
        if (n < bn) { bn = n; best = i; bm = m; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (out && count === 1) out.push(v.join('')); return; }
      if (bn === 0) return;
      const r = ROW(best), c = COL(best), b0 = BOX(best);
      for (let d = 1; d <= 9 && count < limit; d++) if (bm & bit(d)) {
        const b = bit(d); v[best] = d; R[r] |= b; C[c] |= b; B[b0] |= b;
        rec();
        v[best] = 0; R[r] &= ~b; C[c] &= ~b; B[b0] &= ~b;
      }
    })();
    return count;
  }
  function solution(s) { const o = []; return countSolutions(s, 2, o) === 1 ? o[0] : null; }

  const api = { ROW, COL, BOX, UNITS, PEERS, sees, bit, pc, digits, name, unitName, fromString, clone, place, applyStep,
    isSolved, findStep, solveLogic, countSolutions, solution, TECHS, TECH_INDEX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Nanpre = api;
})(this);
