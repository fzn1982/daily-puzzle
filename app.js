/* 每日拼图 · 页面交互 */
(function () {
  "use strict";

  var Core = window.PuzzleCore;
  var PIECES = Core.PIECES;
  var PIECE_ORDER = Core.PIECE_ORDER;
  var orient = Core.orient;
  var bounds = Core.bounds;
  var solve = Core.solve;
  var buildCells = Core.buildCells;
  var targetKeys = Core.targetKeys;

  /* ================= 日期 ================= */
  var WEEK_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  function weekdayOf(y, m, d) { return new Date(y, m - 1, d).getDay(); }
  function makeDateKey(dt) { return dt.y + "-" + dt.m + "-" + dt.d; }
  function isoOf(dt) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return dt.y + "-" + pad(dt.m) + "-" + pad(dt.d);
  }
  function parseISO(str) {
    var mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
    if (!mm) return null;
    var y = +mm[1], mo = +mm[2], d = +mm[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function todayInfo() {
    var n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
  }
  function isToday() {
    return view.y === TODAY.y && view.m === TODAY.m && view.d === TODAY.d;
  }

  var TODAY = todayInfo();
  var view = (function () {
    var q = null;
    try { q = new URLSearchParams(location.search).get("date"); } catch (err) {}
    return parseISO(q) || { y: TODAY.y, m: TODAY.m, d: TODAY.d };
  })();
  view.w = weekdayOf(view.y, view.m, view.d);
  var dateKey = makeDateKey(view);

  /* ================= 棋盘 ================= */
  var cells = buildCells();
  var cellMap = new Map(cells.map(function (c) { return [c.key, c]; }));
  var targets = targetKeys(view.y, view.m, view.d, view.w);
  var targetSet = new Set(targets);

  /* ================= 几何 ================= */
  var VB = { x: -0.74, y: -1.28, w: 8.48, h: 10.02 };
  var PAD = 0.1;

  var COLORS = {
    A: "#e0a05c", B: "#83ab8b", C: "#8b9bd2", D: "#d18b86", E: "#c7a35f",
    F: "#89b3c1", G: "#b28ac2", H: "#a3a961", I: "#d38fa5", J: "#7ba79e"
  };

  /* ---------- 圆角多边形 ---------- */
  function autoRadii(pts, convex, concave) {
    return pts.map(function (p, i) {
      var a = pts[(i - 1 + pts.length) % pts.length];
      var b = pts[(i + 1) % pts.length];
      var cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
      return cross > 0 ? convex : concave;
    });
  }

  function roundedPath(pts, radii) {
    var n = pts.length;
    var d = "";
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n];
      var p1 = pts[i];
      var p2 = pts[(i + 1) % n];
      var v1x = p0[0] - p1[0], v1y = p0[1] - p1[1];
      var v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
      var l1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
      var l2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
      var r = Math.min(radii[i], l1 / 2, l2 / 2);
      var ax = p1[0] + (v1x / l1) * r, ay = p1[1] + (v1y / l1) * r;
      var bx = p1[0] + (v2x / l2) * r, by = p1[1] + (v2y / l2) * r;
      d += (i === 0 ? "M" : "L") + ax.toFixed(4) + " " + ay.toFixed(4) + " ";
      d += "Q" + p1[0] + " " + p1[1] + " " + bx.toFixed(4) + " " + by.toFixed(4) + " ";
    }
    return d + "Z";
  }

  var SLAB_PTS = [[-0.52, -1.06], [6.74, -1.06], [6.74, 1.0], [7.52, 1.56], [7.52, 8.52], [-0.52, 8.52]];
  var TRAY_PTS = [[0, 0], [6, 0], [6, 2], [7, 2], [7, 8], [4, 8], [4, 7], [0, 7]];
  var SLAB_D = roundedPath(SLAB_PTS, autoRadii(SLAB_PTS, 0.3, 0.15));
  var TRAY_D = roundedPath(TRAY_PTS, autoRadii(TRAY_PTS, 0.14, 0.09));
  var PLAQUE_D =
    "M 0.02 8.52 L 0.02 7.15 Q 0.02 7.0 0.17 7.0 L 3.83 7.0 Q 3.98 7.0 3.98 7.15 L 3.98 8.52 Z";

  /* ---------- 拼块轮廓 ---------- */
  function outlinePath(cellList) {
    var set = new Set(cellList.map(function (p) { return p[0] + "," + p[1]; }));
    function has(r, c) { return set.has(r + "," + c); }
    var edges = new Map();
    function addEdge(x1, y1, x2, y2) { edges.set(x1 + "," + y1, [x2, y2]); }
    cellList.forEach(function (p) {
      var r = p[0], c = p[1];
      if (!has(r - 1, c)) addEdge(c, r, c + 1, r);
      if (!has(r, c + 1)) addEdge(c + 1, r, c + 1, r + 1);
      if (!has(r + 1, c)) addEdge(c + 1, r + 1, c, r + 1);
      if (!has(r, c - 1)) addEdge(c, r + 1, c, r);
    });
    if (!edges.size) return "";
    var start = edges.keys().next().value;
    var pts = [];
    var cur = start;
    for (var guard = 0; guard < 400; guard++) {
      var xy = cur.split(",");
      pts.push([Number(xy[0]), Number(xy[1])]);
      var nx = edges.get(cur);
      if (!nx) break;
      var nk = nx[0] + "," + nx[1];
      if (nk === start) break;
      cur = nk;
    }
    var corners = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[(i - 1 + pts.length) % pts.length];
      var b = pts[i];
      var c2 = pts[(i + 1) % pts.length];
      if ((b[0] - a[0]) * (c2[1] - b[1]) - (b[1] - a[1]) * (c2[0] - b[0]) !== 0) corners.push(b);
    }
    return roundedPath(corners, autoRadii(corners, 0.17, 0.085));
  }

  function pieceData(id, rot, flip) {
    var shape = orient(PIECES[id], rot, flip);
    var b = bounds(shape);
    return {
      shape: shape,
      w: b.w,
      h: b.h,
      d: outlinePath(shape),
      outline: outlinePath(shape),
      vb: (-PAD) + " " + (-PAD) + " " + (b.w + 2 * PAD) + " " + (b.h + 2 * PAD)
    };
  }

  function pieceMarkup(d, tint) {
    return (
      '<svg viewBox="' + d.vb + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<g transform="translate(0 0.075)"><path d="' + d.d + '" fill="#c1b291"/></g>' +
      '<path d="' + d.d + '" fill="url(#pieceGrad)" stroke="rgba(104,84,54,.46)" stroke-width="0.018"/>' +
      '<path class="tint" d="' + d.d + '" fill="' + (tint || "transparent") + '"/>' +
      "</svg>"
    );
  }

  /* ================= 棋盘绘制 ================= */
  var boardSvg = document.getElementById("boardSvg");

  function labelSize(type, label) {
    if (type === "week") return 0.33;
    return 0.4;
  }

  function boardMarkup(solution, opts) {
    var withSnap = !opts || opts.snap !== false;
    var out = [];
    out.push('<path d="' + SLAB_D + '" fill="url(#slabGrad)"/>');
    out.push('<path class="tray-base" d="' + TRAY_D + '" fill="url(#trayGrad)"/>');
    out.push('<path class="tray-shade" d="' + TRAY_D + '" fill="url(#trayShade)"/>');

    cells.forEach(function (cell) {
      var r = cell.r, c = cell.c;
      var isTarget = targetSet.has(cell.key);
      out.push('<g class="cell' + (isTarget ? " is-target" : "") + '" data-key="' + cell.key + '">');
      out.push(
        '<rect x="' + (c + 0.042) + '" y="' + (r + 0.062) + '" width="0.916" height="0.916" rx="0.075" fill="rgba(96,76,46,.10)"/>'
      );
      out.push(
        '<rect x="' + (c + 0.042) + '" y="' + (r + 0.042) + '" width="0.916" height="0.916" rx="0.075" ' +
        'fill="' + (isTarget ? "url(#tileTarget)" : "url(#tileGrad)") + '" ' +
        'stroke="rgba(118,98,68,.09)" stroke-width="0.008"/>'
      );
      out.push(
        '<rect x="' + (c + 0.055) + '" y="' + (r + 0.055) + '" width="0.89" height="0.89" rx="0.065" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="0.008"/>'
      );
      if (isTarget) {
        out.push(
          '<rect class="target-glow" x="' + (c + 0.042) + '" y="' + (r + 0.042) + '" width="0.916" height="0.916" rx="0.075" ' +
          'fill="#7fb389" opacity="0"/>'
        );
        out.push(
          '<rect class="tring" x="' + (c + 0.085) + '" y="' + (r + 0.085) + '" width="0.83" height="0.83" rx="0.055" ' +
          'fill="none" stroke="#c8892c" stroke-width="0.023" stroke-dasharray="0.1 0.062" stroke-linecap="round"/>'
        );
      }
      var size = labelSize(cell.type, cell.label);
      var tl = cell.label.length > 2 ? ' textLength="0.865" lengthAdjust="spacingAndGlyphs"' : "";
      out.push(
        '<text x="' + (c + 0.5) + '" y="' + (r + 0.5) + '" text-anchor="middle" dominant-baseline="central" ' +
        'font-size="' + size + '" font-weight="600" fill="#4a4033"' + tl + ">" + cell.label + "</text>"
      );
      out.push("</g>");
    });

    out.push('<path d="' + PLAQUE_D + '" fill="url(#plaqueGrad)" filter="url(#plaqueShadow)"/>');
    out.push(
      '<text x="2.0" y="7.76" text-anchor="middle" dominant-baseline="central" font-size="0.46" ' +
      'letter-spacing="0.04" font-weight="600" fill="#7c6e5a">坚持就是胜利</text>'
    );
    out.push(
      '<text class="board-title" x="3.3" y="-0.44" text-anchor="middle" dominant-baseline="central" ' +
      'font-size="0.46" letter-spacing="0.07" font-weight="700" fill="#463d31">每日拼图</text>'
    );

    if (solution && solution.length) {
      out.push('<g class="solution-layer">');
      solution.forEach(function (p) {
        var d = outlinePath(p.cells);
        var color = COLORS[p.id] || "#999";
        var avgR = 0, avgC = 0;
        p.cells.forEach(function (q) { avgR += q[0]; avgC += q[1]; });
        avgR /= p.cells.length;
        avgC /= p.cells.length;
        var best = p.cells[0], bd = Infinity;
        p.cells.forEach(function (q) {
          var dd = (q[0] - avgR) * (q[0] - avgR) + (q[1] - avgC) * (q[1] - avgC);
          if (dd < bd) { bd = dd; best = q; }
        });
        out.push(
          '<g transform="translate(' + p.c + "," + p.r + ')">' +
          '<path d="' + d + '" fill="' + color + '" fill-opacity="1" stroke="rgba(255,255,255,.6)" stroke-width="0.02"/>' +
          '<text x="' + (best[1] + 0.5) + '" y="' + (best[0] + 0.5) + '" text-anchor="middle" dominant-baseline="central" ' +
          'font-size="0.3" font-weight="700" fill="#4a3f30" fill-opacity="0.78">' + p.id + "</text>" +
          "</g>"
        );
      });
      out.push("</g>");
    }

    if (withSnap) {
      out.push('<g id="snapLayer"></g>');
      out.push('<g id="hintLayer"></g>');
    }
    return out.join("");
  }

  /* ================= 状态 ================= */
  var orientations = {};
  PIECE_ORDER.forEach(function (id) { orientations[id] = { rot: 0, flip: false }; });

  var state = {
    placed: new Map(), // id -> {r,c,rot,flip}
    used: new Set(),
    history: [],
    drag: null,
    hint: null
  };

  var els = {
    boardWrap: document.querySelector(".board-wrap"),
    pieceLayer: document.getElementById("pieceLayer"),
    tray: document.getElementById("tray"),
    trayCard: document.querySelector(".tray-card"),
    dragLayer: document.getElementById("dragLayer"),
    placedNum: document.getElementById("placedNum"),
    btnUndo: document.getElementById("btnUndo"),
    btnReset: document.getElementById("btnReset"),
    btnSolution: document.getElementById("btnSolution"),
    dateCard: document.getElementById("dateCard"),
    datePop: document.getElementById("datePop"),
    dateInput: document.getElementById("dateInput"),
    btnPrevDay: document.getElementById("btnPrevDay"),
    btnNextDay: document.getElementById("btnNextDay"),
    btnToday: document.getElementById("btnToday"),
    btnRandom: document.getElementById("btnRandom"),
    btnGuide: document.getElementById("btnGuide"),
    btnHint: document.getElementById("btnHint"),
    guideModal: document.getElementById("guideModal"),
    pieceTable: document.getElementById("pieceTable"),
    btnGuideHint: document.getElementById("btnGuideHint"),
    btnGuideSolution: document.getElementById("btnGuideSolution"),
    btnHelp: document.getElementById("btnHelp"),
    welcomeModal: document.getElementById("welcomeModal"),
    btnWelcomeGuide: document.getElementById("btnWelcomeGuide"),
    welcomeMonth: document.getElementById("welcomeMonth"),
    welcomeDay: document.getElementById("welcomeDay"),
    welcomeWeek: document.getElementById("welcomeWeek"),
    modal: document.getElementById("modal"),
    solBoard: document.getElementById("solBoard"),
    modalSub: document.getElementById("modalSub"),
    btnAutoPlace: document.getElementById("btnAutoPlace"),
    winToast: document.getElementById("winToast"),
    confetti: document.getElementById("confetti"),
    toast: document.getElementById("toast"),
    trayCue: document.getElementById("trayCue")
  };

  var solutionCache = null;

  var DEBUG = false;
  try { DEBUG = new URLSearchParams(location.search).has("debug"); } catch (err) {}
  window.addEventListener("error", function (ev) {
    if (DEBUG) dbg("ERROR: " + (ev.message || "") + "\n" + ((ev.error && ev.error.stack) || ""));
  });

  function dbg(msg) {
    if (!DEBUG) return;
    var el = document.getElementById("dbgbox");
    if (!el) {
      el = document.createElement("pre");
      el.id = "dbgbox";
      el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(0,0,0,.9);color:#7dff9a;font:11px/1.45 monospace;padding:10px;max-width:92vw;max-height:62vh;overflow:auto;white-space:pre-wrap;border-radius:8px";
      document.body.appendChild(el);
    }
    el.textContent += msg + "\n";
  }

  /* ================= 辅助 ================= */
  function cellPx() {
    var r = boardSvg.getBoundingClientRect();
    return r.width / VB.w;
  }

  function gridOrigin() {
    var r = boardSvg.getBoundingClientRect();
    var s = r.width / VB.w;
    return { x: r.left - VB.x * s, y: r.top - VB.y * s, s: s };
  }

  function pctX(x) { return ((x - VB.x) / VB.w) * 100 + "%"; }
  function pctY(y) { return ((y - VB.y) / VB.h) * 100 + "%"; }
  function pctW(w) { return (w / VB.w) * 100 + "%"; }
  function pctH(h) { return (h / VB.h) * 100 + "%"; }

  function occupiedSet() {
    var occ = new Set();
    state.placed.forEach(function (p, id) {
      var shape = orient(PIECES[id], p.rot, p.flip);
      shape.forEach(function (q) {
        occ.add((p.r + q[0]) + "," + (p.c + q[1]));
      });
    });
    return occ;
  }

  function fits(shape, r0, c0, occ) {
    for (var i = 0; i < shape.length; i++) {
      var k = (r0 + shape[i][0]) + "," + (c0 + shape[i][1]);
      if (!cellMap.has(k) || occ.has(k)) return false;
    }
    return true;
  }

  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove("show"); }, ms || 2200);
  }

  /* ================= 托盘 ================= */
  var SLOT_DIMS = {};
  PIECE_ORDER.forEach(function (id) {
    var maxW = 1, maxH = 1;
    for (var f = 0; f < 2; f++) {
      for (var r = 0; r < 4; r++) {
        var b = bounds(orient(PIECES[id], r, f));
        if (b.w > maxW) maxW = b.w;
        if (b.h > maxH) maxH = b.h;
      }
    }
    SLOT_DIMS[id] = { w: maxW, h: maxH };
  });

  // 大托盘位（4×4）排前面，剩下 3×3，行更整齐；位置一旦确定就不再变
  var TRAY_ORDER = PIECE_ORDER.slice().sort(function (a, b) {
    var da = SLOT_DIMS[a], db = SLOT_DIMS[b];
    var diff = db.w * db.h - da.w * da.h;
    if (diff !== 0) return diff;
    return PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b);
  });

  function renderTray() {
    var html = "";
    TRAY_ORDER.forEach(function (id) {
      var o = orientations[id];
      var d = pieceData(id, o.rot, o.flip);
      var slot = SLOT_DIMS[id];
      var slotW = slot.w + 2 * PAD;
      var slotH = slot.h + 2 * PAD;
      var chipW = d.w + 2 * PAD;
      var chipH = d.h + 2 * PAD;
      var offX = (slotW - chipW) / 2;
      var offY = (slotH - chipH) / 2;
      var used = state.used.has(id);
      html +=
        '<div class="chip-slot' + (used ? " is-used" : "") + '" data-piece="' + id + '" ' +
        'data-slot-w="' + slotW.toFixed(3) + '" data-slot-h="' + slotH.toFixed(3) + '" ' +
        'style="width:calc(var(--chip) * ' + slotW.toFixed(3) + ');height:calc(var(--chip) * ' + slotH.toFixed(3) + ')">' +
        '<button type="button" class="chip' + (used ? " used" : "") + '" data-piece="' + id + '" ' +
        'style="width:calc(var(--chip) * ' + chipW.toFixed(3) + ');height:calc(var(--chip) * ' + chipH.toFixed(3) + ')" ' +
        'aria-label="拼块 ' + id + '">' + pieceMarkup(d, COLORS[id]) + "</button>" +
        '<button type="button" class="chip-flip" data-flip="' + id + '" ' +
        'style="top:calc(var(--chip) * ' + (offY - 0.45).toFixed(3) + ');right:calc(var(--chip) * ' + (offX - 0.45).toFixed(3) + ')" ' +
        'title="翻转（右键 / 长按也可以）" aria-label="翻转拼块 ' + id + '">⇄</button>' +
        "</div>";
    });
    els.tray.innerHTML = html;
    if (state.hint) {
      var hinted = els.tray.querySelector('.chip-slot[data-piece="' + state.hint.id + '"]');
      if (hinted) hinted.classList.add("hint");
    }
  }

  function updateChipStates() {
    Array.prototype.forEach.call(els.tray.querySelectorAll(".chip"), function (chip) {
      var id = chip.getAttribute("data-piece");
      var used = state.used.has(id);
      chip.classList.toggle("used", used);
      if (chip.parentNode && chip.parentNode.classList) {
        chip.parentNode.classList.toggle("is-used", used);
      }
    });
  }

  /* ================= 放置 ================= */
  function addPlacedEl(id, animate) {
    var p = state.placed.get(id);
    var d = pieceData(id, p.rot, p.flip);
    var el = document.createElement("div");
    el.className = "piece" + (animate ? " drop-in" : "");
    el.setAttribute("data-piece", id);
    el.style.left = pctX(p.c - PAD);
    el.style.top = pctY(p.r - PAD);
    el.style.width = pctW(d.w + 2 * PAD);
    el.style.height = pctH(d.h + 2 * PAD);
    el.innerHTML = pieceMarkup(d, COLORS[id]);
    els.pieceLayer.appendChild(el);
    return el;
  }

  function placePiece(id, r, c, rot, flip, opts) {
    var o = opts || {};
    var shape = orient(PIECES[id], rot, flip);
    var okfit = fits(shape, r, c, occupiedSet());
    if (DEBUG) dbg("place " + id + " @" + r + "," + c + " rot" + rot + (flip ? "F" : "") + " fits=" + okfit);
    if (!okfit) return false;
    state.placed.set(id, { r: r, c: c, rot: rot, flip: flip });
    state.used.add(id);
    if (!o.noHistory) state.history.push(id);
    addPlacedEl(id, !o.silent);
    orientations[id] = { rot: rot, flip: flip };
    updateChipStates();
    updateProgress();
    saveState();
    clearHint();
    if (!o.silent) checkWin();
    return true;
  }

  function removePlaced(id) {
    state.placed.delete(id);
    state.used.delete(id);
    var el = els.pieceLayer.querySelector('[data-piece="' + id + '"]');
    if (el) el.remove();
    updateChipStates();
    updateProgress();
    saveState();
    clearHint();
  }

  function clearBoard(silent) {
    clearHint();
    state.placed.clear();
    state.used.clear();
    state.history = [];
    els.pieceLayer.innerHTML = "";
    updateChipStates();
    updateProgress();
    els.boardWrap.classList.remove("solved");
    els.winToast.classList.remove("show");
    saveState();
    if (!silent) toast("已重新开始");
  }

  function updateProgress() {
    els.placedNum.textContent = String(state.placed.size);
    els.btnUndo.disabled = state.history.length === 0;
  }

  /* ================= 手机端：拼块提示 ================= */
  var HINT_SEEN_KEY = "daily-puzzle:mobile-hint-seen";

  function isMobileLayout() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  }

  function cueSeen() {
    try { return localStorage.getItem(HINT_SEEN_KEY) === "1"; } catch (err) { return false; }
  }

  function markCueSeen() {
    try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch (err) {}
  }

  function updateTrayCue() {
    if (!els.trayCue) return;
    if (!isMobileLayout() || state.drag || cueSeen()) {
      els.trayCue.hidden = true;
      return;
    }
    var r = els.trayCard.getBoundingClientRect();
    if (r.top < window.innerHeight - 150) {
      els.trayCue.hidden = true;
      return;
    }
    els.trayCue.hidden = false;
  }

  /* ================= 拼块拖拽 ================= */
  var pending = null;

  function beginPending(e, id, source, el) {
    if (state.drag) return;
    if (e.button !== undefined && e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    pending = {
      id: id,
      source: source,
      el: el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rect: el.getBoundingClientRect(),
      longTimer: setTimeout(function () {
        if (!pending || state.drag) return;
        pending.longFlipped = true;
        if (pending.source === "tray") flipChip(pending.id);
        else flipInPlace(pending.id);
      }, 560)
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
  }

  function endPending() {
    if (pending && pending.longTimer) clearTimeout(pending.longTimer);
    pending = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
  }

  function startDrag(e) {
    var info = pending;
    if (info.longTimer) clearTimeout(info.longTimer);
    pending = null;
    var id = info.id;
    var o = orientations[id];
    var s = cellPx();
    var d = pieceData(id, o.rot, o.flip);
    var ghostW = (d.w + 2 * PAD) * s;
    var ghostH = (d.h + 2 * PAD) * s;

    var dx = (info.startX - info.rect.left) * (ghostW / info.rect.width);
    var dy = (info.startY - info.rect.top) * (ghostH / info.rect.height);

    var ghost = document.createElement("div");
    ghost.className = "piece";
    ghost.style.width = ghostW + "px";
    ghost.style.height = ghostH + "px";
    ghost.innerHTML = pieceMarkup(d, COLORS[id]);
    ghost.style.transform = "translate3d(" + (info.startX - dx) + "px," + (info.startY - dy) + "px,0)";
    els.dragLayer.appendChild(ghost);

    var home = null;
    if (info.source === "board") {
      var p = state.placed.get(id);
      if (p) {
        home = { r: p.r, c: p.c };
        state.history = state.history.filter(function (x) { return x !== id; });
        removePlaced(id);
      }
    } else if (info.el) {
      info.el.classList.add("dragging");
    }

    var toolbar = document.createElement("div");
    toolbar.className = "drag-toolbar";
    toolbar.innerHTML =
      '<button type="button" data-act="rotate" title="旋转（R / 滚轮）" aria-label="旋转">↻</button>' +
      '<button type="button" data-act="flip" title="翻转（右键 / F）" aria-label="翻转">⇄</button>';
    els.dragLayer.appendChild(toolbar);
    toolbar.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (btn.getAttribute("data-act") === "rotate") rotateDrag(1);
      else flipDrag();
    });
    toolbar.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });

    if (els.trayCue) els.trayCue.hidden = true;

    state.drag = {
      id: id,
      source: info.source,
      ghost: ghost,
      toolbar: toolbar,
      ghostW: ghostW,
      ghostH: ghostH,
      dx: dx,
      dy: dy,
      left: info.startX - dx,
      top: info.startY - dy,
      px: info.startX,
      py: info.startY,
      snap: null,
      home: home,
      chip: info.source === "tray" ? info.el : null,
      pointerId: info.pointerId,
      moved: false
    };

    updateGhostPos();
    updateToolbarPos();
    updateSnap();

    window.addEventListener("keydown", onDragKey, false);
    window.addEventListener("wheel", onWheel, { passive: false });
  }

  function updateGhostPos() {
    var d = state.drag;
    if (!d) return;
    d.ghost.style.transform = "translate3d(" + d.left + "px," + d.top + "px,0)";
  }

  function updateToolbarPos() {
    var d = state.drag;
    if (!d) return;
    var w = d.toolbar.offsetWidth || 96;
    var h = 50;
    var x = d.px - w / 2;
    x = Math.max(10, Math.min(window.innerWidth - w - 10, x));
    var y = d.top - h - 12;
    if (y < 10) y = d.top + d.ghostH + 12;
    y = Math.min(window.innerHeight - h - 10, y);
    d.toolbar.style.left = Math.round(x) + "px";
    d.toolbar.style.top = Math.round(y) + "px";
  }

  function updateSnap() {
    var d = state.drag;
    if (!d) return;
    var shape = orient(PIECES[d.id], orientations[d.id].rot, orientations[d.id].flip);
    var g = gridOrigin();
    var fc = (d.left + PAD * g.s - g.x) / g.s;
    var fr = (d.top + PAD * g.s - g.y) / g.s;
    var occ = occupiedSet();
    var best = null;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var r0 = Math.round(fr) + dr;
        var c0 = Math.round(fc) + dc;
        var dist = Math.sqrt((r0 - fr) * (r0 - fr) + (c0 - fc) * (c0 - fc));
        if (dist > 0.78) continue;
        if (fits(shape, r0, c0, occ)) {
          if (!best || dist < best.dist) best = { r: r0, c: c0, dist: dist };
        }
      }
    }
    d.snap = best;
    var layer = document.getElementById("snapLayer");
    if (!layer) return;
    if (!best) { layer.innerHTML = ""; return; }
    layer.innerHTML =
      '<g transform="translate(' + best.c + "," + best.r + ')"><path class="snap-path" d="' +
      outlinePath(shape) + '"/></g>';
  }

  function onPointerMove(e) {
    if (pending && !state.drag && e.pointerId !== pending.pointerId) return;
    if (pending && !state.drag) {
      var dist = Math.sqrt((e.clientX - pending.startX) * (e.clientX - pending.startX) + (e.clientY - pending.startY) * (e.clientY - pending.startY));
      if (dist < 5) return;
      startDrag(e);
    }
    var d = state.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    d.left = e.clientX - d.dx;
    d.top = e.clientY - d.dy;
    d.px = e.clientX;
    d.py = e.clientY;
    d.moved = true;
    updateGhostPos();
    updateToolbarPos();
    updateSnap();
  }

  function onPointerUp(e) {
    if (state.drag) {
      if (e.pointerId !== state.drag.pointerId) return;
      finishDrag(e);
      return;
    }
    if (pending) {
      if (e.pointerId !== pending.pointerId) return;
      var info = pending;
      endPending();
      if (!info.longFlipped) handleTap(info);
    }
  }

  function handleTap(info) {
    if (info.source === "tray") {
      rotateChip(info.id, 1);
    } else {
      rotateInPlace(info.id);
    }
  }

  function rotateChip(id, dir) {
    var o = orientations[id];
    o.rot = (o.rot + dir + 4) % 4;
    renderTray();
  }

  function flipChip(id) {
    var o = orientations[id];
    o.flip = !o.flip;
    renderTray();
  }

  function applyInPlace(id, newRot, newFlip) {
    var p = state.placed.get(id);
    if (!p) return false;
    var newShape = orient(PIECES[id], newRot, newFlip);
    var oldShape = orient(PIECES[id], p.rot, p.flip);
    var nb = bounds(newShape);
    var ob = bounds(oldShape);
    var r0 = p.r + (ob.h - nb.h) / 2;
    var c0 = p.c + (ob.w - nb.w) / 2;
    var occ = new Set();
    state.placed.forEach(function (q, qid) {
      if (qid === id) return;
      orient(PIECES[qid], q.rot, q.flip).forEach(function (t) {
        occ.add((q.r + t[0]) + "," + (q.c + t[1]));
      });
    });
    var candidates = [
      [p.r, p.c],
      [Math.round(r0), Math.round(c0)],
      [Math.floor(r0), Math.floor(c0)],
      [Math.round(r0), Math.floor(c0)],
      [Math.floor(r0), Math.round(c0)]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var rr = candidates[i][0], cc = candidates[i][1];
      if (!fits(newShape, rr, cc, occ)) continue;
      state.placed.set(id, { r: rr, c: cc, rot: newRot, flip: newFlip });
      orientations[id] = { rot: newRot, flip: newFlip };
      var el = els.pieceLayer.querySelector('[data-piece="' + id + '"]');
      if (el) {
        var d = pieceData(id, newRot, newFlip);
        el.style.left = pctX(cc - PAD);
        el.style.top = pctY(rr - PAD);
        el.style.width = pctW(d.w + 2 * PAD);
        el.style.height = pctH(d.h + 2 * PAD);
        el.innerHTML = pieceMarkup(d, COLORS[id]);
        el.classList.remove("drop-in");
        void el.offsetWidth;
        el.classList.add("drop-in");
      }
      saveState();
      checkWin();
      return true;
    }
    return false;
  }

  function rotateInPlace(id) {
    var p = state.placed.get(id);
    if (!p) return;
    if (!applyInPlace(id, (p.rot + 1) % 4, p.flip)) toast("这里转不开，先挪个位置");
  }

  function flipInPlace(id) {
    var p = state.placed.get(id);
    if (!p) return;
    if (!applyInPlace(id, p.rot, !p.flip)) toast("这里翻不开，先挪个位置");
  }

  function rotateDrag(dir) {
    var d = state.drag;
    if (!d) return;
    var o = orientations[d.id];
    o.rot = (o.rot + dir + 4) % 4;
    rebuildGhost();
  }

  function flipDrag() {
    var d = state.drag;
    if (!d) return;
    var o = orientations[d.id];
    o.flip = !o.flip;
    rebuildGhost();
  }

  function rebuildGhost() {
    var d = state.drag;
    if (!d) return;
    var o = orientations[d.id];
    var s = cellPx();
    var data = pieceData(d.id, o.rot, o.flip);
    var w = (data.w + 2 * PAD) * s;
    var h = (data.h + 2 * PAD) * s;
    d.ghost.innerHTML = pieceMarkup(data, COLORS[d.id]);
    d.ghost.style.width = w + "px";
    d.ghost.style.height = h + "px";
    d.dx = w / 2;
    d.dy = h / 2;
    d.ghostW = w;
    d.ghostH = h;
    d.left = d.px - d.dx;
    d.top = d.py - d.dy;
    updateGhostPos();
    updateToolbarPos();
    updateSnap();
  }

  function onDragKey(e) {
    var d = state.drag;
    if (!d) return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateDrag(e.shiftKey ? -1 : 1); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); flipDrag(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelDrag(); }
  }

  function onWheel(e) {
    var d = state.drag;
    if (!d) return;
    e.preventDefault();
    rotateDrag(e.deltaY > 0 ? 1 : -1);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && pending) { endPending(); }
  }

  function animateGhost(toX, toY, scale, then) {
    var d = state.drag;
    if (!d) return;
    var g = d.ghost;
    g.style.transformOrigin = "0 0";
    g.style.transition = "transform .24s cubic-bezier(.25,.8,.3,1)";
    g.style.transform = "translate(" + toX + "px," + toY + "px)" + (scale && scale !== 1 ? " scale(" + scale + ")" : "");
    d.toolbar.remove();
    setTimeout(then, 235);
  }

  function cleanupDrag() {
    var d = state.drag;
    if (!d) return;
    window.removeEventListener("keydown", onDragKey);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheel);
    if (d.ghost && d.ghost.parentNode) d.ghost.remove();
    if (d.toolbar && d.toolbar.parentNode) d.toolbar.remove();
    var layer = document.getElementById("snapLayer");
    if (layer) layer.innerHTML = "";
    if (d.chip) d.chip.classList.remove("dragging");
    els.tray.classList.remove("drop-hint");
    state.drag = null;
    updateTrayCue();
  }

  function finishDrag(e) {
    var d = state.drag;
    if (!d) return;
    window.removeEventListener("keydown", onKeyDown);
    var snap = d.snap;
    var s = cellPx();

    if (snap) {
      var g = gridOrigin();
      var tx = g.x + snap.c * g.s - PAD * g.s;
      var ty = g.y + snap.r * g.s - PAD * g.s;
      var id = d.id;
      var rot = orientations[id].rot;
      var flip = orientations[id].flip;
      d.snapped = true;
      animateGhost(tx, ty, 1, function () {
        state.drag = null;
        window.removeEventListener("keydown", onDragKey);
        window.removeEventListener("wheel", onWheel);
        if (d.ghost && d.ghost.parentNode) d.ghost.remove();
        var layer = document.getElementById("snapLayer");
        if (layer) layer.innerHTML = "";
        if (placePiece(id, snap.r, snap.c, rot, flip)) {
          renderTray();
        } else {
          renderTray();
        }
      });
      return;
    }

    var overTray = pointInRect(e.clientX, e.clientY, els.trayCard.getBoundingClientRect());

    if (d.source === "board" && overTray) {
      var chip = els.tray.querySelector('[data-piece="' + d.id + '"]');
      var rect = chip ? chip.getBoundingClientRect() : els.trayCard.getBoundingClientRect();
      var scale = Math.max(0.2, rect.width / d.ghostW);
      animateGhost(rect.left, rect.top, scale, function () {
        cleanupDrag();
        renderTray();
        toast("已放回拼块区");
      });
      return;
    }

    if (d.home) {
      var gg = gridOrigin();
      var hx = gg.x + d.home.c * gg.s - PAD * gg.s;
      var hy = gg.y + d.home.r * gg.s - PAD * gg.s;
      animateGhost(hx, hy, 1, function () {
        cleanupDrag();
        placePiece(d.id, d.home.r, d.home.c, orientations[d.id].rot, orientations[d.id].flip, { noHistory: true });
        renderTray();
      });
      return;
    }

    if (d.chip) {
      var r2 = d.chip.getBoundingClientRect();
      var sc = Math.max(0.2, r2.width / d.ghostW);
      animateGhost(r2.left, r2.top, sc, function () {
        cleanupDrag();
        renderTray();
      });
    } else {
      cleanupDrag();
      renderTray();
    }
  }

  function cancelDrag() {
    var d = state.drag;
    if (!d) return;
    if (d.source === "board" && d.home) {
      cleanupDrag();
      placePiece(d.id, d.home.r, d.home.c, orientations[d.id].rot, orientations[d.id].flip, { noHistory: true });
      renderTray();
    } else {
      cleanupDrag();
      renderTray();
    }
  }

  function pointInRect(x, y, r) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ================= 胜利 ================= */
  function checkWin() {
    if (state.placed.size !== 10) return;
    var occ = occupiedSet();
    var empty = cells.map(function (c) { return c.key; }).filter(function (k) { return !occ.has(k); });
    if (empty.length === 3 && empty.every(function (k) { return targetSet.has(k); })) {
      onWin();
    } else {
      toast("拼块用完啦，但空出的不是今天的日期，再调整一下～", 3200);
    }
  }

  function onWin() {
    els.boardWrap.classList.add("solved");
    els.winToast.classList.add("show");
    els.winToast.setAttribute("aria-hidden", "false");
    celebrate();
    saveState();
    setTimeout(function () {
      els.winToast.classList.remove("show");
    }, 9000);
  }

  function celebrate() {
    var colors = ["#e8a13f", "#8fae83", "#d98b8b", "#8d9ed6", "#c9a35f", "#b48bc4", "#f0e0c0"];
    els.confetti.innerHTML = "";
    for (var i = 0; i < 54; i++) {
      var s = document.createElement("i");
      s.style.left = Math.random() * 100 + "vw";
      s.style.background = colors[i % colors.length];
      s.style.width = 5 + Math.random() * 6 + "px";
      s.style.height = 9 + Math.random() * 9 + "px";
      s.style.animationDelay = Math.random() * 0.55 + "s";
      s.style.animationDuration = 1.7 + Math.random() * 1.3 + "s";
      s.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      els.confetti.appendChild(s);
    }
    setTimeout(function () { els.confetti.innerHTML = ""; }, 3600);
  }

  /* ================= 存档 ================= */
  function storageKey() { return "daily-puzzle:" + dateKey; }
  function oriKey() { return "daily-puzzle-ori:" + dateKey; }

  function saveState() {
    try {
      var arr = [];
      state.placed.forEach(function (p, id) {
        arr.push({ id: id, r: p.r, c: p.c, rot: p.rot, flip: p.flip });
      });
      localStorage.setItem(storageKey(), JSON.stringify(arr));
      localStorage.setItem(oriKey(), JSON.stringify(orientations));
    } catch (err) { /* 忽略 */ }
  }

  function restore() {
    var raw = null, rawOri = null;
    try {
      raw = localStorage.getItem(storageKey());
      rawOri = localStorage.getItem(oriKey());
    } catch (err) { return; }
    if (rawOri) {
      try {
        var oo = JSON.parse(rawOri);
        PIECE_ORDER.forEach(function (id) {
          if (oo && oo[id] && typeof oo[id].rot === "number") {
            orientations[id] = { rot: ((oo[id].rot % 4) + 4) % 4, flip: !!oo[id].flip };
          }
        });
      } catch (err) { /* 忽略 */ }
    }
    if (!raw) return;
    var list;
    try { list = JSON.parse(raw); } catch (err) { return; }
    if (!Array.isArray(list) || !list.length) return;
    var count = 0;
    list.forEach(function (item) {
      if (!item || !PIECES[item.id] || state.placed.has(item.id)) return;
      var rot = ((Number(item.rot) || 0) % 4 + 4) % 4;
      var flip = !!item.flip;
      var r = Number(item.r), c = Number(item.c);
      if (placePiece(item.id, r, c, rot, flip, { silent: true, noHistory: true })) count++;
    });
    if (count) {
      state.history = [];
      updateProgress();
      toast("已恢复上次的进度");
      if (state.placed.size === 10) {
        var occ = occupiedSet();
        var empty = cells.map(function (c) { return c.key; }).filter(function (k) { return !occ.has(k); });
        if (empty.length === 3 && empty.every(function (k) { return targetSet.has(k); })) {
          els.boardWrap.classList.add("solved");
        }
      }
    }
  }

  /* ================= 解题思路 · 提示 ================= */
  var PIECE_META = [
    { id: "E", name: "长条", count: 88, note: "最挑位置，先放" },
    { id: "C", name: "拐杖", count: 144, note: "4 长边，窄条 / 边缘" },
    { id: "G", name: "长 Z", count: 147, note: "上下错位的边" },
    { id: "A", name: "长 L", count: 152, note: "3+3 的拐角" },
    { id: "F", name: "阶梯", count: 155, note: "楼梯形空隙" },
    { id: "J", name: "T 形", count: 155, note: "3 格宽的顶边 / 底边" },
    { id: "B", name: "U 形", count: 177, note: "2×3 的凹口" },
    { id: "H", name: "P 形", count: 180, note: "边角好放" },
    { id: "I", name: "小 L", count: 193, note: "灵活" },
    { id: "D", name: "小 S", count: 194, note: "最灵活，最后放" }
  ];
  var HINT_ORDER = ["E", "C", "G", "A", "F", "J", "B", "H", "I", "D"];

  function buildPieceTable() {
    if (!els.pieceTable) return;
    var html = "";
    PIECE_META.forEach(function (m, idx) {
      var shape = orient(PIECES[m.id], 0, 0);
      var b = bounds(shape);
      var d = outlinePath(shape);
      html +=
        '<div class="pt-row' + (idx === 0 ? " pt-first" : "") + '">' +
        '<svg class="pt-icon" viewBox="' + (-0.12) + " " + (-0.12) + " " + (b.w + 0.24) + " " + (b.h + 0.24) + '">' +
        '<path d="' + d + '" fill="' + COLORS[m.id] + '" stroke="rgba(120,100,70,.28)" stroke-width="0.05"/>' +
        "</svg>" +
        '<span class="pt-name"><b>' + m.id + "</b>" + m.name + "</span>" +
        '<span class="pt-count">' + m.count + "</span>" +
        '<span class="pt-note">' + m.note + "</span>" +
        "</div>";
    });
    els.pieceTable.innerHTML = html;
  }

  function openGuide() {
    els.guideModal.hidden = false;
    syncBodyLock();
  }

  function closeGuide() {
    els.guideModal.hidden = true;
    syncBodyLock();
    updateTrayCue();
  }

  function clearHint() {
    state.hint = null;
    var layer = document.getElementById("hintLayer");
    if (layer) layer.innerHTML = "";
    Array.prototype.forEach.call(els.tray.querySelectorAll(".chip-slot.hint"), function (slot) {
      slot.classList.remove("hint");
    });
  }

  function drawHint(h) {
    clearHint();
    state.hint = h;
    var layer = document.getElementById("hintLayer");
    if (!layer) return;
    var shape = orient(PIECES[h.id], h.rot, h.flip);
    var d = outlinePath(shape);
    var avgR = 0, avgC = 0;
    shape.forEach(function (q) { avgR += q[0]; avgC += q[1]; });
    avgR /= shape.length;
    avgC /= shape.length;
    var best = shape[0], bd = Infinity;
    shape.forEach(function (q) {
      var dd = (q[0] - avgR) * (q[0] - avgR) + (q[1] - avgC) * (q[1] - avgC);
      if (dd < bd) { bd = dd; best = q; }
    });
    layer.innerHTML =
      '<g class="hint-ghost" transform="translate(' + h.c + "," + h.r + ')">' +
      '<path d="' + d + '"/>' +
      "</g>";
    var slot = els.tray.querySelector('.chip-slot[data-piece="' + h.id + '"]');
    if (slot) slot.classList.add("hint");
  }

  function requestHint() {
    if (state.drag) return;
    var fixed = [];
    state.placed.forEach(function (p, id) {
      fixed.push({ id: id, r: p.r, c: p.c, rot: p.rot, flip: p.flip });
    });
    var btn = els.btnHint;
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "…";
    setTimeout(function () {
      var sol = solve(cells, targets, { fixed: fixed });
      btn.disabled = false;
      btn.textContent = old;
      if (!sol) {
        toast("现在这样摆走不通，先撤销一两块再试", 3200);
        return;
      }
      if (!sol.length) {
        toast("已经拼满啦，点「重来」再来一局");
        return;
      }
      var pick = null;
      for (var i = 0; i < HINT_ORDER.length && !pick; i++) {
        for (var j = 0; j < sol.length; j++) {
          if (sol[j].id === HINT_ORDER[i]) { pick = sol[j]; break; }
        }
      }
      if (!pick) pick = sol[0];
      drawHint({ id: pick.id, r: pick.r, c: pick.c, rot: pick.rot, flip: pick.flip });
      toast("提示：把 " + pick.id + " 块放到高亮的虚线位置", 3400);
    }, 20);
  }

  /* ================= 参考答案 ================= */
  function getSolution(cb) {
    if (solutionCache) { cb(solutionCache); return; }
    var t0 = Date.now();
    setTimeout(function () {
      var sol = solve(cells, targets);
      solutionCache = sol;
      cb(sol);
    }, 30);
  }

  function syncBodyLock() {
    var open = (els.modal && !els.modal.hidden) ||
      (els.guideModal && !els.guideModal.hidden) ||
      (els.welcomeModal && !els.welcomeModal.hidden);
    document.body.style.overflow = open ? "hidden" : "";
  }

  function welcomeSeen() {
    try { return localStorage.getItem("daily-puzzle:welcome-seen") === "1"; } catch (err) { return false; }
  }

  function markWelcomeSeen() {
    try { localStorage.setItem("daily-puzzle:welcome-seen", "1"); } catch (err) {}
  }

  function openWelcome() {
    if (!els.welcomeModal) return;
    els.welcomeModal.hidden = false;
    if (els.trayCue) els.trayCue.hidden = true;
    syncBodyLock();
  }

  function closeWelcome() {
    if (!els.welcomeModal) return;
    els.welcomeModal.hidden = true;
    markWelcomeSeen();
    syncBodyLock();
    updateTrayCue();
  }

  function openModal(sol) {
    els.modal.hidden = false;
    syncBodyLock();
    els.modalSub.textContent =
      view.m + "月" + view.d + "日 · " + WEEK_FULL[view.w] + (sol ? "" : " · 暂无解");
    var markup = boardMarkup(sol, { snap: false });
    els.solBoard.innerHTML =
      '<svg viewBox="' + VB.x + " " + VB.y + " " + VB.w + " " + VB.h + '" role="img" aria-label="参考解法">' + markup + "</svg>";
    els.btnAutoPlace.disabled = !sol;
    els.btnAutoPlace.style.opacity = sol ? "" : "0.45";
    els.btnAutoPlace.textContent = sol ? "一键摆放" : "暂无解";
  }

  function closeModal() {
    els.modal.hidden = true;
    syncBodyLock();
  }

  function autoPlaceSolution() {
    if (!solutionCache) return;
    var sol = solutionCache;
    if (DEBUG) dbg("autoPlace n=" + sol.length + " " + sol.map(function (q) { return q.id + ":" + q.r + "," + q.c; }).join(" "));
    closeModal();
    clearBoard(true);
    sol.forEach(function (p, i) {
      setTimeout(function () {
        placePiece(p.id, p.r, p.c, p.rot, p.flip, { silent: true, noHistory: true });
      }, i * 55);
    });
    setTimeout(function () {
      els.boardWrap.classList.add("solved");
      celebrate();
      els.winToast.classList.add("show");
      setTimeout(function () { els.winToast.classList.remove("show"); }, 7000);
    }, sol.length * 55 + 80);
  }

  /* ================= 日期切换 ================= */
  function switchTo(dt, opts) {
    var opt = opts || {};
    if (!dt) return;
    if (dt.y === view.y && dt.m === view.m && dt.d === view.d) {
      if (!opt.silent) closeDatePop();
      return;
    }
    if (state.drag) cleanupDrag();
    saveState(); // 先把当前日期的进度存好
    clearHint();

    state.placed.clear();
    state.used.clear();
    state.history = [];
    els.pieceLayer.innerHTML = "";
    els.boardWrap.classList.remove("solved");
    els.winToast.classList.remove("show");
    solutionCache = null;

    view = { y: dt.y, m: dt.m, d: dt.d, w: weekdayOf(dt.y, dt.m, dt.d) };
    dateKey = makeDateKey(view);
    targets = targetKeys(view.y, view.m, view.d, view.w);
    targetSet = new Set(targets);

    PIECE_ORDER.forEach(function (id) { orientations[id] = { rot: 0, flip: false }; });

    setDateText();
    boardSvg.innerHTML = boardMarkup(null);
    renderTray();
    updateProgress();
    restore();

    if (!opt.silent) closeDatePop();
  }

  function shiftDay(delta) {
    var d = new Date(view.y, view.m - 1, view.d + delta);
    switchTo({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
  }

  function randomDay() {
    var start = new Date(1975, 0, 1).getTime();
    var end = new Date(2035, 11, 31).getTime();
    var d = new Date(start + Math.random() * (end - start));
    switchTo({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
  }

  function openDatePop() {
    els.datePop.hidden = false;
    els.dateCard.setAttribute("aria-expanded", "true");
    els.dateInput.value = isoOf(view);
  }

  function closeDatePop() {
    els.datePop.hidden = true;
    els.dateCard.setAttribute("aria-expanded", "false");
  }

  function toggleDatePop() {
    if (els.datePop.hidden) openDatePop(); else closeDatePop();
  }

  /* ================= 头部信息 ================= */
  function setDateText() {
    var main = view.m + "月" + view.d + "日";
    var week = WEEK_FULL[view.w];
    var weekShort = week.replace("星期", "周");
    document.getElementById("dateMain").textContent = main;
    document.getElementById("dateSub").textContent = view.y + "年 · " + week;
    document.getElementById("goalMonth").textContent = view.m + "月";
    document.getElementById("goalDay").textContent = view.d + "日";
    document.getElementById("goalWeek").textContent = weekShort;
    var note = document.getElementById("goalNoteTargets");
    if (note) note.textContent = view.m + "月 · " + view.d + "日 · " + weekShort;
    var label = document.getElementById("goalsLabel");
    if (label) label.textContent = isToday() ? "今日留空" : "本日留空";
    var card = document.getElementById("dateCard");
    if (card) card.classList.toggle("is-other", !isToday());
    var input = document.getElementById("dateInput");
    if (input) input.value = isoOf(view);
    var btnToday = document.getElementById("btnToday");
    if (btnToday) btnToday.disabled = isToday();
    if (els.welcomeMonth) {
      els.welcomeMonth.textContent = view.m + "月";
      els.welcomeDay.textContent = view.d + "日";
      els.welcomeWeek.textContent = weekShort;
    }
    document.title = "每日拼图 · " + main + " " + week;
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    els.tray.addEventListener("pointerdown", function (e) {
      var chip = e.target.closest ? e.target.closest(".chip") : null;
      if (!chip || chip.classList.contains("used")) return;
      beginPending(e, chip.getAttribute("data-piece"), "tray", chip);
    });

    els.tray.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".chip-flip") : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      flipChip(btn.getAttribute("data-flip"));
    });

    document.addEventListener("contextmenu", function (ev) {
      if (state.drag) { ev.preventDefault(); flipDrag(); return; }
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest(".chip-flip")) { ev.preventDefault(); return; }
      var chip = t.closest(".chip");
      var pieceEl = t.closest(".piece-layer .piece");
      var id = chip ? chip.getAttribute("data-piece") : (pieceEl ? pieceEl.getAttribute("data-piece") : null);
      if (!id) return;
      ev.preventDefault();
      if (pending) {
        // 触屏长按：可能同时触发长按计时器与 contextmenu，只翻转一次
        if (pending.id !== id || pending.longFlipped) return;
        pending.longFlipped = true;
        if (pending.longTimer) clearTimeout(pending.longTimer);
        if (pending.source === "tray") flipChip(id); else flipInPlace(id);
        return;
      }
      if (chip) flipChip(id); else flipInPlace(id);
    });

    els.pieceLayer.addEventListener("pointerdown", function (e) {
      var el = e.target.closest ? e.target.closest(".piece") : null;
      if (!el) return;
      beginPending(e, el.getAttribute("data-piece"), "board", el);
    });

    els.btnReset.addEventListener("click", function () {
      solutionCache = null;
      clearBoard();
    });

    els.btnUndo.addEventListener("click", function () {
      var id = state.history.pop();
      if (!id) return;
      removePlaced(id);
      renderTray();
      els.boardWrap.classList.remove("solved");
      els.winToast.classList.remove("show");
    });

    els.trayCue.addEventListener("click", function () {
      var card = els.trayCard;
      var targetY = window.scrollY + card.getBoundingClientRect().top - 64;
      var maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      targetY = Math.max(0, Math.min(maxY, targetY));
      els.trayCue.hidden = true;
      markCueSeen();
      try {
        window.scrollTo({ top: targetY, behavior: "smooth" });
      } catch (err) {
        window.scrollTo(0, targetY);
      }
      setTimeout(function () {
        if (Math.abs(window.scrollY - targetY) > 4) window.scrollTo(0, targetY);
      }, 500);
    });

    var cueTick = false;
    window.addEventListener("scroll", function () {
      if (cueTick) return;
      cueTick = true;
      requestAnimationFrame(function () {
        cueTick = false;
        if (window.scrollY > 30) markCueSeen();
        updateTrayCue();
      });
    }, { passive: true });
    window.addEventListener("resize", updateTrayCue);

    els.btnHelp.addEventListener("click", openWelcome);
    els.welcomeModal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close-welcome]") || e.target.classList.contains("modal-backdrop")) {
        closeWelcome();
      }
    });
    els.btnWelcomeGuide.addEventListener("click", function () {
      closeWelcome();
      openGuide();
    });

    els.btnGuide.addEventListener("click", openGuide);
    els.btnHint.addEventListener("click", requestHint);

    els.guideModal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close-guide]") || e.target.classList.contains("modal-backdrop")) {
        closeGuide();
      }
    });
    els.btnGuideHint.addEventListener("click", function () {
      closeGuide();
      setTimeout(requestHint, 120);
    });
    els.btnGuideSolution.addEventListener("click", function () {
      closeGuide();
      getSolution(function (sol) { openModal(sol); });
    });

    els.btnSolution.addEventListener("click", function () {
      var btn = els.btnSolution;
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = "解算中…";
      getSolution(function (sol) {
        btn.disabled = false;
        btn.textContent = old;
        openModal(sol);
      });
    });

    els.modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]") || e.target.classList.contains("modal-backdrop")) closeModal();
    });

    els.btnAutoPlace.addEventListener("click", autoPlaceSolution);

    els.dateCard.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDatePop();
    });
    els.datePop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () {
      if (!els.datePop.hidden) closeDatePop();
    });
    els.dateInput.addEventListener("change", function () {
      var dt = parseISO(els.dateInput.value);
      if (dt) switchTo(dt);
    });
    els.btnPrevDay.addEventListener("click", function () { shiftDay(-1); });
    els.btnNextDay.addEventListener("click", function () { shiftDay(1); });
    els.btnToday.addEventListener("click", function () {
      switchTo({ y: TODAY.y, m: TODAY.m, d: TODAY.d });
    });
    els.btnRandom.addEventListener("click", randomDay);

    document.getElementById("btnAgain").addEventListener("click", function () {
      els.winToast.classList.remove("show");
      clearBoard();
      renderTray();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !els.welcomeModal.hidden) { closeWelcome(); return; }
      if (e.key === "Escape" && !els.guideModal.hidden) closeGuide();
      if (e.key === "Escape" && !els.datePop.hidden) closeDatePop();
      if (e.key === "Escape" && !els.modal.hidden) closeModal();
      if ((e.key === "r" || e.key === "R") && !state.drag) {
        var el = document.elementFromPoint(lastPointer.x, lastPointer.y);
        var pieceEl = el && el.closest ? el.closest(".piece") : null;
        if (pieceEl) rotateInPlace(pieceEl.getAttribute("data-piece"));
      }
    });

    var lastPointer = { x: -1, y: -1 };
    window.addEventListener("pointermove", function (e) {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    }, { passive: true });

    window.addEventListener("resize", function () {
      if (!state.drag) updateProgress();
    });

    window.addEventListener("error", function (ev) {
      try { toast("出错了：" + (ev.message || "未知错误"), 5000); } catch (err) {}
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    setDateText();
    buildPieceTable();
    try {
      if (new URLSearchParams(location.search).has("static")) document.body.classList.add("no-anim");
    } catch (err) {}
    boardSvg.setAttribute("viewBox", VB.x + " " + VB.y + " " + VB.w + " " + VB.h);
    boardSvg.innerHTML = boardMarkup(null);
    renderTray();
    restore();
    updateProgress();
    bind();
    updateTrayCue();
    setTimeout(updateTrayCue, 400);
    setTimeout(function () {
      if (els.trayCue && !cueSeen()) els.trayCue.hidden = true;
    }, 12000);
    setTimeout(function () {
      if (!welcomeSeen()) {
        if (state.placed.size === 0) openWelcome();
        else markWelcomeSeen();
      }
    }, 650);

    if ("IntersectionObserver" in window && els.trayCard) {
      var trayIO = new IntersectionObserver(function () { updateTrayCue(); }, {
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
      });
      trayIO.observe(els.trayCard);
    }

    // 预热解算器（放到空闲时）
    var warm = function () { getSolution(function () {}); };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2500 });
    else setTimeout(warm, 1200);

    // 调试：?demo=solved / ?demo=modal （截图自检用）
    var demo = null;
    try { demo = new URLSearchParams(location.search).get("demo"); } catch (err) {}
    if (demo === "solved" || demo === "modal") {
      getSolution(function (sol) {
        if (!sol) return;
        if (demo === "modal") { openModal(sol); return; }
        sol.forEach(function (p) {
          placePiece(p.id, p.r, p.c, p.rot, p.flip, { silent: true, noHistory: true });
        });
        els.boardWrap.classList.add("solved");
        els.winToast.classList.add("show");
        celebrate();
      });
    }

    // 跨天：如果正看着“今天”，自动切到新的一天
    setInterval(function () {
      var t = todayInfo();
      if (t.y === TODAY.y && t.m === TODAY.m && t.d === TODAY.d) return;
      var wasToday = isToday();
      TODAY = t;
      if (wasToday) {
        switchTo({ y: t.y, m: t.m, d: t.d }, { silent: true });
        toast("新的一天，新的拼图！", 2400);
      } else {
        setDateText();
      }
    }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
