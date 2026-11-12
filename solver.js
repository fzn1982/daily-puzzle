/* 每日拼图 · 核心逻辑（棋盘 / 拼块 / 求解器）
 * 同时支持浏览器（window.PuzzleCore）与 Node（module.exports），便于离线验证。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PuzzleCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 拼块造型：按实物照片逐格还原的 10 块，共 47 格 */
  const SHAPES = {
    A: ["###", "#..", "#.."],
    B: ["##", "#.", "##"],
    C: ["#...", "####"],
    D: ["#.", "##", ".#"],
    E: ["####"],
    F: [".##", ".#.", "##."],
    G: ["##..", ".###"],
    H: ["###", ".##"],
    I: ["#.", "#.", "##"],
    J: [".#.", ".#.", "###"]
  };

  const PIECE_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  function shapeCells(rows) {
    const out = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === "#") out.push([r, c]);
    });
    return out;
  }

  const PIECES = {};
  PIECE_ORDER.forEach((id) => (PIECES[id] = shapeCells(SHAPES[id])));

  /* 棋盘：7 列 × 8 行；上两行 6 格（月份），第 3–7 行 7 格，
     最后一行只有第 5–7 列（周四/周五/周六），左下为“坚持就是胜利”铭牌 */
  function buildCells() {
    const cells = [];
    const add = (r, c, label, type, value) =>
      cells.push({ r, c, key: r + "," + c, label, type, value });

    for (let m = 1; m <= 12; m++) add(m <= 6 ? 0 : 1, (m - 1) % 6, m + "月", "month", m);
    for (let d = 1; d <= 31; d++) {
      const i = d - 1;
      add(2 + Math.floor(i / 7), i % 7, d + "日", "day", d);
    }
    for (let w = 0; w < 7; w++) {
      add(w < 4 ? 6 : 7, w < 4 ? 3 + w : 4 + (w - 4), WEEKDAYS[w], "week", w);
    }
    return cells;
  }

  /* 目标格：今天的 月 / 日 / 周几 */
  function targetKeys(year, month, day, weekday) {
    const keys = [];
    keys.push((month <= 6 ? 0 : 1) + "," + ((month - 1) % 6));
    keys.push((2 + Math.floor((day - 1) / 7)) + "," + ((day - 1) % 7));
    keys.push((weekday < 4 ? 6 : 7) + "," + (weekday < 4 ? 3 + weekday : weekday));
    return keys;
  }

  /* 旋转 / 翻转：rot 为 90° 次数，flip 为镜像 */
  function orient(cells, rot, flip) {
    let cs = cells.map((p) => [p[0], p[1]]);
    if (flip) cs = cs.map((p) => [p[0], -p[1]]);
    const n = ((rot % 4) + 4) % 4;
    for (let i = 0; i < n; i++) cs = cs.map((p) => [p[1], -p[0]]);
    let mr = Infinity, mc = Infinity;
    for (const p of cs) {
      if (p[0] < mr) mr = p[0];
      if (p[1] < mc) mc = p[1];
    }
    return cs.map((p) => [p[0] - mr, p[1] - mc]);
  }

  function bounds(cells) {
    let w = 0, h = 0;
    for (const [r, c] of cells) {
      if (r + 1 > h) h = r + 1;
      if (c + 1 > w) w = c + 1;
    }
    return { w, h };
  }

  /* 求解：在棋盘上放满 10 块，只留下 targetKeys 三格
     返回 [{id, r, c, rot, flip, cells}] 或 null */
  function solve(cells, targetKeysArray, opts) {
    const keys = cells.map((c) => c.key);
    const idx = new Map(keys.map((k, i) => [k, i]));
    const total = keys.length;
    const full = (1n << BigInt(total)) - 1n;

    const fixed = (opts && opts.fixed) || [];
    const fixedIds = new Set();
    const holeSet = new Set(targetKeysArray);

    let target = full;
    for (const k of targetKeysArray) {
      const i = idx.get(k);
      if (i === undefined) return null;
      target &= ~(1n << BigInt(i));
    }
    // 已放好的拼块：固定它们，剩下的再解
    for (const f of fixed) {
      if (!f || !PIECES[f.id] || fixedIds.has(f.id)) return null;
      fixedIds.add(f.id);
      const shape = orient(PIECES[f.id], f.rot, f.flip);
      for (const [r, c] of shape) {
        const k = (f.r + r) + "," + (f.c + c);
        const i = idx.get(k);
        if (i === undefined || holeSet.has(k)) return null;
        target &= ~(1n << BigInt(i));
      }
    }

    const all = []; // {id, mask, r, c, rot, flip}
    for (const id of PIECE_ORDER) {
      if (fixedIds.has(id)) continue;
      const base = PIECES[id];
      const seen = new Set();
      for (let flip = 0; flip < 2; flip++) {
        for (let rot = 0; rot < 4; rot++) {
          const shape = orient(base, rot, flip);
          const sig = shape.map((p) => p.join(",")).join(";");
          if (seen.has(sig)) continue;
          seen.add(sig);
          const { w, h } = bounds(shape);
          for (let r0 = 0; r0 + h <= 8; r0++) {
            for (let c0 = 0; c0 + w <= 7; c0++) {
              let mask = 0n;
              let ok = true;
              for (const [r, c] of shape) {
                const k = r0 + r + "," + (c0 + c);
                const i = idx.get(k);
                if (i === undefined) { ok = false; break; }
                mask |= 1n << BigInt(i);
              }
              if (ok) all.push({ id, mask, r: r0, c: c0, rot, flip, cells: shape });
            }
          }
        }
      }
    }

    // 每个格子可用的摆法索引
    const cellPl = Array.from({ length: total }, () => []);
    for (const p of all) {
      let m = p.mask;
      while (m) {
        const low = m & -m;
        const i = Number(low.toString(2).length - 1);
        cellPl[i].push(p);
        m ^= low;
      }
    }

    const used = new Set();
    const chosen = [];

    function dfs(rem) {
      if (rem === 0n) return true;
      let best = null;
      let bestI = -1;
      let m = rem;
      while (m) {
        const low = m & -m;
        const i = Number(low.toString(2).length - 1);
        m ^= low;
        const opts = [];
        const list = cellPl[i];
        for (let j = 0; j < list.length; j++) {
          const p = list[j];
          if (used.has(p.id)) continue;
          if ((p.mask & rem) === p.mask) opts.push(p);
        }
        if (opts.length === 0) return false;
        if (!best || opts.length < best.length) {
          best = opts;
          bestI = i;
          if (opts.length === 1) break;
        }
      }
      for (let j = 0; j < best.length; j++) {
        const p = best[j];
        used.add(p.id);
        chosen.push(p);
        if (dfs(rem & ~p.mask)) return true;
        chosen.pop();
        used.delete(p.id);
      }
      return false;
    }

    if (!dfs(target)) return null;
    return chosen.map((p) => ({
      id: p.id,
      r: p.r,
      c: p.c,
      rot: p.rot,
      flip: p.flip,
      cells: p.cells
    }));
  }

  return { SHAPES, PIECES, PIECE_ORDER, WEEKDAYS, buildCells, targetKeys, orient, bounds, solve };
});
