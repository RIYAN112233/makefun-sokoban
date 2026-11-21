// Push-optimal Sokoban solver, compact edition: rooms split along the hallway, each solved by BFS over pushes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const IN = process.env.MAKEFUN_INPUT_DIR ?? "/input", OUT = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const DR = [[0, -1, "u"], [0, 1, "d"], [-1, 0, "l"], [1, 0, "r"]];

function parse(text) {
  const rows = text.split("\n").filter(r => r.length);
  const h = rows.length, w = Math.max(...rows.map(r => r.length)), n = w * h;
  const wall = new Uint8Array(n).fill(1), goals = [], boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x], i = y * w + x;
      if (c === "#") continue;
      wall[i] = 0;
      if (".*+".includes(c)) goals.push(i);
      if ("$*".includes(c)) boxes.push(i);
      if ("@+".includes(c)) player = i;
    }
  });
  for (let x = 0; x < w; x++) wall[x] = wall[(h - 1) * w + x] = 1;
  for (let y = 0; y < h; y++) wall[y * w] = wall[y * w + w - 1] = 1;
  return { w, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

// Squares from which one box alone can be pushed onto some goal, pulled back from the goals.
function live(w, wall, goals) {
  const lv = new Uint8Array(wall.length), q = [];
  for (const g of goals) { lv[g] = 1; q.push(g); }
  for (let i = 0; i < q.length; i++) {
    const x = q[i];
    for (const [dx, dy] of DR) {
      const d = dy * w + dx, y = x - d;
      if (!wall[y] && !wall[y - d] && !lv[y]) { lv[y] = 1; q.push(y); }
    }
  }
  return lv;
}

// Flood the player's region around the boxes; stamp it into seen and return its lowest square.
function reach(w, wall, occ, from, seen, stamp) {
  let low = from;
  const st = [from];
  seen[from] = stamp;
  while (st.length) {
    const p = st.pop();
    if (p < low) low = p;
    for (const o of [-w, w, -1, 1]) {
      const q = p + o;
      if (!wall[q] && !occ[q] && seen[q] !== stamp) { seen[q] = stamp; st.push(q); }
    }
  }
  return low;
}

// True when the box pushed to t completes a 2x2 block of walls/boxes with a box off its goal.
function frozen(w, wall, occ, goal, t) {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1, c = a + w, d = c + 1;
    if ((wall[a] || occ[a]) && (wall[b] || occ[b]) && (wall[c] || occ[c]) && (wall[d] || occ[d]) &&
      ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d]))) return true;
  }
  return false;
}

// The player's shortest walk from one square to another around walls and boxes.
function walk(w, wall, occ, from, to) {
  if (from === to) return "";
  const prev = new Int32Array(wall.length).fill(-1), how = [], q = [from];
  prev[from] = from;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    if (p === to) break;
    for (const [dx, dy, ch] of DR) {
      const s = p + dy * w + dx;
      if (wall[s] || occ[s] || prev[s] !== -1) continue;
      prev[s] = p; how[s] = ch; q.push(s);
    }
  }
  let s = "";
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

