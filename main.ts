// Sokoban solver: push-optimal search, room by room. The levels are independent rooms off a hallway (a box
// pushed out of its room is lost), so each room is solved on its own and the rooms' optima add up to the
// level's. A room is searched with an A* over pushes (a state: the boxes' squares plus the player's reachable
// region, named by its lowest square), guided by a minimum-cost matching of boxes to goals over precomputed
// single-box push distances, pruned by dead squares and frozen 2 x 2 blocks; a plain breadth-first search over
// pushes retries any room the A* gives up on. Budgets are counted in states, never the clock, and every tie
// breaks by square order, so two runs answer byte for byte alike.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const DIRS = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];
const MAX_STATES = 3_000_000;

/** A level in XSB text: width and height, walls (the outermost frame is wall whatever it shows), goals, boxes, player. */
function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/** dist[s]: the fewest pushes that bring a lone box from s to `goal`, other boxes ignored; -1 when impossible. */
function pushDist(w, wall, goal) {
  const dist = new Int32Array(wall.length).fill(-1);
  dist[goal] = 0;
  const queue = [goal];
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i];
    for (let k = 0; k < 4; k++) {
      const d = DIRS[k][1] * w + DIRS[k][0];
      const y = x - d;
      if (dist[y] < 0 && !wall[y] && !wall[y - d]) {
        dist[y] = dist[x] + 1;
        queue.push(y);
      }
    }
  }
  return dist;
}

