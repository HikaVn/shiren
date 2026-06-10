// 描画（Canvas）— HD-2D風のリッチ演出
//  疑似3D壁 / 動的ライティング / 移動補間 / パーティクル / ダメージポップ / 画面シェイク
//  スプライトアセットがあれば差し替え、無ければ手続き描画にフォールバック
"use strict";

const CELL = 22; // タイル1マスのピクセルサイズ

const COLORS = {
  bg: "#05080f",
  wallTop: "#16233a",
  wallFront: "#0b1424",
  wallEdge: "#2a4470",
  floor: "#0c1626",
  floorGrid: "#13243d",
  corridor: "#0a1220",
  stairs: "#00e5ff",
  player: "#4dff88",
  ally: "#7fd4ff",
  itemDefault: "#ffd866",
  trapVisible: "#ff5c8a",
  unseenDim: "rgba(3, 6, 12, 0.78)",
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.viewW = 0;
    this.viewH = 0;
    this.camX = 0;
    this.camY = 0;
    this.now = 0;
    this.effects = []; // 再生中のエフェクト
    this.shake = 0; // 画面シェイクの残量
  }

  setView(viewW, viewH) {
    if (this.viewW !== viewW || this.viewH !== viewH) {
      this.viewW = viewW;
      this.viewH = viewH;
      this.canvas.width = viewW * CELL;
      this.canvas.height = viewH * CELL;
    }
  }

  // エンティティの表示座標を実座標へ滑らかに近付ける（テレポート級の移動は即時）
  lerpEntity(e, dt) {
    if (e._rx === undefined || Math.abs(e._rx - e.x) > 3 || Math.abs(e._ry - e.y) > 3) {
      e._rx = e.x;
      e._ry = e.y;
      return;
    }
    const k = Math.min(1, dt * 14);
    e._rx += (e.x - e._rx) * k;
    e._ry += (e.y - e._ry) * k;
  }

  updateCamera(game) {
    const { map, player } = game;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const fx = player._rx !== undefined ? player._rx : player.x;
    const fy = player._ry !== undefined ? player._ry : player.y;
    this.camX = clamp(fx - Math.floor(this.viewW / 2), 0, Math.max(0, map.w - this.viewW));
    this.camY = clamp(fy - Math.floor(this.viewH / 2), 0, Math.max(0, map.h - this.viewH));
  }

  inView(x, y) {
    return x >= this.camX - 1 && x < this.camX + this.viewW + 1 &&
           y >= this.camY - 1 && y < this.camY + this.viewH + 1;
  }

  px(x) { return (x - this.camX) * CELL; }
  py(y) { return (y - this.camY) * CELL; }

  // スプライトがあれば描画して true。縦長スプライトは足元基準（bottom-anchor）
  drawSprite(ctx, x, y, keys, scale = 1) {
    if (typeof getSprite !== "function") return false;
    for (const key of keys) {
      const spr = getSprite(key);
      if (!spr) continue;
      const f = spriteFrame(spr, this.now);
      const w = CELL * scale;
      const h = w * (spr.frameH / spr.frameW);
      ctx.drawImage(
        spr.img,
        f * spr.frameW, 0, spr.frameW, spr.frameH,
        this.px(x) + (CELL - w) / 2, this.py(y) + CELL - h, w, h
      );
      return true;
    }
    return false;
  }

  draw(game) {
    const { map, player } = game;
    if (!this.viewW) this.setView(map.w, map.h);

    const prev = this.now;
    this.now = (typeof performance !== "undefined") ? performance.now() : Date.now();
    const dt = Math.min(0.1, (this.now - (prev || this.now)) / 1000);

    // ゲーム側のエフェクトキューを取り込む
    if (game.fx && game.fx.length) {
      for (const fx of game.fx.splice(0)) {
        fx.start = this.now;
        if (fx.type === "shake") this.shake = Math.min(8, this.shake + fx.power);
        else this.effects.push(fx);
      }
    }

    // 移動補間
    this.lerpEntity(player, dt);
    for (const m of game.monsters) this.lerpEntity(m, dt);
    if (game.shop) this.lerpEntity(game.shop.keeper, dt);

    this.updateCamera(game);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 画面シェイク
    if (this.shake > 0.2) {
      ctx.translate(
        (Math.random() - 0.5) * this.shake * 2,
        (Math.random() - 0.5) * this.shake * 2
      );
      this.shake *= Math.pow(0.001, dt); // 急減衰
    } else {
      this.shake = 0;
    }

    const x0 = Math.floor(this.camX), y0 = Math.floor(this.camY);
    const x1 = Math.min(map.w, x0 + this.viewW + 2), y1 = Math.min(map.h, y0 + this.viewH + 2);

    // --- タイル ---
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!game.memory[y * map.w + x]) continue;
        this.drawTile(ctx, map, x, y, game);
      }
    }

    // 店の絨毯（tile_shop スプライトが無い場合のみ金色オーバーレイ）
    if (game.shop && !(typeof getSprite === "function" && getSprite("tile_shop"))) {
      const r = game.shop.room;
      ctx.fillStyle = "rgba(255, 216, 102, 0.10)";
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (game.memory[y * map.w + x]) ctx.fillRect(this.px(x), this.py(y), CELL, CELL);
        }
      }
    }

    // --- アイテム（発光パルス付き） ---
    const pulse = 0.6 + 0.4 * Math.sin(this.now / 300);
    for (const it of game.floorItems) {
      if (!game.memory[it.y * map.w + it.x] || !this.inView(it.x, it.y)) continue;
      if (!this.drawSprite(ctx, it.x, it.y, [`item_${it.def.id}`, `item_cat_${it.def.cat}`])) {
        this.drawGlyph(ctx, it.x, it.y, it.def.glyph, it.def.color || COLORS.itemDefault, 0, 8 * pulse);
      }
    }

    // --- 罠（発見済みのみ） ---
    for (const trap of game.traps) {
      if (trap.revealed && game.visible[trap.y * map.w + trap.x] && this.inView(trap.x, trap.y)) {
        if (!this.drawSprite(ctx, trap.x, trap.y, [`trap_${trap.def.id}`, "trap"])) {
          this.drawGlyph(ctx, trap.x, trap.y, "▲", COLORS.trapVisible);
        }
      }
    }

    // --- エンティティ（y順に描画・上下ゆれ付き） ---
    const drawables = [];
    for (const m of game.monsters) {
      if (game.visible[m.y * map.w + m.x] && this.inView(m.x, m.y)) drawables.push({ kind: "mon", e: m });
    }
    if (game.shop && !game.shop.hostile) {
      const k = game.shop.keeper;
      if (game.visible[k.y * map.w + k.x] && this.inView(k.x, k.y)) drawables.push({ kind: "keeper", e: k });
    }
    drawables.push({ kind: "player", e: player });
    drawables.sort((a, b) => (a.e._ry || a.e.y) - (b.e._ry || b.e.y));

    for (const d of drawables) {
      const e = d.e;
      const bob = Math.sin(this.now / 250 + (e.x + e.y) * 1.7) * 1.5;
      const rx = e._rx !== undefined ? e._rx : e.x;
      const ry = e._ry !== undefined ? e._ry : e.y;
      if (d.kind === "player") {
        if (!this.drawSpriteAt(ctx, rx, ry, ["player"], 1)) {
          this.drawGlyphAt(ctx, rx, ry, "@", COLORS.player, bob, 10);
        }
      } else {
        const scale = e.def.big ? 2 : 1;
        if (!this.drawSpriteAt(ctx, rx, ry, [`mon_${e.def.id}`], scale)) {
          this.drawGlyphAt(ctx, rx, ry, e.def.glyph, e.def.color, bob, 6);
        }
        if (d.kind === "mon") this.drawHpBar(ctx, e, rx, ry);
      }
    }

    // --- 視界外の踏破済みエリアを暗くする ---
    ctx.fillStyle = COLORS.unseenDim;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * map.w + x;
        if (game.memory[i] && !game.visible[i]) {
          ctx.fillRect(this.px(x), this.py(y), CELL, CELL);
        }
      }
    }

    // --- 動的ライティング（プレイヤー光源 + 周辺減光） ---
    this.drawLighting(ctx, game);

    // --- エフェクト（パーティクル・ポップ） ---
    this.drawEffects(ctx);
  }

  // 実数タイル座標版の描画ヘルパ
  drawSpriteAt(ctx, fx, fy, keys, scale) {
    if (typeof getSprite !== "function") return false;
    for (const key of keys) {
      const spr = getSprite(key);
      if (!spr) continue;
      const f = spriteFrame(spr, this.now);
      const w = CELL * scale;
      const h = w * (spr.frameH / spr.frameW);
      ctx.drawImage(
        spr.img,
        f * spr.frameW, 0, spr.frameW, spr.frameH,
        (fx - this.camX) * CELL + (CELL - w) / 2,
        (fy - this.camY) * CELL + CELL - h,
        w, h
      );
      return true;
    }
    return false;
  }

  drawGlyphAt(ctx, fx, fy, glyph, color, bobY = 0, glow = 6) {
    ctx.font = `bold ${CELL - 4}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillText(
      glyph,
      (fx - this.camX) * CELL + CELL / 2,
      (fy - this.camY) * CELL + CELL / 2 + 1 + bobY
    );
    ctx.shadowBlur = 0;
  }

  drawGlyph(ctx, x, y, glyph, color, bobY = 0, glow = 6) {
    this.drawGlyphAt(ctx, x, y, glyph, color, bobY, glow);
  }

  drawTile(ctx, map, x, y, game) {
    const t = map.get(x, y);
    const px = this.px(x), py = this.py(y);
    if (t === TILE.WALL) {
      if (this.drawSprite(ctx, x, y, ["tile_wall"])) return;
      // 疑似3D壁: 下が歩行可能なら前面（暗い面）を見せる
      const frontFace = map.isWalkable(x, y + 1);
      if (frontFace) {
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px, py, CELL, CELL * 0.55);
        ctx.fillStyle = COLORS.wallFront;
        ctx.fillRect(px, py + CELL * 0.55, CELL, CELL * 0.45);
        ctx.fillStyle = COLORS.wallEdge;
        ctx.fillRect(px, py + CELL * 0.55 - 1, CELL, 1.5);
      } else {
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.strokeStyle = "rgba(42, 68, 112, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      }
    } else if (t === TILE.FLOOR || t === TILE.STAIRS) {
      const inShop = game && game.shop && game.shop.room.contains(x, y);
      const floorKeys = inShop ? ["tile_shop", "tile_floor"] : ["tile_floor"];
      if (!this.drawSprite(ctx, x, y, floorKeys)) {
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.strokeStyle = COLORS.floorGrid;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      }
      if (t === TILE.STAIRS) {
        if (!this.drawSprite(ctx, x, y, ["tile_stairs"])) {
          // 降下シャフトはネオンの発光パルス
          const a = 0.5 + 0.5 * Math.sin(this.now / 350);
          ctx.fillStyle = `rgba(0, 229, 255, ${0.12 + 0.1 * a})`;
          ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
          this.drawGlyph(ctx, x, y, "▼", COLORS.stairs, 0, 10 + 6 * a);
        }
      }
    } else if (t === TILE.CORRIDOR) {
      if (this.drawSprite(ctx, x, y, ["tile_corridor", "tile_floor"])) return;
      ctx.fillStyle = COLORS.corridor;
      ctx.fillRect(px, py, CELL, CELL);
    }
  }

  drawHpBar(ctx, entity, rx, ry) {
    const ratio = Math.max(0, entity.hp / entity.maxHp);
    if (ratio >= 1) return;
    const px = (rx - this.camX) * CELL, py = (ry - this.camY) * CELL;
    ctx.fillStyle = "#000";
    ctx.fillRect(px + 2, py + CELL - 4, CELL - 4, 3);
    ctx.fillStyle = ratio > 0.5 ? "#4dff88" : ratio > 0.25 ? "#ffd866" : "#ff5c5c";
    ctx.fillRect(px + 2, py + CELL - 4, (CELL - 4) * ratio, 3);
  }

  // プレイヤーを中心としたネオン光源。外側ほど暗くなる
  drawLighting(ctx, game) {
    const p = game.player;
    const cx = ((p._rx !== undefined ? p._rx : p.x) - this.camX) * CELL + CELL / 2;
    const cy = ((p._ry !== undefined ? p._ry : p.y) - this.camY) * CELL + CELL / 2;
    const radius = CELL * 8;
    const grad = ctx.createRadialGradient(cx, cy, CELL * 1.5, cx, cy, radius);
    grad.addColorStop(0, "rgba(2, 4, 10, 0)");
    grad.addColorStop(0.7, "rgba(2, 4, 10, 0.18)");
    grad.addColorStop(1, "rgba(2, 4, 10, 0.5)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // パーティクル・ダメージポップの描画と寿命管理
  drawEffects(ctx) {
    const alive = [];
    for (const fx of this.effects) {
      const t = (this.now - fx.start) / (fx.duration || 700);
      if (t >= 1) continue;
      alive.push(fx);
      const sx = (fx.x - this.camX) * CELL + CELL / 2;
      const sy = (fx.y - this.camY) * CELL + CELL / 2;

      if (fx.type === "pop") {
        // ダメージ数字: 浮き上がってフェードアウト
        ctx.font = `bold ${fx.big ? 16 : 13}px "Courier New", monospace`;
        ctx.textAlign = "center";
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = fx.color || "#fff";
        ctx.shadowColor = fx.color || "#fff";
        ctx.shadowBlur = 4;
        ctx.fillText(String(fx.text), sx, sy - 6 - t * 16);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else if (fx.type === "burst") {
        // 撃破: 8方向に散るパーティクル
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = fx.color || "#ffd866";
        for (let i = 0; i < 8; i++) {
          const ang = (Math.PI * 2 * i) / 8;
          const dist = t * CELL * 1.4;
          ctx.fillRect(sx + Math.cos(ang) * dist - 1.5, sy + Math.sin(ang) * dist - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (fx.type === "ring") {
        // EMPバースト: 広がるリング
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = fx.color || "#ffe25c";
        ctx.lineWidth = 3 * (1 - t);
        ctx.beginPath();
        ctx.arc(sx, sy, t * CELL * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (fx.type === "beam") {
        // レーザー: 始点から終点への光線
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = fx.color || "#ff5c5c";
        ctx.lineWidth = 2;
        ctx.shadowColor = fx.color || "#ff5c5c";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo((fx.x2 - this.camX) * CELL + CELL / 2, (fx.y2 - this.camY) * CELL + CELL / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
    this.effects = alive;
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