// BFS over pushes for one (sub)level: {moves, player} at the push optimum, or null. A state is the
// sorted boxes plus the player region's lowest square; dead squares and frozen blocks prune.
function solve(w, wall, goals, boxes0, player0) {
  const n = wall.length, goal = new Uint8Array(n);
  for (const g of goals) goal[g] = 1;
  const lv = live(w, wall, goals);
  if (boxes0.some(b => !lv[b])) return null;
  const occ = new Uint8Array(n), seen = new Int32Array(n), mk = new Int32Array(n);
  let stamp = 0;
  const key = (bs, low) => String.fromCharCode(low, ...bs);
  const SB = [boxes0], SP = [player0], PA = [-1], idx = new Map();
  const done = bs => bs.every(b => goal[b]);
  for (const b of boxes0) occ[b] = 1;
  idx.set(key(boxes0, reach(w, wall, occ, player0, seen, ++stamp)), 0);
  for (const b of boxes0) occ[b] = 0;
  let found = done(boxes0) ? 0 : -1;
  for (let head = 0; found < 0 && head < SB.length; head++) {
    const boxes = SB[head];
    for (const b of boxes) occ[b] = 1;
    reach(w, wall, occ, SP[head], seen, ++stamp);
    const here = stamp;
    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi];
      for (const [dx, dy] of DR) {
        if (found >= 0) break;
        const d = dy * w + dx, t = b + d;
        if (seen[b - d] !== here || wall[t] || occ[t] || !lv[t]) continue;
        occ[b] = 0; occ[t] = 1;
        let nx = null, k = "";
        if (!frozen(w, wall, occ, goal, t)) {
          nx = boxes.slice(); nx[bi] = t; nx.sort((x, y) => x - y);
          k = key(nx, reach(w, wall, occ, b, mk, ++stamp));
        }
        occ[t] = 0; occ[b] = 1;
        if (!nx || idx.has(k)) continue;
        idx.set(k, SB.length); SB.push(nx); SP.push(b); PA.push(head);
        if (done(nx)) found = SB.length - 1;
      }
      if (found >= 0) break;
    }
    for (const b of boxes) occ[b] = 0;
  }
  if (found < 0) return null;
  const path = [];
  for (let s = found; s > 0; s = PA[s]) path.push(s);
  path.reverse();
  let moves = "", player = player0, boxes = boxes0;
  for (const s of path) {
    const nb = SB[s];
    const from = boxes.find(b => !nb.includes(b)), to = nb.find(b => !boxes.includes(b));
    const d = to - from, dir = DR.find(([dx, dy]) => dy * w + dx === d);
    for (const b of boxes) occ[b] = 1;
    moves += walk(w, wall, occ, player, from - d);
    for (const b of boxes) occ[b] = 0;
    moves += dir[2];
    player = from; boxes = nb;
  }
  return { moves, player };
}

// Rooms: cut the dead squares of the player's row (the hallway) out of the floor; each part left with
// boxes is a room. Null when a box starts in the hallway, a goal is in no part, or counts disagree.
function roomsOf(L) {
  const { w, wall, goals, boxes, player } = L, n = wall.length;
  const lv = live(w, wall, goals), row = (player / w) | 0, cut = new Uint8Array(n);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !lv[i]) cut[i] = 1;
  if (boxes.some(b => cut[b])) return null;
  const part = new Int32Array(n).fill(-1), comps = [];
  for (let s = 0; s < n; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const cells = [s];
    part[s] = comps.length;
    for (let i = 0; i < cells.length; i++) {
      for (const [dx, dy] of DR) {
        const q = cells[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) { part[q] = comps.length; cells.push(q); }
      }
    }
    comps.push({ boxes: [], goals: [] });
  }
  for (const b of boxes) comps[part[b]].boxes.push(b);
  for (const g of goals) {
    if (part[g] < 0) return null;
    comps[part[g]].goals.push(g);
  }
  if (comps.some(c => c.boxes.length !== c.goals.length)) return null;
  return comps.filter(c => c.boxes.length);
}

// Solve room by room: other rooms' boxes stand as walls (on their goals once done), the player walks
// on from where the last room left it. A box leaving its room lands dead, so the optima simply add.
function solveLevel(L) {
  const rooms = roomsOf(L);
  if (!rooms) {
    const r = solve(L.w, L.wall, L.goals, L.boxes, L.player);
    return r ? r.moves : "";
  }
  let player = L.player, moves = "";
  const dn = rooms.map(() => false);
  for (let ri = 0; ri < rooms.length; ri++) {
    const wall = L.wall.slice();
    rooms.forEach((o, oi) => {
      if (oi !== ri) for (const b of dn[oi] ? o.goals : o.boxes) wall[b] = 1;
    });
    const r = solve(L.w, wall, rooms[ri].goals, rooms[ri].boxes, player);
    if (!r) return "";
    moves += r.moves;
    player = r.player;
    dn[ri] = true;
  }
  return moves;
}

for (const id of readdirSync(IN).sort()) {
  const moves = solveLevel(parse(readFileSync(join(IN, id, "level.txt"), "utf8")));
  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, "solution.txt"), moves + "\n");
}
