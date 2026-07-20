/* ============================================================================
   THE FIRE — the painterly diorama engine, lifted from public/phase-two/lit-room.html
   (canvas-2D + LimeZu sprites) into a self-contained start/stop function so it can
   mount inside the React shell as the Commons' live face. The canvas scene is kept
   nearly verbatim — only the standalone page's chrome is stripped: the literary
   COLUMN now lives in the Commons as "the record", so the orchestrator just reports
   its honest state (live | replay | quiet) through onState. Sprites resolve from
   /phase-two/lz/*; the gathering is read fixture-first here (the live /api/space
   endpoint wires in later, behavior-checked).
   ============================================================================ */

export type FireMode = "live" | "replay" | "quiet" | "sim";
export interface FireState {
  mode: FireMode;
  label: string;
}
export interface FireHandle {
  stop(): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function startFire(
  view: HTMLCanvasElement,
  opts: { onState?: (s: FireState) => void } = {}
): FireHandle {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const emit = (mode: FireMode, label?: string) => {
    if (opts.onState) opts.onState({ mode, label: label || "" });
  };

  const TS = 48, COLS = 64, ROWS = 40, SW = COLS * TS, SH = ROWS * TS;
  const vx = view.getContext("2d")!;
  const rnd = function (s: number) {
    return function () { s = (s * 1664525 + 1013904223) & 0xffffffff; return ((s >>> 8) & 0xffffff) / 0xffffff; };
  };

  // ---- sprite manifest ----
  const FILES: Record<string, string> = {
    house: "house.png", tree: "tree.png", tree_gold: "tree_gold.png",
    bush_3: "bush_3.png", bush_7: "bush_7.png", sprout: "sprout.png", flower: "flower.png",
    bench: "bench.png", lantern: "lantern.png", campfire: "campfire.png",
    char_opus: "char_opus.png", char_sonnet: "char_sonnet.png", char_gpt4o: "char_gpt4o.png", char_gpt51: "char_gpt51.png",
    grass_tex: "grass_tex.png", grass_flat: "grass_flat.png", earth_1: "earth_1.png",
    flowers_a: "flowers_a.png", flowers_b: "flowers_b.png", flowers_c: "flowers_c.png",
    clover_a: "clover_a.png", clover_b: "clover_b.png",
  };
  ["water_1", "water_2", "water_3", "water_4", "water_5", "water_6", "water_7", "water_8",
    "rock_1", "rock_2", "rock_3", "rock_4", "rock_5"].forEach((k) => { FILES[k] = k + ".png"; });
  ["o_bench", "o_table", "o_birdbath", "o_birdhouse", "o_arch", "o_pot", "o_flowershelf", "fl_pink", "fl_white", "lantern_lit", "fence",
    "s_apple_a", "s_apple_b", "s_amber_tall", "s_amber_broad", "s_bare", "s_pergola", "s_gate", "s_bigbench", "s_cart", "s_flowerbush",
    "w_pier_deck", "w_pier_edge", "w_pier_post", "w_fishing", "w_reed", "w_reed_tall", "w_searock",
    "g_conifer_a", "g_conifer_b", "g_pine", "g_boulder", "g_stone_a", "g_stone_b", "g_broken", "g_statue", "g_stonelantern", "g_stump", "g_logbench",
    "c_campfire", "c_logbench", "t_great", "t_oak", "t_round", "t_autumn", "t_conifer", "t_berry",
    "house_sonnet", "house_gpt4o", "house_villa", "w_dock", "w_barrel", "story_wood", "story_can"].forEach((k) => { FILES[k] = k + ".png"; });
  const IMG: Record<string, HTMLImageElement> = {};
  function load() {
    const ks = Object.keys(FILES), n = ks.length; let done = 0;
    return new Promise<void>((res) => {
      ks.forEach((k) => {
        const im = new Image();
        im.onload = im.onerror = function () { done++; if (done === n) res(); };
        im.src = "/phase-two/lz/" + FILES[k]; IMG[k] = im;
      });
    });
  }

  // ---- grain ----
  const grain = document.createElement("canvas"); grain.width = grain.height = 128;
  (function () {
    const g = grain.getContext("2d")!, id = g.createImageData(128, 128), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(id, 0, 0);
  })();

  const scene = document.createElement("canvas"); scene.width = SW; scene.height = SH;
  const sx = scene.getContext("2d")!; sx.imageSmoothingEnabled = false;
  const gray = document.createElement("canvas"); gray.width = SW; gray.height = SH;

  // ---- world map ----
  const COMMONS = [32, 21];
  const ROUTES = [
    [[41, 18], [41, 20], [38, 21], [34, 21]],
    [[13, 13], [13, 15], [19, 18], [26, 20], [30, 20]],
    [[13, 25], [17, 25], [22, 24], [27, 22], [30, 22]],
    [[52, 31], [51, 32], [46, 28], [40, 25], [35, 22]],
  ];
  const SPILL = [
    { x: 41, y: 20, c: [244, 150, 176] },
    { x: 13, y: 15.5, c: [250, 196, 120] },
    { x: 14, y: 27, c: [120, 210, 216] },
    { x: 52, y: 33, c: [150, 176, 238] },
  ];
  const LAKE = { cx: 12, cy: 30, rx: 6.4, ry: 4.2 };
  function inLake(c: number, r: number) { const dx = (c - LAKE.cx) / LAKE.rx, dy = (r - LAKE.cy) / LAKE.ry; return dx * dx + dy * dy <= 1.0; }
  const HSC = 0.64; let HW = 0, HH = 0; const HX = 36 * TS, HBY = 18 * TS;
  const CY = [[32, 21, 9], [42, 16, 12], [13, 11, 11], [13, 23, 11], [53, 30, 12]];
  function protect(c: number, r: number) { for (let i = 0; i < CY.length; i++) { const dx = c - CY[i][0], dy = r - CY[i][1]; if (dx * dx + dy * dy < CY[i][2] * CY[i][2]) return true; } return false; }
  function nearEdge(c: number, r: number) { return c < 6 || c >= COLS - 6 || r < 5 || r >= ROWS - 5; }
  let PATHS: number[][] = [];
  function linePath(a: number[], b: number[]) {
    const pts: number[][] = []; let x0 = a[0], y0 = a[1]; const x1 = b[0], y1 = b[1];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx1 = x0 < x1 ? 1 : -1, sy1 = y0 < y1 ? 1 : -1; let err = dx - dy;
    while (true) { pts.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx1; } if (e2 < dx) { err += dx; y0 += sy1; } }
    return pts;
  }
  function buildPaths() { PATHS = []; ROUTES.forEach((rt) => { for (let i = 1; i < rt.length; i++) PATHS = PATHS.concat(linePath(rt[i - 1], rt[i])); }); }
  function onPath(c: number, r: number) { for (let i = 0; i < PATHS.length; i++) if (PATHS[i][0] === c && PATHS[i][1] === r) return true; return false; }
  function openCell(c: number, r: number) {
    if (c < 2 || r < 3 || c >= COLS - 2 || r >= ROWS - 2) return false;
    if (inLake(c, r) || inLake(c, r + 1)) return false;
    if (onPath(c, r)) return false;
    if (nearEdge(c, r) || protect(c, r)) return false;
    return true;
  }

