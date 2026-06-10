// 描画（Canvas）— 近未来ネオン調のタイル表示
// スマホ等の小画面ではプレイヤー追従カメラで一部領域のみ拡大表示する
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
    this.viewW = 0;
    this.viewH = 0;
    this.camX = 0;
    this.camY = 0;
  }

  // ビューポートのタイル数を設定（フルマップ or 追従カメラ）
  setView(viewW, viewH) {
    if (this.viewW !== viewW || this.viewH !== viewH) {
      this.viewW = viewW;
      this.viewH = viewH;
      this.canvas.width = viewW * CELL;
      this.canvas.height = viewH * CELL;
    }
  }

  updateCamera(game) {
    const { map, player } = game;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    this.camX = clamp(player.x - Math.floor(this.viewW / 2), 0, Math.max(0, map.w - this.viewW));
    this.camY = clamp(player.y - Math.floor(this.viewH / 2), 0, Math.max(0, map.h - this.viewH));
  }

  inView(x, y) {
    return x >= this.camX && x < this.camX + this.viewW &&
           y >= this.camY && y < this.camY + this.viewH;
  }

  px(x) { return (x - this.camX) * CELL; }
  py(y) { return (y - this.camY) * CELL; }

  draw(game) {
    const { map, player } = game;
    if (!this.viewW) this.setView(map.w, map.h);
    this.updateCamera(game);
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const x0 = this.camX, y0 = this.camY;
    const x1 = Math.min(map.w, x0 + this.viewW), y1 = Math.min(map.h, y0 + this.viewH);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!game.memory[y * map.w + x]) continue; // 未踏破は描かない
        this.drawTile(ctx, map, x, y);
      }
    }

    // 店の絨毯（金色のフロア）
    if (game.shop) {
      const r = game.shop.room;
      ctx.fillStyle = "rgba(255, 216, 102, 0.10)";
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (game.memory[y * map.w + x] && this.inView(x, y)) {
            ctx.fillRect(this.px(x), this.py(y), CELL, CELL);
          }
        }
      }
    }

    // アイテム
    for (const it of game.floorItems) {
      if (!game.memory[it.y * map.w + it.x] || !this.inView(it.x, it.y)) continue;
      this.drawGlyph(ctx, it.x, it.y, it.def.glyph, it.def.color || COLORS.itemDefault);
    }

    // 罠（発見済みのみ）
    for (const trap of game.traps) {
      if (trap.revealed && game.visible[trap.y * map.w + trap.x] && this.inView(trap.x, trap.y)) {
        this.drawGlyph(ctx, trap.x, trap.y, "▲", COLORS.trapVisible);
      }
    }

    // モンスター（視界内のみ）
    for (const m of game.monsters) {
      if (!game.visible[m.y * map.w + m.x] || !this.inView(m.x, m.y)) continue;
      this.drawGlyph(ctx, m.x, m.y, m.def.glyph, m.def.color);
      this.drawHpBar(ctx, m);
    }

    // 店主（非敵対時。敵対後は通常モンスターとして描画される）
    if (game.shop && !game.shop.hostile) {
      const k = game.shop.keeper;
      if (game.visible[k.y * map.w + k.x] && this.inView(k.x, k.y)) {
        this.drawGlyph(ctx, k.x, k.y, k.def.glyph, k.def.color);
      }
    }

    // 仲間
    if (game.ally && game.ally.hp > 0 && this.inView(game.ally.x, game.ally.y)) {
      this.drawGlyph(ctx, game.ally.x, game.ally.y, "@", COLORS.ally);
      this.drawHpBar(ctx, game.ally);
    }

    // プレイヤー
    this.drawGlyph(ctx, player.x, player.y, "@", COLORS.player);

    // 視界外の踏破済みエリアを暗くする
    ctx.fillStyle = COLORS.fovDim;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * map.w + x;
        if (game.memory[i] && !game.visible[i]) {
          ctx.fillRect(this.px(x), this.py(y), CELL, CELL);
        }
      }
    }
  }

  drawTile(ctx, map, x, y) {
    const t = map.get(x, y);
    const px = this.px(x),
      py = this.py(y);
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
    ctx.fillText(glyph, this.px(x) + CELL / 2, this.py(y) + CELL / 2 + 1);
    ctx.shadowBlur = 0;
  }

  drawHpBar(ctx, entity) {
    const ratio = Math.max(0, entity.hp / entity.maxHp);
    if (ratio >= 1) return;
    const px = this.px(entity.x),
      py = this.py(entity.y);
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
