// ダンジョン生成（シレン式: グリッド分割で部屋を配置し通路で接続）
"use strict";

const TILE = {
  WALL: 0,
  FLOOR: 1, // 部屋の床
  CORRIDOR: 2, // 通路
  STAIRS: 3, // 階段（次フロアへ）
};

class Room {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  get cx() {
    return this.x + Math.floor(this.w / 2);
  }
  get cy() {
    return this.y + Math.floor(this.h / 2);
  }
  contains(x, y) {
    return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
  }
  // 部屋の入口（縁を含む）判定用
  containsWithBorder(x, y) {
    return x >= this.x - 1 && x <= this.x + this.w && y >= this.y - 1 && y <= this.y + this.h;
  }
}

class DungeonMap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h); // TILE.WALL 初期化
    this.rooms = [];
    this.stairs = { x: -1, y: -1 };
  }
  inBounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }
  get(x, y) {
    return this.inBounds(x, y) ? this.tiles[y * this.w + x] : TILE.WALL;
  }
  set(x, y, t) {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }
  isWalkable(x, y) {
    const t = this.get(x, y);
    return t === TILE.FLOOR || t === TILE.CORRIDOR || t === TILE.STAIRS;
  }
  roomAt(x, y) {
    for (const r of this.rooms) if (r.contains(x, y)) return r;
    return null;
  }
}

// グリッドセル分割方式でフロアを生成する
function generateFloor(rng, opts = {}) {
  const W = opts.w || 56;
  const H = opts.h || 36;
  const map = new DungeonMap(W, H);

  // 3x3 のセルに分割し、一部のセルに部屋を作る
  const COLS = 3,
    ROWS = 3;
  const cellW = Math.floor(W / COLS);
  const cellH = Math.floor(H / ROWS);

  const cells = [];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      cells.push({ cx, cy, room: null });
    }
  }

  const roomCount = rng.int(4, COLS * ROWS);
  const roomCells = rng.shuffle(cells.slice()).slice(0, roomCount);

  for (const cell of roomCells) {
    const baseX = cell.cx * cellW;
    const baseY = cell.cy * cellH;
    const maxW = cellW - 3;
    const maxH = cellH - 3;
    const rw = rng.int(Math.min(4, maxW), maxW);
    const rh = rng.int(Math.min(4, maxH), maxH);
    const rx = baseX + 1 + rng.int(0, Math.max(0, cellW - rw - 2));
    const ry = baseY + 1 + rng.int(0, Math.max(0, cellH - rh - 2));
    const room = new Room(rx, ry, rw, rh);
    cell.room = room;
    map.rooms.push(room);
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++) map.set(x, y, TILE.FLOOR);
  }

  // 部屋を持つセル同士を隣接関係で接続（最小全域木 + 追加接続）
  const occupied = cells.filter((c) => c.room);
  const connected = new Set([occupied[0]]);
  const edges = [];
  const adjacency = (a, b) =>
    Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) === 1;

  while (connected.size < occupied.length) {
    let found = false;
    for (const a of Array.from(connected)) {
      const candidates = occupied.filter((b) => !connected.has(b) && adjacency(a, b));
      if (candidates.length) {
        const b = rng.pick(candidates);
        edges.push([a, b]);
        connected.add(b);
        found = true;
        break;
      }
    }
    if (!found) {
      // 隣接で繋げない場合は最も近い未接続セルへ強制接続
      const rest = occupied.filter((b) => !connected.has(b));
      const a = rng.pick(Array.from(connected));
      const b = rest[0];
      edges.push([a, b]);
      connected.add(b);
    }
  }
  // ループを作るため追加の通路をいくつか
  for (const a of occupied) {
    for (const b of occupied) {
      if (a !== b && adjacency(a, b) && rng.chance(0.25)) edges.push([a, b]);
    }
  }

  for (const [a, b] of edges) {
    carveCorridor(map, rng, a.room, b.room);
  }

  // 階段を配置（ランダムな部屋の中）
  const stairRoom = rng.pick(map.rooms);
  const sx = rng.int(stairRoom.x, stairRoom.x + stairRoom.w - 1);
  const sy = rng.int(stairRoom.y, stairRoom.y + stairRoom.h - 1);
  map.set(sx, sy, TILE.STAIRS);
  map.stairs = { x: sx, y: sy };

  return map;
}

// L字型の通路を掘る（部屋の床は上書きしない）
function carveCorridor(map, rng, roomA, roomB) {
  let x = roomA.cx,
    y = roomA.cy;
  const tx = roomB.cx,
    ty = roomB.cy;
  const horizontalFirst = rng.chance(0.5);

  const dig = (x, y) => {
    if (map.get(x, y) === TILE.WALL) map.set(x, y, TILE.CORRIDOR);
  };

  if (horizontalFirst) {
    while (x !== tx) {
      x += Math.sign(tx - x);
      dig(x, y);
    }
    while (y !== ty) {
      y += Math.sign(ty - y);
      dig(x, y);
    }
  } else {
    while (y !== ty) {
      y += Math.sign(ty - y);
      dig(x, y);
    }
    while (x !== tx) {
      x += Math.sign(tx - x);
      dig(x, y);
    }
  }
}

// 部屋内のランダムな空き床座標を返す
function randomFloorInRoom(rng, map, room, isOccupied) {
  for (let tries = 0; tries < 50; tries++) {
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);
    if (map.get(x, y) === TILE.FLOOR && !(isOccupied && isOccupied(x, y))) {
      return { x, y };
    }
  }
  return null;
}

function randomFloorTile(rng, map, isOccupied) {
  const room = rng.pick(map.rooms);
  return randomFloorInRoom(rng, map, room, isOccupied);
}