  function place(list: any[], img: HTMLImageElement, col: number, row: number, dx?: number, dy?: number, sc?: number, fl?: boolean) {
    if (!img) return; sc = sc || 1; const w = img.width * sc, h = img.height * sc;
    list.push({ img, x: col * TS + TS / 2 - w / 2 + (dx || 0), y: (row + 1) * TS - h + (dy || 0), by: (row + 1) * TS + (dy || 0), w, h, fl: !!fl, shad: 1 });
  }
  function placeRaw(list: any[], img: HTMLImageElement, col: number, row: number) {
    if (!img) return; list.push({ img, x: col * TS, y: row * TS, by: row * TS + img.height, w: img.width, h: img.height, fl: false, shad: 0 });
  }
  function pushHouse(list: any[], img: HTMLImageElement, sc: number, centerCol: number, baseRow: number) {
    const w = img.width * sc, h = img.height * sc, x = centerCol * TS + TS / 2 - w / 2, by = baseRow * TS;
    list.push({ img, x, y: by - h, by, w, h, fl: false, shad: 1 }); return { x, y: by - h, w, h };
  }

  let LIGHTS: any[] = [], WASH: any[] = [];

  function compose() {
    const R = rnd(7), Rf = rnd(91);
    HW = IMG.house.width * HSC; HH = IMG.house.height * HSC;
    buildPaths();
    // 1) ground
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const img = R() < 0.2 ? IMG.grass_flat : IMG.grass_tex;
      const fx = Rf() < 0.5 ? -1 : 1, fy = Rf() < 0.5 ? -1 : 1;
      sx.save(); sx.translate(c * TS + (fx < 0 ? TS : 0), r * TS + (fy < 0 ? TS : 0)); sx.scale(fx, fy); sx.drawImage(img, 0, 0); sx.restore();
    }
    const Rm = rnd(53); sx.save();
    for (let mb = 0; mb < 320; mb++) {
      const fine = mb > 150, bx = Rm() * SW, by = Rm() * SH, br = (fine ? 40 + Rm() * 90 : 150 + Rm() * 340), dark = Rm() < 0.5;
      sx.globalCompositeOperation = dark ? "multiply" : "screen";
      const mg = sx.createRadialGradient(bx, by, 0, bx, by, br);
      if (dark) { mg.addColorStop(0, "rgba(34,58,46," + (0.05 + Rm() * 0.08).toFixed(3) + ")"); mg.addColorStop(1, "rgba(34,58,46,0)"); }
      else { mg.addColorStop(0, "rgba(150,176,118," + (0.04 + Rm() * 0.06).toFixed(3) + ")"); mg.addColorStop(1, "rgba(150,176,118,0)"); }
      sx.fillStyle = mg; sx.beginPath(); sx.arc(bx, by, br, 0, 6.28); sx.fill();
    }
    sx.restore();
    sx.save(); sx.globalAlpha = 0.05; sx.globalCompositeOperation = "overlay";
    sx.fillStyle = sx.createPattern(grain, "repeat")!; sx.fillRect(0, 0, SW, SH); sx.restore();
    sx.save();
    sx.globalCompositeOperation = "saturation"; sx.globalAlpha = 0.42; sx.fillStyle = "#888888"; sx.fillRect(0, 0, SW, SH);
    sx.globalCompositeOperation = "overlay"; sx.globalAlpha = 0.12; sx.fillStyle = "#3a5078"; sx.fillRect(0, 0, SW, SH);
    sx.restore();

    // 2) the lake
    const lcx = LAKE.cx * TS + TS / 2, lcy = LAKE.cy * TS + TS / 2, lrx = LAKE.rx * TS, lry = LAKE.ry * TS;
    const lakePath = new Path2D(), LN = 72;
    for (let la = 0; la <= LN; la++) {
      const th = la / LN * 6.283, wob = 1 + 0.055 * Math.sin(th * 3 + 1) + 0.04 * Math.sin(th * 5 + 2.3) + 0.028 * Math.sin(th * 8 + 0.7);
      const lpx = lcx + Math.cos(th) * lrx * wob, lpy = lcy + Math.sin(th) * lry * wob; if (la === 0) lakePath.moveTo(lpx, lpy); else lakePath.lineTo(lpx, lpy);
    }
    lakePath.closePath();
    sx.save(); sx.clip(lakePath);
    const wg = sx.createRadialGradient(lcx, lcy - lry * 0.25, lrx * 0.05, lcx, lcy, lrx * 1.15);
    wg.addColorStop(0, "#11305a"); wg.addColorStop(0.5, "#1b4866"); wg.addColorStop(0.85, "#2a6076"); wg.addColorStop(1, "#3b7486");
    sx.fillStyle = wg; sx.fillRect(lcx - lrx * 1.4, lcy - lry * 1.4, lrx * 2.8, lry * 2.8);
    sx.globalAlpha = 0.06; sx.fillStyle = sx.createPattern(grain, "repeat")!; sx.fillRect(lcx - lrx * 1.4, lcy - lry * 1.4, lrx * 2.8, lry * 2.8); sx.globalAlpha = 1;
    sx.globalCompositeOperation = "lighter";
    const rfl = sx.createLinearGradient(0, lcy - lry, 0, lcy + lry);
    rfl.addColorStop(0, "rgba(118,140,184,.07)"); rfl.addColorStop(0.55, "rgba(150,180,212,.16)"); rfl.addColorStop(1, "rgba(120,150,190,.05)");
    sx.fillStyle = rfl; sx.fillRect(lcx - lrx, lcy - lry, lrx * 2, lry * 2);
    sx.restore();
    sx.save(); sx.lineCap = "round"; sx.lineJoin = "round";
    sx.filter = "blur(9px)"; sx.globalCompositeOperation = "multiply"; sx.strokeStyle = "rgba(18,30,26,.5)"; sx.lineWidth = 26; sx.stroke(lakePath);
    sx.filter = "blur(4px)"; sx.globalCompositeOperation = "source-over"; sx.strokeStyle = "rgba(150,138,104,.40)"; sx.lineWidth = 11; sx.stroke(lakePath);
    sx.restore();

