// 描画（Canvas）— 近未来ネオン調のタイル表示
"use strict";

const CELL = 22; // タイル1マスのピクセルサイズ

const COLORS = {
  bg: "#05080f",
  wall: "#101a2c",
  wallEdge: "#1d3050",
  floor: "#0c1626",
  floorGrid: "#13243d",
  corridor: "#0a1220",
  stairs: "#00e5ff",
  player: "#4dff88",
  ally: "#7fd4ff",
  itemDefault: "#ffd866",
  trapHidden: null,
  trapVisible: "#ff5c8a",
  fovDim: "rgba(3, 6, 12, 0.78)",
  unseen: "#02040a",
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(mapW, mapH) {
    this.canvas.width = mapW * CELL;
    this.canvas.height = mapH * CELL;
  }

  draw(game) {
    const { map, player } = game;
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (!game.memory[y * map.w + x]) continue; // 未踏破は描かない
        this.drawTile(ctx, map, x, y);
      }
    }

    // アイテム
    for (const it of game.floorItems) {
      if (!game.memory[it.y * map.w + it.x]) continue;
      this.drawGlyph(ctx, it.x, it.y, it.def.glyph, it.def.color || COLORS.itemDefault);
    }

    // 罠（発見済みのみ）
    for (const trap of game.traps) {
      if (trap.revealed && game.visible[trap.y * map.w + trap.x]) {
        this.drawGlyph(ctx, trap.x, trap.y, "▲", COLORS.trapVisible);
      }
    }

    // モンスター（視界内のみ）
    for (const m of game.monsters) {
      if (!game.visible[m.y * map.w + m.x]) continue;
      this.drawGlyph(ctx, m.x, m.y, m.def.glyph, m.def.color);
      this.drawHpBar(ctx, m);
    }

    // 仲間
    if (game.ally && game.ally.hp > 0) {
      this.drawGlyph(ctx, game.ally.x, game.ally.y, "@", COLORS.ally);
      this.drawHpBar(ctx, game.ally);
    }

    // プレイヤー
    this.drawGlyph(ctx, player.x, player.y, "@", COLORS.player);

    // 視界外の踏破済みエリアを暗くする
    ctx.fillStyle = COLORS.fovDim;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        if (game.memory[i] && !game.visible[i]) {
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }
  }

  drawTile(ctx, map, x, y) {
    const t = map.get(x, y);
    const px = x * CELL,
      py = y * CELL;
    if (t === TILE.WALL) {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = COLORS.wallEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
    } else if (t === TILE.FLOOR || t === TILE.STAIRS) {
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = COLORS.floorGrid;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      if (t === TILE.STAIRS) {
        this.drawGlyph(ctx, x, y, "▼", COLORS.stairs);
      }
    } else if (t === TILE.CORRIDOR) {
      ctx.fillStyle = COLORS.corridor;
      ctx.fillRect(px, py, CELL, CELL);
    }
  }

  drawGlyph(ctx, x, y, glyph, color) {
    ctx.font = `bold ${CELL - 4}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillText(glyph, x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
    ctx.shadowBlur = 0;
  }

  drawHpBar(ctx, entity) {
    const ratio = Math.max(0, entity.hp / entity.maxHp);
    if (ratio >= 1) return;
    const px = entity.x * CELL,
      py = entity.y * CELL;
    ctx.fillStyle = "#000";
    ctx.fillRect(px + 2, py + CELL - 4, CELL - 4, 3);
    ctx.fillStyle = ratio > 0.5 ? "#4dff88" : ratio > 0.25 ? "#ffd866" : "#ff5c5c";
    ctx.fillRect(px + 2, py + CELL - 4, (CELL - 4) * ratio, 3);
  }
}

// 視界計算: シレン式（部屋内なら部屋全体が見える、通路では周囲1マス）
function computeVisibility(game) {
  const { map, player } = game;
  game.visible = new Uint8Array(map.w * map.h);
  const room = map.roomAt(player.x, player.y);
  if (room) {
    // 部屋全体 + 外周（入口が見えるように）
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (map.inBounds(x, y)) {
          game.visible[y * map.w + x] = 1;
          game.memory[y * map.w + x] = 1;
        }
      }
    }
  } else {
    // 通路: 周囲1マス
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = player.x + dx,
          y = player.y + dy;
        if (map.inBounds(x, y)) {
          game.visible[y * map.w + x] = 1;
          game.memory[y * map.w + x] = 1;
        }
      }
    }
  }
}