/** Marks the region the player reaches from `from` around walls and `occupied` into `seen` under `stamp`; its lowest square. */
function reach(level, occupied, from, seen, stamp, stack) {
  const { w, wall } = level;
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const nb = [p - w, p + w, p - 1, p + 1];
    for (let k = 0; k < 4; k++) {
      const q = nb[k];
      if (wall[q] === 0 && occupied[q] === 0 && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/** Whether the box just pushed to `t` sits in a frozen 2 x 2 block of walls and boxes with a box off its goal. */
function frozenBlock(level, occupied, goal, t) {
  const { w, wall } = level;
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower LURD letters (the first direction first on ties). */
function walkTo(level, occupied, from, to) {
  const { w, wall } = level;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * w + dx;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: the push square is out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/** The square the player stands on after `moves` (LURD, the case aside) from `from` on a board `w` wide. */
function endOf(w, from, moves) {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

/** The push search over one (sub)level: A* when `guided`, else breadth-first in pushes. {pushes, moves} or null. */
function search(level, maxStates, guided) {
  const { w, wall, goals } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const dists = goals.map((g) => pushDist(w, wall, g));
  const live = new Uint8Array(size);
  for (let s = 0; s < size; s++) {
    for (let j = 0; j < goals.length; j++) {
      if (dists[j][s] >= 0) {
        live[s] = 1;
        break;
      }
    }
  }
  const n = level.boxes.length;
  if (level.boxes.some((b) => !live[b])) return null;
  const solved = (boxes) => boxes.every((b) => goal[b]);
  if (solved(level.boxes)) return { pushes: 0, moves: '' };

  // The heuristic: the cheapest assignment of distinct goals to boxes by push distance (few boxes: a subset DP;
  // many: each box's nearest goal). A relaxation of the true cost, so the A* stays push-optimal.
  const pc = new Uint8Array(1 << Math.min(n, 6));
  for (let m = 1; m < pc.length; m++) pc[m] = pc[m >> 1] + (m & 1);
  const heuristic = (boxes) => {
    if (n <= 6) {
      const dp = new Float64Array(1 << n).fill(Infinity);
      dp[0] = 0;
      for (let mask = 0; mask < dp.length; mask++) {
        const cur = dp[mask];
        if (cur === Infinity) continue;
        const i = pc[mask];
        if (i >= n) continue;
        for (let j = 0; j < n; j++) {
          if (mask & (1 << j)) continue;
          const c = dists[j][boxes[i]];
          if (c >= 0 && cur + c < dp[mask | (1 << j)]) dp[mask | (1 << j)] = cur + c;
        }
      }
      return dp[dp.length - 1];
    }
    let sum = 0;
    for (const b of boxes) {
      let best = Infinity;
      for (let j = 0; j < n; j++) if (dists[j][b] >= 0 && dists[j][b] < best) best = dists[j][b];
      if (best === Infinity) return Infinity;
      sum += best;
    }
    return sum;
  };

  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const keyOf = (boxes, low) => `${low}|${boxes.join(',')}`;

  const sBoxes = [level.boxes];
  const sPlayer = [level.player];
  const sParent = [-1];
  const sFrom = [-1];
  const sDir = [-1];
  const best = new Map();
  for (const b of level.boxes) occupied[b] = 1;
  const rootLow = reach(level, occupied, level.player, seen, ++stamp, stack);
  for (const b of level.boxes) occupied[b] = 0;
  best.set(keyOf(level.boxes, rootLow), 0);

  // The open list: a heap on (f = g + h, then deeper g, then the older state), or a plain queue when unguided.
  const heap = [];
  const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] < b[2])));
  const hPush = (e) => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const hPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && before(heap[c + 1], heap[c])) c++;
        if (!before(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return top;
  };
  const h0 = guided ? heuristic(level.boxes) : 0;
  if (h0 === Infinity) return null;
  hPush([h0, 0, 0]);
  let found = -1;
  while (heap.length > 0 && found < 0) {
    const [, g, head] = hPop();
    const boxes = sBoxes[head];
    for (const b of boxes) occupied[b] = 1;
    const low = reach(level, occupied, sPlayer[head], seen, ++stamp, stack);
    if (best.get(keyOf(boxes, low)) !== g) {
      for (const b of boxes) occupied[b] = 0;
      continue;
    }
    if (solved(boxes)) {
      found = head;
      break;
    }
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi];
      for (let k = 0; k < 4; k++) {
        const d = DIRS[k][1] * w + DIRS[k][0];
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(level, occupied, goal, t);
        let next = null;
        let key = null;
        let h = 0;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          h = guided ? heuristic(next) : 0;
          if (h !== Infinity) key = keyOf(next, reach(level, occupied, b, mark, ++stamp, stack));
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (key === null) continue;
        const ng = g + 1;
        const known = best.get(key);
        if (known !== undefined && known <= ng) continue;
        if (sBoxes.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        best.set(key, ng);
        sBoxes.push(next);
        sPlayer.push(b);
        sParent.push(head);
        sFrom.push(b);
        sDir.push(k);
        hPush([ng + h, ng, sBoxes.length - 1]);
      }
    }
    for (const b of boxes) occupied[b] = 0;
  }
  if (found < 0) return null;
  occupied.fill(0);
  const path = [];
  for (let s = found; s > 0; s = sParent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let player = level.player;
  let boxes = level.boxes;
  for (const s of path) {
    const from = sFrom[s];
    const d = DIRS[sDir[s]][1] * w + DIRS[sDir[s]][0];
    for (const b of boxes) occupied[b] = 1;
    moves += walkTo(level, occupied, player, from - d);
    for (const b of boxes) occupied[b] = 0;
    moves += DIRS[sDir[s]][3];
    player = from;
    boxes = sBoxes[s];
  }
  return { pushes: path.length, moves };
}

/** One (sub)level at its push optimum: the guided A* first, the plain breadth-first search behind it. */
function solvePushOptimal(level) {
  return search(level, MAX_STATES, true) ?? search(level, MAX_STATES, false);
}

/** The level's rooms: the parts of the floor left when the hallway row's dead squares are cut out, each holding
 * a box. Null when a part holds more or fewer boxes than goals, or a box starts in the hallway. */
function roomsOf(level) {
  const { w, wall, goals, boxes, player } = level;
  const live = new Uint8Array(wall.length);
  for (const g of goals) {
    const dist = pushDist(w, wall, g);
    for (let s = 0; s < dist.length; s++) if (dist[s] >= 0) live[s] = 1;
  }
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** The level's moves at its push optimum, room by room; '' when a search gives up. */
function solve(text) {
  const level = parseLevel(text);
  const rooms = roomsOf(level);
  if (rooms === null) {
    const whole = solvePushOptimal(level);
    return whole === null ? '' : whole.moves;
  }
  let player = level.player;
  let moves = '';
  const done = new Set();
  for (const room of rooms) {
    const wall = level.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of done.has(other) ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub = {
      w: level.w,
      h: level.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solvedRoom = solvePushOptimal(sub);
    if (solvedRoom === null) return '';
    moves += solvedRoom.moves;
    player = endOf(level.w, player, solvedRoom.moves);
    done.add(room);
  }
  return moves;
}

for (const id of readdirSync(I).sort()) {
  let moves = '';
  try {
    moves = solve(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  } catch {
    moves = '';
  }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