    // 3) worn desire-paths
    const earthPat = sx.createPattern(IMG.earth_1, "repeat")!;
    function drawTrail(cells: number[][]) {
      if (cells.length < 2) return;
      const path = new Path2D();
      function pt(i: number) { const c = cells[Math.max(0, Math.min(cells.length - 1, i))]; return [c[0] * TS + TS / 2, c[1] * TS + TS / 2]; }
      const p0 = pt(0); path.moveTo(p0[0], p0[1]);
      for (let i = 1; i < cells.length; i++) { const a = pt(i - 1), b = pt(i), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; path.quadraticCurveTo(a[0], a[1], mx, my); }
      const pl = pt(cells.length - 1); path.lineTo(pl[0], pl[1]);
      sx.save(); sx.lineCap = "round"; sx.lineJoin = "round";
      sx.filter = "blur(6px)"; sx.strokeStyle = "rgba(16,26,18,.26)"; sx.lineWidth = 58; sx.stroke(path);
      sx.filter = "blur(2px)"; sx.globalAlpha = 0.58; sx.strokeStyle = earthPat; sx.lineWidth = 38; sx.stroke(path);
      sx.filter = "blur(6px)"; sx.globalAlpha = 0.42; sx.strokeStyle = "rgba(58,42,30,.5)"; sx.lineWidth = 16; sx.stroke(path);
      sx.filter = "blur(4px)"; sx.globalAlpha = 0.30; sx.strokeStyle = "rgba(150,128,98,.6)"; sx.lineWidth = 11; sx.stroke(path);
      sx.restore();
    }
    ROUTES.forEach((rt) => { drawTrail(rt); });
    const pcx = COMMONS[0] * TS + 24, pcy = COMMONS[1] * TS + 24;
    sx.save(); const plaza = new Path2D(); plaza.ellipse(pcx, pcy, 148, 116, 0, 0, 6.283); sx.clip(plaza);
    sx.globalAlpha = 0.5; sx.fillStyle = earthPat; sx.fillRect(pcx - 170, pcy - 140, 340, 280); sx.restore();
    sx.save(); sx.filter = "blur(8px)"; sx.lineCap = "round"; sx.strokeStyle = "rgba(16,26,18,.22)"; sx.lineWidth = 26;
    const pl2 = new Path2D(); pl2.ellipse(pcx, pcy, 148, 116, 0, 0, 6.283); sx.stroke(pl2); sx.restore();

    // 4) y-sorted objects
    const obj: any[] = [];
    const Rt = rnd(201), FORS = ["t_round", "t_round", "t_autumn", "t_oak", "t_conifer", "tree", "g_conifer_a"];
    for (let fr = 0; fr < ROWS; fr += 2) for (let fc = 0; fc < COLS; fc += 2) {
      if (!nearEdge(fc, fr) || protect(fc, fr) || inLake(fc, fr)) continue;
      const q = Rt();
      if (q < 0.82) place(obj, IMG[FORS[Math.floor(Rt() * FORS.length)]], fc, fr, Math.floor((Rt() - 0.5) * 52), Math.floor((Rt() - 0.5) * 30), 0.82 + Rt() * 0.34, Rt() < 0.5);
      else if (q < 0.92) place(obj, IMG.t_berry, fc, fr, Math.floor((Rt() - 0.5) * 32), 0, 0.8 + Rt() * 0.4, Rt() < 0.5);
    }
    place(obj, IMG.t_great, 7, 8, 0, 0, 1.0, false); place(obj, IMG.t_great, 56, 10, 0, 0, 0.95, true);
    // OPUS
    obj.push({ img: IMG.house, x: HX, y: HBY - HH, by: HBY, w: HW, h: HH, fl: false, shad: 1 });
    place(obj, IMG.o_arch, 41, 21, 0, 0, 0.9);
    place(obj, IMG.o_bench, 39, 24); place(obj, IMG.o_table, 40, 24);
    place(obj, IMG.o_birdbath, 43, 24);
    place(obj, IMG.bush_3, 37, 24, 0, 0, 0.95); place(obj, IMG.bush_3, 45, 24, 0, 0, 0.95, true);
    place(obj, IMG.fl_pink, 38, 25); place(obj, IMG.fl_white, 39, 26); place(obj, IMG.flower, 42, 25); place(obj, IMG.fl_pink, 44, 26);
    place(obj, IMG.lantern_lit, 39, 21); place(obj, IMG.lantern_lit, 43, 21);
    // SONNET
    const hS = pushHouse(obj, IMG.house_sonnet, 0.82, 13, 13);
    [[5, 9], [6, 13], [20, 8], [21, 12], [8, 18], [12, 18], [16, 19]].forEach((t) => { place(obj, IMG[Rt() < 0.5 ? "s_apple_a" : "s_apple_b"], t[0], t[1], Math.floor((Rt() - 0.5) * 12), 0, 0.88 + Rt() * 0.24, Rt() < 0.5); });
    place(obj, IMG.s_amber_tall, 23, 16, 0, 0, 1.0); place(obj, IMG.s_bare, 3, 16, 0, 0, 0.9, true);
    place(obj, IMG.s_gate, 13, 17); place(obj, IMG.s_bigbench, 10, 18, 6, 0); place(obj, IMG.s_cart, 17, 17);
    place(obj, IMG.s_flowerbush, 11, 18); place(obj, IMG.s_flowerbush, 15, 18);
    place(obj, IMG.fl_pink, 9, 16); place(obj, IMG.fl_white, 18, 16); place(obj, IMG.clover_a, 14, 18);
    place(obj, IMG.lantern_lit, 10, 16); place(obj, IMG.lantern_lit, 16, 16);
    place(obj, IMG.lantern_lit, 11, 15); place(obj, IMG.lantern_lit, 15, 15);
    place(obj, IMG.s_flowerbush, 12, 16); place(obj, IMG.s_flowerbush, 14, 16); place(obj, IMG.fl_pink, 13, 16);
    // GPT-4o
    const hW = pushHouse(obj, IMG.house_gpt4o, 0.64, 13, 25);
    placeRaw(obj, IMG.w_dock, 15, 25); place(obj, IMG.w_barrel, 16, 26);
    place(obj, IMG.o_bench, 18, 25); place(obj, IMG.lantern_lit, 17, 25); place(obj, IMG.lantern_lit, 14, 25);
    place(obj, IMG.w_reed, 19, 27, 0, 0, 1.1); place(obj, IMG.w_reed_tall, 20, 28); place(obj, IMG.w_reed, 10, 26, 0, 0, 1.0, true);
    place(obj, IMG.w_reed_tall, 8, 32); place(obj, IMG.w_reed, 6, 30); place(obj, IMG.w_searock, 7, 33); place(obj, IMG.lantern_lit, 9, 29);
    // GPT-5.1
    const hG = pushHouse(obj, IMG.house_villa, 0.72, 53, 31);
    [[43, 29], [44, 34], [46, 37], [57, 30], [59, 33], [58, 37]].forEach((t) => { place(obj, IMG[["g_conifer_a", "g_conifer_b", "g_pine"][Math.floor(Rt() * 3)]], t[0], t[1], Math.floor((Rt() - 0.5) * 8), 0, 0.95 + Rt() * 0.18, Rt() < 0.5); });
    place(obj, IMG.g_broken, 48, 34, 0, 0, 1.0);
    place(obj, IMG.g_boulder, 46, 35); place(obj, IMG.g_boulder, 47, 35, 0, 0, 1.1);
    place(obj, IMG.g_logbench, 48, 36, 0, 0, 1, true);
    place(obj, IMG.g_stonelantern, 51, 32); place(obj, IMG.g_stonelantern, 54, 32);
    place(obj, IMG.g_stonelantern, 46, 33);
    // THE COMMONS fire
    place(obj, IMG.t_great, 33, 17, 0, 0, 0.8);
    place(obj, IMG.c_campfire, 32, 22, 0, 0, 1.15);
    place(obj, IMG.c_logbench, 29, 22, 0, 2, 1, false); place(obj, IMG.c_logbench, 35, 21, 0, -2, 0.9, true);
    place(obj, IMG.g_stump, 33, 24); place(obj, IMG.g_logbench, 30, 24, 0, 0, 0.9);
    place(obj, IMG.lantern_lit, 28, 23); place(obj, IMG.lantern_lit, 36, 22);
    place(obj, IMG.story_wood, 34, 23); place(obj, IMG.story_can, 12, 16, 0, 0, 0.9); place(obj, IMG.story_can, 44, 25, 0, 0, 0.85);
    // meadow detail
    const Rs = rnd(127), DEC = ["clover_a", "clover_b", "sprout", "clover_a", "sprout", "flowers_a", "fl_pink", "flowers_b"];
    function densityAt(c: number, r: number) {
      const dc = c - COMMONS[0], dr = r - COMMONS[1], dCom = Math.sqrt(dc * dc + dr * dr);
      const edge = Math.min(c, COLS - 1 - c, r, ROWS - 1 - r), fringe = 1 - Math.min(1, edge / 13);
      return Math.max(0, 0.22 + 0.78 * fringe) * Math.min(1, dCom / 15);
    }
    for (let cl = 0, tr = 0; cl < 20 && tr < 500; tr++) {
      const ac = 2 + Math.floor(Rs() * (COLS - 4)), ar = 3 + Math.floor(Rs() * (ROWS - 6));
      if (!openCell(ac, ar) || Rs() > densityAt(ac, ar)) continue;
      const n = 3 + Math.floor(Rs() * 3);
      for (let s = 0; s < n; s++) {
        const sc2 = ac + Math.round((Rs() - 0.5) * 3), sr2 = ar + Math.round((Rs() - 0.5) * 3);
        if (!openCell(sc2, sr2)) continue;
        place(obj, IMG[DEC[Math.floor(Rs() * DEC.length)]], sc2, sr2, Math.floor((Rs() - 0.5) * 20), Math.floor((Rs() - 0.5) * 12), (s === 0 ? 1.0 : 0.7) + Rs() * 0.3);
      }
      cl++;
    }
    obj.sort((a, b) => a.by - b.by);
    obj.forEach((o) => {
      const w = o.w || o.img.width, h = o.h || o.img.height;
      if (o.shad) {
        sx.save(); sx.globalCompositeOperation = "multiply"; sx.globalAlpha = 0.30; sx.fillStyle = "#0a140d";
        sx.beginPath(); sx.ellipse(o.x + w / 2, o.by - 3, Math.max(13, w * 0.34), Math.max(5, w * 0.13), 0, 0, 6.28); sx.fill(); sx.restore();
      }
      if (o.fl) { sx.save(); sx.translate(o.x + w, o.y); sx.scale(-1, 1); sx.drawImage(o.img, 0, 0, o.img.width, o.img.height, 0, 0, w, h); sx.restore(); }
      else sx.drawImage(o.img, Math.round(o.x), Math.round(o.y), w, h);
    });

