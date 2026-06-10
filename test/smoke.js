// ヘッドレス・スモークテスト: node test/smoke.js
// ブラウザ無しでコアロジック（生成・移動・戦闘・アイテム・階層移動）を検証する
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { console, Math, Date, Uint8Array };
vm.createContext(ctx);
for (const f of ["rng.js", "dungeon.js", "data.js", "render.js", "game.js"]) {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
  vm.runInContext(src, ctx, { filename: f });
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok: ${msg}`);
  } else {
    failures++;
    console.error(`  FAIL: ${msg}`);
  }
}

vm.runInContext(`
  globalThis.results = [];
  function record(cond, msg) { results.push([!!cond, msg]); }

  // --- 基本生成 ---
  const game = new Game(12345);
  game.state = "play";
  record(game.map.rooms.length >= 4, "フロアに4部屋以上ある");
  record(game.map.stairs.x >= 0, "階段が配置されている");
  record(game.player.hp === 15 && game.player.maxHp === 15, "初期HPは15");
  record(game.player.strength === 8, "初期ちからは8");
  record(game.player.fullness === 100, "初期充電率は100");
  record(game.monsters.length >= 4, "モンスターが配置されている");
  record(game.traps.length >= 4, "罠が配置されている");
  record(game.player.inventory.length === 1, "初期アイテムを1つ持っている");

  // --- 未識別名 ---
  const herbDefs = ITEMS.filter(d => d.cat === "herb");
  record(herbDefs.every(d => game.fakeNames[d.id]), "全ての薬剤に未識別名が割り当て済み");

  // --- ダメージ計算 ---
  const dmg = game.calcDamage(10, 4);
  record(dmg >= 1 && dmg <= 12, "ダメージ計算が妥当な範囲 (got " + dmg + ")");

  // --- ランダム移動を大量に回して例外が出ないこと ---
  let moved = 0;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]];
  for (let i = 0; i < 3000 && game.state === "play"; i++) {
    const d = dirs[Math.floor(game.rng.next() * dirs.length)];
    if (game.playerMove(d[0], d[1])) moved++;
    if (game.map.get(game.player.x, game.player.y) === TILE.STAIRS && game.floor < 5) {
      game.descend(false);
    }
  }
  record(moved > 100, "3000回の入力で100ターン以上経過 (" + moved + ")");
  record(game.turn > 0 || game.state !== "play", "ターンが進行する");

  // --- アイテム使用 ---
  const g2 = new Game(999);
  g2.state = "play";
  g2.monsters = []; // 食事テスト中に敵へ倒されないように
  const p = g2.player;
  // 回復薬
  const heal = new Item(g2.itemDef("repair_nano"), g2.rng);
  p.inventory.push(heal);
  p.hp = 1;
  g2.useItem(heal);
  record(p.hp > 1, "リペアナノでHPが回復する");
  record(g2.identified.has("repair_nano"), "使用したアイテムが識別される");
  // 装備と共鳴
  const wpn = new Item(g2.itemDef("pulse_blade"), g2.rng);
  const shd = new Item(g2.itemDef("pulse_barrier"), g2.rng);
  p.inventory.push(wpn, shd);
  g2.equip(wpn);
  g2.equip(shd);
  record(g2.resonanceActive(), "パルス共鳴が発動する");
  const atkWith = g2.playerAtkValue();
  g2.equip(shd); // 外す
  record(!g2.resonanceActive(), "防具を外すと共鳴が解除される");
  record(atkWith > g2.playerAtkValue(), "共鳴中は攻撃力が高い");
  // 食料とオーバーチャージ
  p.fullness = p.maxFullness;
  for (let i = 0; i < 30; i++) {
    const food = new Item(g2.itemDef("big_energy_pack"), g2.rng);
    p.inventory.push(food);
    g2.eatFood(food);
  }
  record(p.maxFullness > 100, "満タン時の補給で最大充電率が上がる (" + p.maxFullness + ")");
  record(p.maxFullness <= 200, "最大充電率の上限は200");
  record(p.overcharge === (p.fullness >= 120), "オーバーチャージ状態の整合性");

  // --- 戦闘でモンスターを倒せる ---
  const g3 = new Game(777);
  g3.state = "play";
  g3.monsters = [];
  const def = MONSTERS[0];
  const m = new Monster(def, g3.player.x + 1, g3.player.y, g3);
  m.asleep = true; m.disguised = false;
  g3.monsters.push(m);
  const expBefore = g3.player.exp;
  for (let i = 0; i < 20 && g3.monsters.length > 0; i++) {
    g3.playerAttack(m);
  }
  record(g3.monsters.length === 0, "モンスターを倒せる");
  record(g3.player.exp > expBefore, "撃破で経験値を得る");

  // --- 経験値テーブル ---
  record(expForLevel(2) === 8, "Lv2に必要な経験値は8");
  record(expForLevel(10) > expForLevel(5), "経験値テーブルが単調増加");

  // --- 最深層に神髄コアとボスがいる ---
  const g4 = new Game(555);
  g4.state = "play";
  g4.floor = FINAL_FLOOR - 1;
  // 階段の上に移動して降りる
  g4.player.x = g4.map.stairs.x; g4.player.y = g4.map.stairs.y;
  g4.descend(false);
  record(g4.floor === FINAL_FLOOR, "最深層に到達できる");
  record(g4.floorItems.some(it => it.def.cat === "goal"), "最深層に神髄コアがある");
  record(g4.monsters.some(m => m.def.boss), "最深層にボスがいる");

  // --- ゲームオーバー（アイテム/レベルを失う） ---
  const g5 = new Game(333);
  g5.state = "play";
  g5.player.level = 10;
  g5.damagePlayer(9999, "テスト");
  record(g5.state === "gameover", "HP0でゲームオーバーになる");
  g5.resetRun();
  record(g5.player.level === 1 && g5.player.inventory.length === 1, "リセットでLv1・持ち物初期化");

  // --- バックアップチップで復活 ---
  const g6 = new Game(222);
  g6.state = "play";
  g6.player.inventory.push(new Item(g6.itemDef("backup_chip"), g6.rng));
  g6.damagePlayer(9999, "テスト");
  record(g6.state === "play" && g6.player.hp === g6.player.maxHp, "バックアップチップで復活する");
`, ctx);

console.log("smoke test:");
for (const [ok, msg] of ctx.results) assert(ok, msg);
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
