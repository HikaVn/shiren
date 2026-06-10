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

  // --- 店: 購入・支払い・泥棒 ---
  let g7 = null;
  for (let seed = 1; seed < 300; seed++) {
    const g = new Game(seed);
    g.state = "play";
    g.floor = 2;
    g.generateNewFloor();
    if (g.shop) { g7 = g; break; }
  }
  record(g7 !== null, "店が生成される");
  if (g7) {
    const p7 = g7.player;
    p7.maxHp = 9999; p7.hp = 9999; // テスト中に倒されないように
    const goods = g7.floorItems.find(it => it.shopPrice > 0);
    record(goods, "店に値札付きの商品が並んでいる");
    record(g7.shop.keeper.def.id === "merchant_droid", "店主がいる");
    // 商品を拾うと未払いになる
    p7.x = goods.x; p7.y = goods.y;
    g7.tryPickup(true);
    record(g7.shop.unpaid === goods.shopPrice, "商品を拾うと未払いになる");
    // 支払い
    p7.credits = g7.shop.unpaid + 100;
    g7.payShop();
    record(g7.shop.unpaid === 0 && goods.shopPrice === 0, "店主に支払うと未払いが消える");
    // 泥棒: もう一度商品を拾って店外へ
    const goods2 = g7.floorItems.find(it => it.shopPrice > 0);
    if (goods2) {
      p7.x = goods2.x; p7.y = goods2.y;
      g7.tryPickup(true);
      const outside = g7.map.rooms.find(r => r !== g7.shop.room);
      p7.x = outside.cx; p7.y = outside.cy;
      const monstersBefore = g7.monsters.length;
      g7.endTurn();
      record(g7.shop.hostile, "未払いのまま店を出ると泥棒になる");
      record(g7.monsters.includes(g7.shop.keeper), "店主が戦闘形態で追ってくる");
      record(g7.monsters.length >= monstersBefore + 1, "執行ユニットが出現する");
    }
  }

  // --- コンテナ: 収納・取り出し・合成・割る ---
  const g8 = new Game(444);
  g8.state = "play";
  g8.monsters = [];
  const p8 = g8.player;
  const storage = new Item(g8.itemDef("storage_container"), g8.rng);
  const nano = new Item(g8.itemDef("repair_nano"), g8.rng);
  p8.inventory.push(storage, nano);
  g8.putIntoPot(storage, nano);
  record(storage.contents.length === 1 && !p8.inventory.includes(nano), "ストレージコンテナに収納できる");
  g8.takeFromPot(storage);
  record(storage.contents.length === 0 && p8.inventory.includes(nano), "ストレージコンテナから取り出せる");
  // 合成
  const synth = new Item(g8.itemDef("synth_container"), g8.rng);
  const sword1 = new Item(g8.itemDef("pulse_blade"), g8.rng);
  const sword2 = new Item(g8.itemDef("pulse_blade"), g8.rng);
  sword1.plus = 2; sword2.plus = 3;
  p8.inventory.push(synth, sword1, sword2);
  g8.putIntoPot(synth, sword1);
  g8.putIntoPot(synth, sword2);
  record(synth.contents.length === 1 && synth.contents[0].plus === 6, "同じ武器を合成すると強化値が合算+1される (got +" + synth.contents[0].plus + ")");
  record(g8.takeFromPot(synth) === false, "合成コンテナからは直接取り出せない");
  g8.breakPot(synth);
  record(!p8.inventory.includes(synth) && p8.inventory.includes(sword1), "割ると中身が手に入る");

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