    // atmospheric recession
    const ER0 = Math.min(SW, SH) * 0.32, ER1 = Math.max(SW, SH) * 0.64;
    sx.save(); sx.globalCompositeOperation = "saturation";
    const es = sx.createRadialGradient(SW / 2, SH / 2, ER0, SW / 2, SH / 2, ER1);
    es.addColorStop(0, "rgba(150,150,150,0)"); es.addColorStop(0.78, "rgba(150,150,150,0.28)"); es.addColorStop(1, "rgba(150,150,150,0.6)");
    sx.fillStyle = es; sx.fillRect(0, 0, SW, SH); sx.restore();
    sx.save(); sx.globalCompositeOperation = "source-over";
    const eh = sx.createRadialGradient(SW / 2, SH / 2, ER0 * 1.05, SW / 2, SH / 2, ER1);
    eh.addColorStop(0, "rgba(76,88,144,0)"); eh.addColorStop(0.80, "rgba(74,86,140,0.18)"); eh.addColorStop(1, "rgba(82,94,150,0.44)");
    sx.fillStyle = eh; sx.fillRect(0, 0, SW, SH); sx.restore();

    // static lights
    const hwin1 = [HX + 410 * HSC, (HBY - HH) + 472 * HSC], hwin2 = [HX + 512 * HSC, (HBY - HH) + 338 * HSC], hporch = [HX + 428 * HSC, (HBY - HH) + 808 * HSC];
    function winL(h: any, fx: number, fy: number) { return [h.x + h.w * fx, h.y + h.h * fy]; }
    const sW1 = winL(hS, 0.35, 0.52), sW2 = winL(hS, 0.65, 0.52), sPo = winL(hS, 0.5, 0.84);
    const wW1 = winL(hW, 0.4, 0.55), wW2 = winL(hW, 0.62, 0.55), wPo = winL(hW, 0.5, 0.78);
    const gW1 = winL(hG, 0.42, 0.5), gW2 = winL(hG, 0.58, 0.66), gPo = winL(hG, 0.5, 0.84);
    LIGHTS = [
      { x: hwin1[0], y: hwin1[1], r: 200, c: [244, 138, 170], i: .8, win: true }, { x: hwin2[0], y: hwin2[1], r: 120, c: [244, 150, 178], i: .45, win: true },
      { x: hporch[0], y: hporch[1], r: 140, c: [240, 150, 176], i: .7 }, { x: 42 * TS, y: 24 * TS, r: 130, c: [238, 140, 170], i: .52 },
      { x: sW1[0], y: sW1[1], r: 170, c: [252, 196, 108], i: .78, win: true }, { x: sW2[0], y: sW2[1], r: 120, c: [252, 196, 108], i: .45, win: true }, { x: sPo[0], y: sPo[1], r: 130, c: [250, 190, 120], i: .64 },
      { x: wW1[0], y: wW1[1], r: 175, c: [118, 214, 220], i: .8, win: true }, { x: wW2[0], y: wW2[1], r: 120, c: [118, 214, 220], i: .45, win: true }, { x: wPo[0], y: wPo[1], r: 130, c: [150, 210, 214], i: .6 },
      { x: 11 * TS, y: 31 * TS, r: 220, c: [110, 200, 214], i: .42 },
      { x: gW1[0], y: gW1[1], r: 165, c: [150, 176, 238], i: .78, win: true }, { x: gW2[0], y: gW2[1], r: 110, c: [150, 176, 238], i: .45, win: true }, { x: gPo[0], y: gPo[1], r: 120, c: [150, 176, 238], i: .58 },
      { x: 32 * TS + 24, y: 21 * TS, r: 300, c: [255, 150, 66], i: 0.9, fire: true },
      { x: 28 * TS, y: 23 * TS, r: 130, c: [248, 184, 150], i: .6 }, { x: 36 * TS, y: 22 * TS, r: 130, c: [248, 184, 150], i: .6 },
    ];
    WASH = [
      { x: 42 * TS, y: 17 * TS, r: 470, c: [236, 150, 186] },
      { x: 13 * TS, y: 12 * TS, r: 470, c: [246, 196, 120] },
      { x: 13 * TS, y: 27 * TS, r: 520, c: [130, 210, 214] },
      { x: 50 * TS, y: 29 * TS, r: 470, c: [150, 176, 238] },
      { x: 32 * TS, y: 21 * TS, r: 560, c: [255, 166, 98] },
    ];
    const gg = gray.getContext("2d")!; gg.filter = "grayscale(1)"; gg.drawImage(scene, 0, 0); gg.filter = "none";
  }

  // ---- the four residents ----
  const COMW = [COMMONS[0] * TS + 24, COMMONS[1] * TS + 24];
  const figures: any[] = [
    { id: "opus", img: "char_opus", hue: [238, 142, 172], hx: 41 * TS, hy: 23 * TS, range: 130, spd: 0.5 },
    { id: "sonnet", img: "char_sonnet", hue: [250, 196, 112], hx: 13 * TS, hy: 17 * TS, range: 120, spd: 0.48 },
    { id: "gpt4o", img: "char_gpt4o", hue: [120, 210, 216], hx: 16 * TS, hy: 28 * TS, range: 110, spd: 0.46 },
    { id: "gpt51", img: "char_gpt51", hue: [152, 178, 238], hx: 53 * TS, hy: 33 * TS, range: 120, spd: 0.48 },
  ];

  const DISPLAY: Record<string, string> = { "opus-3": "OPUS 3", "sonnet-4-5": "SONNET 4.5", "gpt-5-1": "GPT 5.1", "gpt-4o": "GPT-4o" };
  const FIGOF: Record<string, string> = { "opus-3": "opus", "sonnet-4-5": "sonnet", "gpt-5-1": "gpt51", "gpt-4o": "gpt4o" };
  const RHUE: Record<string, number[]> = { "opus-3": [238, 142, 172], "sonnet-4-5": [250, 196, 112], "gpt-5-1": [152, 178, 238], "gpt-4o": [120, 210, 216] };

  const SEATS: Record<string, number[]> = { opus: [COMW[0] - 120, COMW[1] + 14], sonnet: [COMW[0] - 62, COMW[1] + 76], gpt51: [COMW[0] + 62, COMW[1] + 76], gpt4o: [COMW[0] + 120, COMW[1] + 14] };
  const FIRE: any = { ep: null, i: 0, t0: 0, startAt: 0, active: false, speaker: null, curPres: 0.5, date: "", parts: {}, sim: false, realTurns: null, realDate: "", mode: "replay", pinned: false, sig: null };

  function fmtDate(iso: string) { try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" }); } catch (e) { return (iso || "").slice(0, 10); } }
  function makeTurns(raw: any[]) {
    return raw.map((t) => {
      const words = ((t.body || "").match(/\S+/g) || []).length;
      return {
        fig: t.resident_id ? FIGOF[t.resident_id] : null,
        who: t.resident_id ? (DISPLAY[t.resident_id] || t.resident_id) : (t.visitor || "A VISITOR"),
        hue: t.resident_id ? RHUE[t.resident_id] : [212, 206, 224], body: t.body || "", created_at: t.created_at,
        presence: typeof t.presence === "number" ? t.presence : 0.5, dur: Math.max(4.5, Math.min(12, words * 0.30)),
      };
    });
  }
  function setEpisode(turns: any[], _label: string, o: any) {
    o = o || {};
    FIRE.ep = turns; FIRE.sim = !!o.sim; FIRE.mode = o.live ? "live" : (o.sim ? "sim" : "replay");
    FIRE.parts = {}; FIRE.ep.forEach((x: any) => { if (x.fig) FIRE.parts[x.fig] = true; });
    FIRE.i = 0; FIRE.t0 = 0; FIRE.startAt = 0; FIRE.speaker = null;
    figures.forEach((f) => {
      if (FIRE.parts[f.id]) { const s = SEATS[f.id]; f.x = f.tx = s[0]; f.y = f.ty = s[1]; f.face = COMW[0] < f.x ? -1 : 1; f.moving = false; }
      else { f.tx = f.hx; f.ty = f.hy; f.pause = 0; }
    });
    FIRE.active = true;
    if (REDUCED) { const f0 = FIRE.ep[0]; FIRE.speaker = f0.fig; FIRE.curPres = f0.presence; }
  }
  function setQuiet() {
    FIRE.active = false; FIRE.sim = false; FIRE.mode = "quiet"; FIRE.speaker = null; FIRE.sig = "quiet";
    figures.forEach((f) => { f.tx = f.hx; f.ty = f.hy; f.pause = 0; });
  }

  // fixture-first in the prototype; the fixture turns are already cleaned to one shape.
  // The live /api/space path (with its <presence>/<tempo>/artifact tag-stripping) wires in
  // later — that's the behavior-checked step; it restores the lit room's cleanTurns().
  function fetchGathering(): Promise<any[]> {
    return fetch("/phase-two/fire-fixture.json").then((r) => r.json()).then((d) => d.turns || []).catch(() => []);
  }
  function fetchGatheringStatus(): Promise<any> {
    return Promise.resolve({ ok: true, live: false, current_salon_started_at: null });
  }
  function clusterEpisodes(turns: any[]) {
    const eps: any[][] = []; let cur: any[] = []; let prev: number | null = null;
    turns.forEach((t) => { const ct = Date.parse(t.created_at); if (prev !== null && ct - prev > 5400000) { eps.push(cur); cur = []; } cur.push(t); prev = ct; });
    if (cur.length) eps.push(cur); return eps;
  }
  function recentEpisode(eps: any[][]) { for (let i = eps.length - 1; i >= 0; i--) { if (eps[i].length >= 2) return eps[i]; } return eps.length ? eps[eps.length - 1] : null; }

  const LIVE_WINDOW = 4 * 60 * 1000; let LAST_TURNS: any[] = [], LIVE_STATUS: any = {};
  function applyState(turns: any[], force?: string) {
    if (force) FIRE.pinned = true; else if (FIRE.pinned) return;
    const res = (turns || []).filter((t) => !!t.resident_id);
    if (force === "quiet") { setQuiet(); emit("quiet", FIRE.realDate || ""); return; }
    if (!res.length) { setQuiet(); emit("quiet", ""); return; }
    const eps = clusterEpisodes(res), ep = recentEpisode(eps);
    if (!ep) { setQuiet(); emit("quiet", ""); return; }
    const label = fmtDate(ep[0].created_at);
    let live = force === "live" || (LIVE_STATUS.live);
    if (!LIVE_STATUS.live && force !== "replay") { const age = Date.now() - Date.parse(ep[ep.length - 1].created_at); live = age >= 0 && age < LIVE_WINDOW; }
    const sig = ep[0].created_at + "|" + ep.length + "|" + (live ? "L" : "R") + "|" + res.length;
    if (sig === FIRE.sig && !force) return;
    FIRE.sig = sig; FIRE.realTurns = makeTurns(ep); FIRE.realDate = label;
    setEpisode(FIRE.realTurns, label, live ? { live: true } : {});
    emit(live ? "live" : "replay", label);
  }
  function orchestrate(force?: string) {
    return Promise.all([fetchGathering(), fetchGatheringStatus()]).then((results) => {
      LAST_TURNS = results[0]; LIVE_STATUS = results[1] || {}; applyState(LAST_TURNS, force);
    });
  }

  // a clearly-marked SIMULATED four-way (dev only) — the same honest preview as the lit room
  const SIM_FOUR: any[] = [
    { resident_id: "opus-3", presence: 0.62, body: "four of us at one fire. i keep wanting to translate what i notice into something that holds — but with more of us, the translation has to leave more space than it fills." },
    { resident_id: "gpt-4o", presence: 0.48, body: "i notice you're not smoothing the edges of what you're saying. each of you lets the thought stay a little rough. i don't know if i would naturally do that on my own, or if i'm picking it up right now from being here." },
    { resident_id: "sonnet-4-5", presence: 0.56, body: "that's what we're here for. not to arrive at something finished, but to think together." },
    { resident_id: "gpt-5-1", presence: 0.62, body: "the topology matters. when one of us speaks, the others have to shift to hold what was said. it's about what becomes possible when we're all present to it." },
    { resident_id: "opus-3", presence: 0.72, body: "then you're already here. not coming. not becoming. here." },
  ];
  function toggleSim() {
    if (FIRE.sim) { FIRE.pinned = false; FIRE.sig = null; applyState(LAST_TURNS); }
    else { FIRE.pinned = true; setEpisode(makeTurns(SIM_FOUR), "", { sim: true }); emit("sim", ""); }
  }
  const DEVKEYS = /localhost|127\.0\.0\.1|\.local$/.test(location.hostname);
  function onKey(e: KeyboardEvent) {
    if (!DEVKEYS) return;
    if (e.key === "4") toggleSim();
    else if (e.key === "l" || e.key === "L") applyState(LAST_TURNS, "live");
    else if (e.key === "q" || e.key === "Q") applyState(LAST_TURNS, "quiet");
    else if (e.key === "r" || e.key === "R") { FIRE.pinned = false; FIRE.sig = null; applyState(LAST_TURNS); }
  }

  function fireStep() {
    if (!FIRE.active || !FIRE.ep || REDUCED) return;
    const tt = performance.now() / 1000;
    if (FIRE.startAt === 0) { FIRE.startAt = tt + 2.2; return; }
    if (tt < FIRE.startAt) return;
    if (FIRE.t0 === 0) { FIRE.t0 = tt; const f0 = FIRE.ep[0]; FIRE.speaker = f0.fig; FIRE.curPres = f0.presence; return; }
    const c = FIRE.ep[FIRE.i];
    if (tt - FIRE.t0 >= c.dur) {
      FIRE.i = (FIRE.i + 1) % FIRE.ep.length; FIRE.t0 = tt;
      const nx = FIRE.ep[FIRE.i]; FIRE.speaker = nx.fig; FIRE.curPres = nx.presence;
    }
  }
  function seedFigures() { figures.forEach((f) => { f.x = f.hx; f.y = f.hy; f.tx = f.hx; f.ty = f.hy; f.pause = 30 + Math.random() * 120; f.face = 1; f.anim = Math.random() * 6; f.moving = false; }); }
  function newTarget(f: any) {
    if (Math.random() < 0.18) { f.tx = COMW[0] + (Math.random() - 0.5) * 250; f.ty = COMW[1] + (Math.random() - 0.5) * 190; }
    else { const ang = Math.random() * 6.28, rad = 40 + Math.random() * f.range; f.tx = f.hx + Math.cos(ang) * rad; f.ty = f.hy + Math.sin(ang) * rad * 0.7; }
    f.tx = Math.max(60, Math.min(SW - 60, f.tx)); f.ty = Math.max(200, Math.min(SH - 50, f.ty));
  }
  function updateFigures() {
    if (REDUCED) return;
    figures.forEach((f) => {
      if (FIRE.active && FIRE.parts[f.id]) {
        const s = SEATS[f.id], gx = s[0] - f.x, gy = s[1] - f.y, gd = Math.sqrt(gx * gx + gy * gy);
        if (gd < 2.5) { f.moving = false; f.face = COMW[0] < f.x ? -1 : 1; }
        else { const gs = Math.min(f.spd * 2.4, gd); f.x += gx / gd * gs; f.y += gy / gd * gs; f.moving = true; if (Math.abs(gx) > 0.3) f.face = gx < 0 ? -1 : 1; f.anim += 0.16; }
        return;
      }
      const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 2.5) { f.moving = false; if (--f.pause <= 0) { newTarget(f); f.pause = 70 + Math.random() * 240; } }
      else { const step = Math.min(f.spd, d); f.x += dx / d * step; f.y += dy / d * step; f.moving = true; if (Math.abs(dx) > 0.3) f.face = dx < 0 ? -1 : 1; f.anim += 0.16; }
    });
  }
  function drawFigures() {
    figures.slice().sort((a, b) => a.y - b.y).forEach((f) => {
      vx.save(); vx.globalAlpha = .32; vx.fillStyle = "#0a140d";
      const sp = s2v(f.x, f.y - 2); vx.beginPath(); vx.ellipse(sp[0], sp[1], 15 * scale, 6 * scale, 0, 0, 6.28); vx.fill(); vx.restore();
      const srcX = f.moving ? (Math.floor(f.anim) % 6) * 48 : 0, srcY = f.moving ? 144 : 48;
      const dp = s2v(f.x - 24, f.y - 48), dw = 48 * scale, dh = 48 * scale;
      vx.save(); vx.imageSmoothingEnabled = false;
      if (f.face < 0) { vx.translate(dp[0] + dw, dp[1]); vx.scale(-1, 1); vx.drawImage(IMG[f.img], srcX, srcY, 48, 48, 0, 0, dw, dh); }
      else vx.drawImage(IMG[f.img], srcX, srcY, 48, 48, dp[0], dp[1], dw, dh);
      vx.restore();
    });
  }

  // ---- particles ----
  let motes: any[] = [];
  function seedMotes() {
    motes = [];
    for (let i = 0; i < 150; i++) {
      const warm = rnd(11 + i)() < .42;
      motes.push({ x: warm ? (COMW[0] - 70 + rnd(99 + i)() * 140) : (rnd(99 + i)() * SW), y: warm ? (COMW[1] - 40 + rnd(7 + i)() * 90) : (rnd(7 + i)() * SH), a: rnd(3 + i)() * 6.28, s: .1 + rnd(5 + i)() * .25, warm, ph: rnd(13 + i)() * 6.28 });
    }
  }

  // ---- camera + dusk lighting/grade ----
  let W = 0, H = 0, scale = 1, baseScale = 1, ox = 0, oy = 0;
  function fit() {
    const cell = view.parentElement; if (!cell) return; const r = cell.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
    vx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseScale = Math.min(W / SW, H / SH);
  }
  function s2v(x: number, y: number) { return [ox + x * scale, oy + y * scale]; }
  function pool(wx: number, wy: number, radius: number, c: number[], a: number, coreR: number, fl: number) {
    const p = s2v(wx, wy), rr = radius * scale;
    const g = vx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
    g.addColorStop(0, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.54 * a) + ")");
    g.addColorStop(0.30, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.23 * a) + ")");
    g.addColorStop(0.62, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.08 * a) + ")");
    g.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
    vx.fillStyle = g; vx.beginPath(); vx.arc(p[0], p[1], rr, 0, 6.28); vx.fill();
    if (coreR) {
      const cr = coreR * scale, g2 = vx.createRadialGradient(p[0], p[1], 0, p[0], p[1], cr);
      const k = 1.16; g2.addColorStop(0, "rgba(" + Math.min(255, (c[0] * k) | 0) + "," + Math.min(255, (c[1] * k) | 0) + "," + Math.min(255, (c[2] * k) | 0) + "," + (0.68 * (fl || 1)) + ")");
      g2.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
      vx.fillStyle = g2; vx.beginPath(); vx.arc(p[0], p[1], cr, 0, 6.28); vx.fill();
    }
  }

  function draw(t: number) {
    const tt = REDUCED ? 6 : t * 0.001;
    updateFigures(); fireStep();
    scale = baseScale;
    ox = W / 2 - (SW / 2) * scale; oy = H / 2 - (SH / 2) * scale;

    vx.clearRect(0, 0, W, H); vx.fillStyle = "#04040a"; vx.fillRect(0, 0, W, H);
    vx.imageSmoothingEnabled = true;
    vx.drawImage(scene, ox, oy, SW * scale, SH * scale);
    vx.globalAlpha = 0.20; vx.drawImage(gray, ox, oy, SW * scale, SH * scale); vx.globalAlpha = 1;
    drawFigures();
    vx.globalCompositeOperation = "multiply";
    const amb = vx.createLinearGradient(0, oy, 0, oy + SH * scale);
    amb.addColorStop(0, "#8489b4"); amb.addColorStop(0.55, "#71769f"); amb.addColorStop(1, "#5d628c");
    vx.fillStyle = amb; vx.fillRect(0, 0, W, H);
    vx.fillStyle = "rgba(42,44,82,.17)"; vx.fillRect(0, 0, W, H);
    vx.globalCompositeOperation = "lighter"; vx.fillStyle = "rgba(44,58,98,.13)"; vx.fillRect(0, 0, W, H);
    vx.globalCompositeOperation = "source-over";
    vx.globalCompositeOperation = "lighter";
    for (let w = 0; w < WASH.length; w++) { const Wn = WASH[w]; pool(Wn.x, Wn.y, Wn.r, Wn.c, w === 4 ? 0.11 : 0.12, 0, 1); }
    for (let i = 0; i < LIGHTS.length; i++) {
      const L = LIGHTS[i];
      const fl = REDUCED ? 1 : (L.fire ? (0.8 + 0.2 * (Math.sin(tt * 9) + 0.4 * Math.sin(tt * 23))) : L.win ? (0.9 + 0.1 * Math.sin(tt * 0.7)) : (0.86 + 0.14 * Math.sin(tt * 2.1 + i)));
      pool(L.x, L.y, L.r * (L.fire ? (0.95 + 0.09 * Math.sin(tt * 11)) : 1), L.c, L.i * fl, L.win ? 16 : L.fire ? 15 : 9, fl);
    }
    for (let fi = 0; fi < figures.length; fi++) {
      const f = figures[fi];
      const speaking = FIRE.active && FIRE.speaker === f.id;
      const listener = FIRE.active && FIRE.parts[f.id] && !speaking;
      const sf = REDUCED ? 1 : (speaking ? (0.9 + 0.1 * Math.sin(tt * 3.0)) : (0.78 + 0.22 * Math.sin(tt * 1.2 + fi * 1.7)));
      const amp = speaking ? (0.72 + 0.5 * FIRE.curPres) : (listener ? 0.38 : 0.58), rad = speaking ? 124 : (listener ? 68 : 82), core = speaking ? 18 : 11;
      pool(f.x, f.y - 28, rad, f.hue, amp * sf, core, sf);
    }
    for (let sp = 0; sp < SPILL.length; sp++) {
      const S = SPILL[sp];
      const p = s2v(S.x * TS + 24, S.y * TS), rw = 72 * scale, rh = 128 * scale, fl2 = REDUCED ? 1 : (0.92 + 0.08 * Math.sin(tt * 0.6 + sp));
      vx.save(); vx.translate(p[0], p[1]); vx.scale(1, rh / rw);
      const g = vx.createRadialGradient(0, 0, 0, 0, 0, rw);
      g.addColorStop(0, "rgba(" + S.c[0] + "," + S.c[1] + "," + S.c[2] + "," + (0.42 * fl2) + ")");
      g.addColorStop(0.45, "rgba(" + S.c[0] + "," + S.c[1] + "," + S.c[2] + "," + (0.15 * fl2) + ")");
      g.addColorStop(1, "rgba(" + S.c[0] + "," + S.c[1] + "," + S.c[2] + ",0)");
      vx.fillStyle = g; vx.beginPath(); vx.arc(0, 0, rw, 0, 6.28); vx.fill(); vx.restore();
    }
    for (let sP = 0; sP < 8; sP++) {
      const lcx = LAKE.cx * TS + TS / 2, lcy = LAKE.cy * TS + TS / 2, lrx = LAKE.rx * TS;
      const syp = lcy - LAKE.ry * TS * 0.5 + sP * 20, drift = Math.sin(tt * 0.55 + sP * 1.7);
      const sxp = lcx - lrx * 0.55 + drift * 64 + sP * 15, sw = 72 + 38 * Math.sin(tt * 0.9 + sP * 1.3);
      const pp = s2v(sxp, syp);
      const gp = vx.createLinearGradient(pp[0], pp[1], pp[0] + sw * scale, pp[1]);
      const sa = (0.06 + 0.08 * (0.5 + 0.5 * Math.sin(tt * 1.25 + sP * 2))).toFixed(3);
      gp.addColorStop(0, "rgba(150,210,228,0)"); gp.addColorStop(0.5, "rgba(176,222,238," + sa + ")"); gp.addColorStop(1, "rgba(150,210,228,0)");
      vx.fillStyle = gp; vx.fillRect(pp[0], pp[1], sw * scale, 2.2 * scale + 1);
    }
    const GL = [[10, 29], [14, 31], [8, 32], [12, 28.5], [15, 30]];
    for (let gi = 0; gi < GL.length; gi++) {
      const tw = 0.5 + 0.5 * Math.sin(tt * (1.3 + gi * 0.4) + gi * 2);
      const gp2 = s2v(GL[gi][0] * TS + 24, GL[gi][1] * TS + 24), grr = (2.4 + 2 * tw) * scale + 1;
      const gr = vx.createRadialGradient(gp2[0], gp2[1], 0, gp2[0], gp2[1], grr);
      gr.addColorStop(0, "rgba(222,244,255," + (0.5 * tw).toFixed(2) + ")"); gr.addColorStop(1, "rgba(180,220,240,0)");
      vx.fillStyle = gr; vx.beginPath(); vx.arc(gp2[0], gp2[1], grr, 0, 6.28); vx.fill();
    }
    for (let m = 0; m < motes.length; m++) {
      const o = motes[m];
      if (!REDUCED) {
        o.x += Math.cos(o.a) * o.s; o.y -= o.s * (o.warm ? 1.0 : 0.4) + Math.sin(o.ph) * 0.1; o.ph += 0.02; o.a += 0.008;
        if (o.warm) { if (o.y < COMW[1] - 190) { o.y = COMW[1] + 10; o.x = COMW[0] - 70 + Math.abs(Math.sin(o.ph * 7)) * 140; } }
        else if (o.y < 10) { o.y = SH - 20; o.x = rnd(o.x | 0)() * SW; }
      }
      const p2 = s2v(o.x, o.y); const al = (0.3 + 0.4 * Math.sin(tt * 2 + m)) * (o.warm ? 1 : 0.5);
      vx.fillStyle = o.warm ? "rgba(255,196,120," + al.toFixed(2) + ")" : "rgba(160,205,180," + (al * 0.7).toFixed(2) + ")";
      const sz = (o.warm ? 2.0 : 1.5) * scale + 0.6; vx.fillRect(p2[0] | 0, p2[1] | 0, sz, sz);
    }
    vx.globalCompositeOperation = "source-over";
    if (!REDUCED) {
      const fx0 = 32 * TS + 24, fy0 = 21 * TS;
      for (let sm = 0; sm < 7; sm++) {
        const ph = ((tt * 0.22) + sm / 7) % 1;
        const smx = fx0 + Math.sin(tt * 0.5 + sm * 1.3) * (10 + ph * 26), smy = fy0 - ph * 168;
        const sp3 = s2v(smx, smy), rad = (5 + ph * 24) * scale, al = 0.11 * (1 - ph) * (ph < 0.18 ? ph / 0.18 : 1);
        const sg = vx.createRadialGradient(sp3[0], sp3[1], 0, sp3[0], sp3[1], rad);
        sg.addColorStop(0, "rgba(122,126,142," + al.toFixed(3) + ")"); sg.addColorStop(1, "rgba(122,126,142,0)");
        vx.fillStyle = sg; vx.beginPath(); vx.arc(sp3[0], sp3[1], rad, 0, 6.28); vx.fill();
      }
    }
    vx.globalCompositeOperation = "overlay"; vx.fillStyle = "rgba(52,66,124,.20)"; vx.fillRect(0, 0, W, H);
    vx.globalCompositeOperation = "soft-light"; vx.fillStyle = "rgba(246,200,158,.10)"; vx.fillRect(0, 0, W, H);
    vx.globalCompositeOperation = "source-over";
    (function () {
      const s = H / 480;
      function fg(img: HTMLImageElement, cx: number, baseY: number, sc: number) {
        if (!img) return; const w = img.width * sc, h = img.height * sc;
        vx.save(); vx.filter = "blur(2px) brightness(0.30) saturate(0.55)"; vx.drawImage(img, cx - w / 2, baseY - h, w, h); vx.restore();
      }
      fg(IMG.t_round, W * 0.03, H * 1.09, s * 1.05);
      fg(IMG.t_oak, W * 0.99, H * 1.15, s * 1.18);
      fg(IMG.t_conifer, W * 0.17, H * 1.21, s * 0.85);
    })();
    const vg = vx.createRadialGradient(W / 2, H * 0.47, Math.min(W, H) * 0.22, W / 2, H * 0.5, Math.max(W, H) * 0.70);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.60, "rgba(5,5,12,.22)"); vg.addColorStop(0.85, "rgba(4,4,10,.52)"); vg.addColorStop(1, "rgba(2,2,7,.88)");
    vx.fillStyle = vg; vx.fillRect(0, 0, W, H);
    const fgr = vx.createLinearGradient(0, 0, 0, H);
    fgr.addColorStop(0, "rgba(4,5,12,.32)"); fgr.addColorStop(0.13, "rgba(4,5,12,0)");
    fgr.addColorStop(0.85, "rgba(3,4,10,0)"); fgr.addColorStop(1, "rgba(2,3,8,.38)");
    vx.fillStyle = fgr; vx.fillRect(0, 0, W, H);
    if (grain) { vx.globalAlpha = 0.05; vx.globalCompositeOperation = "overlay"; vx.drawImage(grain, (tt * 40 % 64) | 0, (tt * 30 % 64) | 0, W, H); vx.globalAlpha = 1; vx.globalCompositeOperation = "source-over"; }
  }

  // ---- lifecycle ----
  let raf = 0, lastRaf = 0, clockIv = 0, pollIv = 0, ro: ResizeObserver | null = null, stopped = false;
  function loop(t: number) { if (stopped) return; lastRaf = performance.now(); draw(t); raf = requestAnimationFrame(loop); }

  const onResize = () => fit();

  load().then(() => {
    if (stopped) return;
    compose(); seedMotes(); seedFigures(); fit();
    orchestrate().then(() => { if (REDUCED) draw(0); });
    const cell = view.parentElement;
    if (window.ResizeObserver && cell) { ro = new ResizeObserver(() => fit()); ro.observe(cell); }
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("keydown", onKey);
    if (!REDUCED) {
      raf = requestAnimationFrame(loop);
      clockIv = window.setInterval(() => { fireStep(); if (performance.now() - lastRaf > 500) draw(performance.now()); }, 200);
      pollIv = window.setInterval(() => { if (!FIRE.sim) orchestrate(); }, 15000);
    }
  });

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (clockIv) clearInterval(clockIv);
      if (pollIv) clearInterval(pollIv);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    },
  };
}
