// ゲーム本体 — シレン式ターン制ローグライクのコアロジック
"use strict";

const DIRS8 = [
  { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
  { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
];

const MAX_INVENTORY = 20;
// 突風: シレン6のとぐろ島と同じ 1700/1800/1900 警告 → 2000 で強制失敗
const WIND_WARN_TURNS = [1700, 1800, 1900];
const WIND_BLOW_TURN = 2000;
// オーバーチャージ（ドスコイ状態）: 充電率150%以上で発動、120%未満で解除
const OVERCHARGE_ON = 150;
const OVERCHARGE_OFF = 120;

class Item {
  constructor(def, rng) {
    this.def = def;
    this.plus = 0; // 武器/防具の強化値
    this.charges = def.charges ? rng.int(def.charges[0], def.charges[1]) : 0;
    this.count = def.count ? rng.int(def.count[0], def.count[1]) : 1;
    this.amount = 0; // クレジット用
    this.x = -1;
    this.y = -1;
  }
}

class Monster {
  constructor(def, x, y, game) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.atk = def.atk;
    this.defense = def.def;
    this.exp = def.exp;
    this.speed = def.speed || 1;
    this.status = {}; // {sleep: n, stun: n, confuse: n, slow: n}
    this.asleep = game ? game.rng.chance(0.3) : false; // 初期配置の一部は休眠状態
    this.disguised = def.ability === "mimic"; // ミミックはアイテム擬態
    this.levelBoost = 0;
    this.fleeing = false;
    this.actGauge = 0;
  }
  get name() {
    return this.levelBoost > 0 ? `${this.def.name}+${this.levelBoost}` : this.def.name;
  }
}

class Game {
  constructor(seed) {
    this.rng = new RNG(seed);
    this.messages = [];
    this.onMessage = null; // UIフック
    this.state = "title"; // title | play | gameover | clear
    this.deathCause = "";
    this.initIdentification();
    this.resetRun();
  }

  // 周回ごとの未識別名の割り当て（カテゴリ内でシャッフル）
  initIdentification() {
    this.fakeNames = {};
    this.identified = new Set();
    for (const cat of ["herb", "chip", "gadget", "card"]) {
      const defs = ITEMS.filter((d) => d.cat === cat && !d.identified);
      const names = this.rng.shuffle(UNIDENTIFIED_NAMES[cat].slice());
      defs.forEach((d, i) => {
        this.fakeNames[d.id] = names[i % names.length];
      });
    }
  }

  resetRun() {
    this.floor = 1;
    this.turn = 0;
    this.windWarned = 0;
    this.player = {
      x: 0, y: 0,
      level: 1, exp: 0,
      hp: 15, maxHp: 15,
      strength: 8, maxStrength: 8,
      fullness: 100, maxFullness: 100,
      hungerTick: 0, overcharge: false,
      attackedThisTurn: false,
      credits: 0,
      weapon: null, shield: null,
      inventory: [],
      status: {}, // sleep / confuse / stun / slow
    };
    // 初期装備: エナジーパック1つ
    const food = new Item(this.itemDef("energy_pack"), this.rng);
    this.player.inventory.push(food);
    this.initIdentification();
    this.generateNewFloor();
  }

  itemDef(id) {
    return ITEMS.find((d) => d.id === id);
  }

  // ------------------------------------------------------------ フロア生成
  generateNewFloor() {
    this.map = generateFloor(this.rng);
    this.monsters = [];
    this.floorItems = [];
    this.traps = [];
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.memory = new Uint8Array(this.map.w * this.map.h);
    this.spawnTick = 0;

    const occupied = (x, y) =>
      (this.player.x === x && this.player.y === y) ||
      this.monsters.some((m) => m.x === x && m.y === y) ||
      this.floorItems.some((it) => it.x === x && it.y === y) ||
      this.map.get(x, y) === TILE.STAIRS;

    // プレイヤー配置
    const startRoom = this.rng.pick(this.map.rooms);
    const start = randomFloorInRoom(this.rng, this.map, startRoom, occupied) || { x: startRoom.cx, y: startRoom.cy };
    this.player.x = start.x;
    this.player.y = start.y;

    // モンスターハウス判定（12.5%、2F以降）
    let monsterHouseRoom = null;
    if (this.floor >= 2 && this.map.rooms.length >= 3 && this.rng.chance(0.125)) {
      const candidates = this.map.rooms.filter((r) => r !== startRoom);
      monsterHouseRoom = this.rng.pick(candidates);
    }
    this.monsterHouseRoom = monsterHouseRoom;
    this.monsterHouseTriggered = false;

    // 通常モンスター配置（4〜6体）
    const count = this.rng.int(4, 6);
    for (let i = 0; i < count; i++) this.spawnMonster(occupied, false);

    // モンスターハウスの中身
    if (monsterHouseRoom) {
      const n = Math.floor((monsterHouseRoom.w * monsterHouseRoom.h) / 4);
      for (let i = 0; i < n; i++) {
        const pos = randomFloorInRoom(this.rng, this.map, monsterHouseRoom, occupied);
        if (!pos) break;
        const def = this.pickMonsterDef();
        const m = new Monster(def, pos.x, pos.y, this);
        m.asleep = true;
        this.monsters.push(m);
      }
      // アイテムも多めに落ちている
      for (let i = 0; i < this.rng.int(3, 5); i++) {
        const pos = randomFloorInRoom(this.rng, this.map, monsterHouseRoom, occupied);
        if (pos) this.dropNewItem(pos.x, pos.y);
      }
    }

    // アイテム配置（4〜7個）
    const itemCount = this.rng.int(4, 7);
    for (let i = 0; i < itemCount; i++) {
      const pos = randomFloorTile(this.rng, this.map, occupied);
      if (pos) this.dropNewItem(pos.x, pos.y);
    }

    // 罠配置（4〜8個・隠れている）
    const trapCount = this.rng.int(4, 8);
    for (let i = 0; i < trapCount; i++) {
      const pos = randomFloorTile(this.rng, this.map, (x, y) =>
        occupied(x, y) || this.traps.some((t) => t.x === x && t.y === y));
      if (pos) {
        const def = this.rng.weighted(TRAPS);
        this.traps.push({ def, x: pos.x, y: pos.y, revealed: false });
      }
    }

    // 最深層: 神髄コアとボスを配置
    if (this.floor === FINAL_FLOOR) {
      const coreRoom = this.rng.pick(this.map.rooms.filter((r) => r !== startRoom)) || startRoom;
      const corePos = randomFloorInRoom(this.rng, this.map, coreRoom, occupied) || { x: coreRoom.cx, y: coreRoom.cy };
      const core = new Item(this.itemDef("shinzui_core"), this.rng);
      core.x = corePos.x;
      core.y = corePos.y;
      this.floorItems.push(core);
      const bossDef = MONSTERS.find((m) => m.boss);
      const bp = randomFloorInRoom(this.rng, this.map, coreRoom, occupied) || { x: coreRoom.cx, y: coreRoom.cy };
      const boss = new Monster(bossDef, bp.x, bp.y, this);
      boss.asleep = false;
      this.monsters.push(boss);
    }

    // デッ怪出現判定（7F以降で8%）
    if (this.floor >= 7 && this.floor < FINAL_FLOOR && this.rng.chance(0.08)) {
      const def = MONSTERS.find((m) => m.id === "dekkai");
      const pos = randomFloorTile(this.rng, this.map, occupied);
      if (pos) {
        const m = new Monster(def, pos.x, pos.y, this);
        m.asleep = true;
        this.monsters.push(m);
        this.log("……フロアのどこかから、巨大な駆動音が響いている。", "warn");
      }
    }

    computeVisibility(this);
  }

  pickMonsterDef() {
    const pool = MONSTERS.filter(
      (m) => !m.boss && !m.rare && this.floor >= m.floors[0] && this.floor <= m.floors[1]
    );
    return this.rng.pick(pool.length ? pool : MONSTERS.slice(0, 2));
  }

  spawnMonster(occupied, awake) {
    const pos = randomFloorTile(this.rng, this.map, occupied ||
      ((x, y) => this.monsters.some((m) => m.x === x && m.y === y) ||
        (this.player.x === x && this.player.y === y)));
    if (!pos) return null;
    const def = this.pickMonsterDef();
    const m = new Monster(def, pos.x, pos.y, this);
    if (awake) m.asleep = false;
    this.monsters.push(m);
    return m;
  }

  // 新規アイテムをフロアに落とす
  dropNewItem(x, y) {
    const pool = ITEMS.filter((d) => d.cat !== "goal" && d.w > 0);
    const def = this.rng.weighted(pool);
    const item = new Item(def, this.rng);
    if (def.cat === "money") {
      item.amount = this.rng.int(20, 80) * this.floor;
    }
    item.x = x;
    item.y = y;
    this.floorItems.push(item);
  }

  // ------------------------------------------------------------ 表示名
  displayName(item) {
    const d = item.def;
    if (d.cat === "money") return `${item.amount} クレジット`;
    let base;
    if (d.identified || this.identified.has(d.id)) {
      base = d.name;
      if (d.cat === "weapon" || d.cat === "shield") {
        if (item.plus !== 0) base += (item.plus > 0 ? `+${item.plus}` : `${item.plus}`);
      }
      if (d.cat === "gadget") base += ` [${item.charges}]`;
      if (d.cat === "card" && item.count > 1) base += ` x${item.count}`;
    } else {
      base = this.fakeNames[d.id] || "なぞのアイテム";
      if (d.cat === "card" && item.count > 1) base += ` x${item.count}`;
    }
    return base;
  }

  identify(item) {
    const d = item.def;
    if (!d.identified && !this.identified.has(d.id)) {
      this.identified.add(d.id);
      this.log(`${this.fakeNames[d.id]} の正体は ${d.name} だった！`, "sys");
      return true;
    }
    return false;
  }

  log(text, kind = "info") {
    this.messages.push({ text, kind });
    if (this.onMessage) this.onMessage(text, kind);
  }

  // ------------------------------------------------------------ プレイヤー行動
  // 戻り値: true = 1ターン消費
  playerMove(dx, dy) {
    const p = this.player;
    if (p.status.sleep > 0 || p.status.stun > 0) return this.passTurn();
    if (p.status.confuse > 0 && this.rng.chance(0.5)) {
      const d = this.rng.pick(DIRS8);
      dx = d.dx; dy = d.dy;
    }
    const nx = p.x + dx, ny = p.y + dy;

    // 攻撃対象がいるか
    const target = this.monsterAt(nx, ny);
    if (target) {
      this.playerAttack(target);
      return this.endTurn();
    }

    if (!this.map.isWalkable(nx, ny)) return false;
    // 斜め移動は角を通れない（シレン式）
    if (dx !== 0 && dy !== 0) {
      if (!this.map.isWalkable(p.x + dx, p.y) || !this.map.isWalkable(p.x, p.y + dy)) return false;
    }

    p.x = nx;
    p.y = ny;
    computeVisibility(this);

    // アイテム自動拾得
    this.tryPickup(true);

    // 罠チェック（75%で発動・オーバーチャージ中は無効化して破壊）
    const trap = this.traps.find((t) => t.x === nx && t.y === ny);
    if (trap) {
      trap.revealed = true;
      if (p.overcharge) {
        this.traps = this.traps.filter((t) => t !== trap);
        this.log(`${trap.def.name} を踏み潰した！（オーバーチャージ）`, "good");
      } else if (this.rng.chance(0.75)) this.triggerTrap(trap);
      else this.log(`${trap.def.name} だ！ うまく回避した。`, "warn");
    }

    // モンスターハウス発動
    if (this.monsterHouseRoom && !this.monsterHouseTriggered &&
        this.monsterHouseRoom.contains(p.x, p.y)) {
      this.monsterHouseTriggered = true;
      this.log("モンスターハウスだ！！", "bad");
      for (const m of this.monsters) {
        if (this.monsterHouseRoom.containsWithBorder(m.x, m.y)) m.asleep = false;
      }
    }

    if (this.map.get(p.x, p.y) === TILE.STAIRS) {
      this.log("降下シャフトがある。[>] キーで次の階層へ。", "sys");
    }

    return this.endTurn();
  }

  passTurn() {
    return this.endTurn();
  }

  tryPickup(auto) {
    const p = this.player;
    const idx = this.floorItems.findIndex((it) => it.x === p.x && it.y === p.y);
    if (idx < 0) {
      if (!auto) this.log("ここには何も落ちていない。");
      return;
    }
    const item = this.floorItems[idx];
    if (item.def.cat === "money") {
      p.credits += item.amount;
      this.floorItems.splice(idx, 1);
      this.log(`${item.amount} クレジットを回収した。`, "good");
      return;
    }
    if (item.def.cat === "goal") {
      this.floorItems.splice(idx, 1);
      this.state = "clear";
      this.log("神髄コアを手に入れた！！", "good");
      return;
    }
    if (p.inventory.length >= MAX_INVENTORY) {
      this.log(`${this.displayName(item)} の上に乗った。（持ち物がいっぱいだ）`, "warn");
      return;
    }
    this.floorItems.splice(idx, 1);
    p.inventory.push(item);
    this.log(`${this.displayName(item)} を拾った。`, "good");
  }

  // ------------------------------------------------------------ 戦闘
  // シレン6式: 攻撃力 = ちから + レベル由来 + 武器強度×(0.75 + ちから/32)
  playerAtkValue() {
    const p = this.player;
    let atk = p.strength + Math.floor(p.level * 1.5);
    if (p.weapon) {
      atk += Math.round((p.weapon.def.power + p.weapon.plus) * (0.75 + p.strength / 32));
    }
    if (this.resonanceActive()) atk += RESONANCE.pulse.atk;
    return atk;
  }

  playerDefValue() {
    const p = this.player;
    let def = 0;
    if (p.shield) def += p.shield.def.power + p.shield.plus;
    if (this.resonanceActive()) def += RESONANCE.pulse.def;
    return def;
  }

  resonanceActive() {
    const p = this.player;
    return p.weapon && p.shield &&
      p.weapon.def.resonance === "pulse" && p.shield.def.resonance === "pulse";
  }

  // シレン6式ダメージ: 攻撃力×乱数(0.875〜1.125) − 防御力/2 + 1
  calcDamage(atk, def) {
    const dmg = Math.round(atk * (0.875 + this.rng.next() * 0.25) - def / 2 + 1);
    return Math.max(1, dmg);
  }

  playerAttack(target) {
    this.player.attackedThisTurn = true; // 攻撃したターンは自然回復しない
    // 命中率92%
    if (!this.rng.chance(0.92)) {
      this.log(`攻撃は ${target.name} に当たらなかった。`, "warn");
      return;
    }
    target.asleep = false;
    target.disguised = false;
    target.status.stun = 0; // かなしばりは攻撃を受けると解除
    let dmg = this.calcDamage(this.playerAtkValue(), target.defense);
    if (this.player.overcharge) dmg = Math.round(dmg * 1.5); // オーバーチャージ補正
    target.hp -= dmg;
    this.log(`${target.name} に ${dmg} のダメージ！`);
    if (target.hp <= 0) this.killMonster(target, true);
  }

  killMonster(m, byPlayer) {
    this.monsters = this.monsters.filter((x) => x !== m);
    this.log(`${m.name} を破壊した！`, "good");
    if (byPlayer) this.gainExp(m.exp);
    // ボス撃破メッセージ
    if (m.def.boss) {
      this.log("トグロ・アバターが機能停止した。コアは目の前だ！", "sys");
    }
  }

  gainExp(exp) {
    const p = this.player;
    p.exp += exp;
    this.log(`${exp} の経験値を得た。`);
    while (p.exp >= expForLevel(p.level + 1)) {
      p.level++;
      const gain = this.rng.int(3, 6); // シレン6: レベルアップで最大HP+3〜6
      p.maxHp += gain;
      p.hp = Math.min(p.maxHp, p.hp + gain);
      this.log(`レベル ${p.level} に上がった！ 最大HP+${gain}`, "good");
    }
  }

  damagePlayer(dmg, cause) {
    const p = this.player;
    p.hp -= dmg;
    if (p.hp <= 0) {
      // バックアップチップで復活
      const backupIdx = p.inventory.findIndex((it) => it.def.id === "backup_chip");
      if (backupIdx >= 0) {
        p.inventory.splice(backupIdx, 1);
        p.hp = p.maxHp;
        p.fullness = p.maxFullness;
        this.log("バックアップチップが起動！ 完全な状態で復元された！", "sys");
        return;
      }
      p.hp = 0;
      this.deathCause = cause;
      this.state = "gameover";
      this.log(`${cause}に倒れた……`, "bad");
    }
  }

  // ------------------------------------------------------------ 罠
  triggerTrap(trap) {
    const p = this.player;
    const t = trap.def;
    this.log(`${t.name} を踏んでしまった！`, "bad");
    switch (t.effect) {
      case "damage":
        this.damagePlayer(Math.max(1, Math.floor(p.hp / 2)), "対人マイン");
        this.log("爆発に巻き込まれた！", "bad");
        break;
      case "dart": {
        const dmg = this.rng.int(5, t.power);
        this.log(`ダーツが飛んできた！ ${dmg} ダメージ。`, "bad");
        this.damagePlayer(dmg, "オートタレット");
        break;
      }
      case "slow":
        p.status.slow = 15;
        this.log("体が重い……鈍足になった。", "bad");
        break;
      case "warp": {
        const pos = randomFloorTile(this.rng, this.map);
        if (pos) {
          p.x = pos.x;
          p.y = pos.y;
          computeVisibility(this);
          this.log("強制転送された！", "warn");
        }
        break;
      }
      case "sleep":
        p.status.sleep = 6; // シレン6の睡眠罠と同じ6ターン
        this.log("ガスを吸って眠ってしまった！", "bad");
        break;
      case "pitfall":
        this.log("床が崩落した！ 下の階層へ落下する……", "warn");
        this.damagePlayer(Math.max(1, Math.floor(p.maxHp / 10)), "落下");
        if (this.state !== "gameover") this.descend(true);
        break;
      case "rust": {
        const eq = this.rng.chance(0.5) ? p.weapon : p.shield;
        if (eq) {
          eq.plus--;
          this.log(`${eq.def.name} が腐食した……`, "bad");
        } else {
          this.log("腐食ガスが噴き出したが、装備がないので無傷だった。");
        }
        break;
      }
      case "drain":
        p.fullness = Math.max(0, p.fullness - 10);
        this.log("バッテリーが放電した！ 充電率-10%", "bad");
        break;
    }
  }

  // ------------------------------------------------------------ 階段
  descend(forced) {
    if (!forced && this.map.get(this.player.x, this.player.y) !== TILE.STAIRS) {
      this.log("ここに降下シャフトはない。");
      return false;
    }
    this.floor++;
    this.turn = 0;
    this.windWarned = 0;
    this.log(`地下 ${this.floor} 階に降りた。`, "sys");
    this.generateNewFloor();
    return true;
  }

  // ------------------------------------------------------------ アイテム使用
  useItem(item) {
    const p = this.player;
    const d = item.def;
    switch (d.cat) {
      case "food":
        return this.eatFood(item);
      case "herb":
        return this.drinkHerb(item);
      case "chip":
        return this.useChip(item);
      case "weapon":
      case "shield":
        return this.equip(item);
      default:
        this.log("それは直接使えない。投げるか装備しよう。");
        return false;
    }
  }

  removeFromInventory(item) {
    const i = this.player.inventory.indexOf(item);
    if (i >= 0) this.player.inventory.splice(i, 1);
  }

  // 満タン時に食べると最大充電率が上がる（シレン6: おにぎり+3 / 大きい+4、上限200）
  eatFood(item) {
    const p = this.player;
    const d = item.def;
    if (p.fullness >= p.maxFullness) {
      const gain = d.id === "big_energy_pack" ? 4 : 3;
      p.maxFullness = Math.min(200, p.maxFullness + gain);
      p.fullness = p.maxFullness;
      this.log(`満充電を超えた！ 最大充電率が${gain}%上がった。（現在 ${p.maxFullness}%）`, "good");
    } else {
      p.fullness = Math.min(p.maxFullness, p.fullness + d.fullness);
      this.log(`エネルギーを補給した。充電率 ${p.fullness}%`, "good");
    }
    this.removeFromInventory(item);
    return this.endTurn();
  }

  drinkHerb(item) {
    const p = this.player;
    const d = item.def;
    this.identify(item);
    switch (d.id) {
      case "repair_nano":
        if (p.hp >= p.maxHp) { p.maxHp += 1; p.hp = p.maxHp; this.log("最大HPが1上がった。", "good"); }
        else { p.hp = Math.min(p.maxHp, p.hp + 25); this.log("HPが回復した。", "good"); }
        break;
      case "full_repair_nano":
        if (p.hp >= p.maxHp) { p.maxHp += 2; p.hp = p.maxHp; this.log("最大HPが2上がった。", "good"); }
        else { p.hp = Math.min(p.maxHp, p.hp + 100); this.log("HPが大きく回復した。", "good"); }
        break;
      case "muscle_booster":
        p.maxStrength += 1;
        p.strength = p.maxStrength;
        this.log(`ちからが ${p.strength} に上がった！`, "good");
        break;
      case "exp_chip_serum":
        this.gainExp(expForLevel(p.level + 1) - p.exp);
        break;
      case "backup_chip":
        this.log("飲んでも意味がなさそうだ。持っているだけで効果がある。");
        return false;
      case "toxin_vial":
        p.strength = Math.max(1, p.strength - 1);
        this.log("毒だ！ ちからが下がった……", "bad");
        break;
      case "confusion_gas":
        p.status.confuse = 10;
        this.log("視界が歪む……混乱した！", "bad");
        break;
      case "sleep_inducer":
        p.status.sleep = 5;
        this.log("急激な眠気が……！", "bad");
        break;
    }
    this.removeFromInventory(item);
    // 薬剤はわずかに充電も回復（シレン6の草と同じく2%）
    p.fullness = Math.min(p.maxFullness, p.fullness + 2);
    return this.endTurn();
  }

  useChip(item) {
    const p = this.player;
    const d = item.def;
    switch (d.id) {
      case "scan_chip": {
        this.identify(item);
        // 未識別の持ち物を1つ識別（UIから選択させる代わりに先頭の未識別品）
        const target = p.inventory.find(
          (it) => it !== item && !it.def.identified && !this.identified.has(it.def.id)
        );
        if (target) {
          this.identified.add(target.def.id);
          this.log(`スキャン完了: ${this.fakeNames[target.def.id]} は ${target.def.name} だ！`, "sys");
        } else {
          this.log("解析できる未識別アイテムを持っていない。");
          return false;
        }
        break;
      }
      case "map_chip":
        this.identify(item);
        this.memory.fill(1);
        this.log("フロアの構造データをダウンロードした！", "sys");
        break;
      case "weapon_up_chip":
        this.identify(item);
        if (!p.weapon) { this.log("武器を装備していない。"); return false; }
        p.weapon.plus++;
        this.log(`${p.weapon.def.name} が強化された！`, "good");
        break;
      case "shield_up_chip":
        this.identify(item);
        if (!p.shield) { this.log("防具を装備していない。"); return false; }
        p.shield.plus++;
        this.log(`${p.shield.def.name} が強化された！`, "good");
        break;
      case "emp_chip": {
        this.identify(item);
        const room = this.map.roomAt(p.x, p.y);
        let hit = 0;
        for (const m of this.monsters.slice()) {
          const inRange = room
            ? room.containsWithBorder(m.x, m.y)
            : Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1;
          if (inRange) {
            m.hp -= 25;
            m.asleep = false;
            m.disguised = false;
            hit++;
            if (m.hp <= 0) this.killMonster(m, true);
          }
        }
        this.log(`EMPバースト！ ${hit} 体の敵に25ダメージ。`, "sys");
        break;
      }
      case "escape_chip":
        this.identify(item);
        p.x = this.map.stairs.x;
        p.y = this.map.stairs.y;
        computeVisibility(this);
        this.log("緊急離脱！ 降下シャフトの位置まで転送された。", "sys");
        break;
    }
    this.removeFromInventory(item);
    return this.endTurn();
  }

  equip(item) {
    const p = this.player;
    const slot = item.def.cat === "weapon" ? "weapon" : "shield";
    if (p[slot] === item) {
      p[slot] = null;
      this.log(`${this.displayName(item)} を外した。`);
    } else {
      p[slot] = item;
      this.log(`${this.displayName(item)} を装備した。`, "good");
      if (this.resonanceActive()) {
        this.log(`【共鳴】${RESONANCE.pulse.desc}`, "sys");
      }
    }
    return this.endTurn();
  }

  dropItem(item) {
    const p = this.player;
    if (this.floorItems.some((it) => it.x === p.x && it.y === p.y)) {
      this.log("足元には既にアイテムがある。");
      return false;
    }
    if (p.weapon === item) p.weapon = null;
    if (p.shield === item) p.shield = null;
    this.removeFromInventory(item);
    item.x = p.x;
    item.y = p.y;
    this.floorItems.push(item);
    this.log(`${this.displayName(item)} を置いた。`);
    return this.endTurn();
  }

  // ------------------------------------------------------------ 投げる/ガジェット（直線）
  // 直線上の最初のモンスターを返す
  firstMonsterInLine(dx, dy, maxRange = 10) {
    let x = this.player.x, y = this.player.y;
    for (let i = 0; i < maxRange; i++) {
      x += dx;
      y += dy;
      if (!this.map.isWalkable(x, y)) return { monster: null, x: x - dx, y: y - dy };
      const m = this.monsterAt(x, y);
      if (m) return { monster: m, x, y };
    }
    return { monster: null, x, y };
  }

  throwItem(item, dx, dy) {
    const p = this.player;
    const { monster, x, y } = this.firstMonsterInLine(dx, dy);
    // 持ち物から減らす（カードは1枚ずつ）
    if (item.def.cat === "card" && item.count > 1) {
      item.count--;
    } else {
      if (p.weapon === item) p.weapon = null;
      if (p.shield === item) p.shield = null;
      this.removeFromInventory(item);
    }

    if (!monster) {
      this.log(`${this.displayName(item)} を投げたが何にも当たらなかった。`);
      // カード以外は落ちる
      if (item.def.cat !== "card") {
        if (!this.floorItems.some((it) => it.x === x && it.y === y)) {
          item.x = x; item.y = y;
          this.floorItems.push(item);
        }
      }
      return this.endTurn();
    }

    monster.asleep = false;
    monster.disguised = false;
    const d = item.def;

    if (d.cat === "card") {
      this.identify(item);
      switch (d.id) {
        case "confuse_card":
          monster.status.confuse = 15;
          this.log(`${monster.name} は混乱した！`, "good");
          break;
        case "sleep_card":
          monster.status.sleep = 10;
          this.log(`${monster.name} は眠った！`, "good");
          break;
        case "zap_card":
          monster.hp -= 20;
          this.log(`${monster.name} に電撃が走った！ 20ダメージ。`, "good");
          if (monster.hp <= 0) this.killMonster(monster, true);
          break;
      }
    } else if (d.cat === "herb") {
      this.identify(item);
      switch (d.id) {
        case "toxin_vial":
          monster.atk = Math.max(1, monster.atk - 3);
          this.log(`${monster.name} は弱体化した！`, "good");
          break;
        case "confusion_gas":
          monster.status.confuse = 15;
          this.log(`${monster.name} は混乱した！`, "good");
          break;
        case "sleep_inducer":
          monster.status.sleep = 10;
          this.log(`${monster.name} は眠った！`, "good");
          break;
        default: {
          const dmg = this.rng.int(1, 4);
          monster.hp -= dmg;
          this.log(`${monster.name} に ${dmg} ダメージ。`);
          if (monster.hp <= 0) this.killMonster(monster, true);
        }
      }
    } else {
      // 物理投擲: 武器なら威力分、その他は1〜2
      const dmg = (d.cat === "weapon" || d.cat === "shield")
        ? this.calcDamage(d.power + item.plus + 4, monster.defense)
        : this.rng.int(1, 2);
      monster.hp -= dmg;
      this.log(`${this.displayName(item)} が ${monster.name} に命中！ ${dmg} ダメージ。`);
      if (monster.hp <= 0) this.killMonster(monster, true);
    }
    return this.endTurn();
  }

  useGadget(item, dx, dy) {
    const d = item.def;
    if (item.charges <= 0) {
      this.log("ガジェットのエネルギーが切れている。");
      return false;
    }
    item.charges--;
    this.identify(item);
    const { monster } = this.firstMonsterInLine(dx, dy);
    if (!monster) {
      this.log("光線は何にも当たらず消えた。");
      return this.endTurn();
    }
    monster.asleep = false;
    monster.disguised = false;
    switch (d.id) {
      case "stun_gadget":
        monster.status.stun = 999; // かなしばり: 攻撃を受けるまで解除されない
        this.log(`${monster.name} は行動不能になった！`, "good");
        break;
      case "swap_gadget": {
        const px = this.player.x, py = this.player.y;
        this.player.x = monster.x; this.player.y = monster.y;
        monster.x = px; monster.y = py;
        computeVisibility(this);
        this.log(`${monster.name} と位置が入れ替わった！`, "sys");
        break;
      }
      case "blast_gadget": {
        // 後方へ最大5マス吹き飛ばす
        let bx = monster.x, by = monster.y;
        for (let i = 0; i < 5; i++) {
          const nx = bx + dx, ny = by + dy;
          if (!this.map.isWalkable(nx, ny) || this.monsterAt(nx, ny)) break;
          bx = nx; by = ny;
        }
        monster.x = bx; monster.y = by;
        monster.hp -= 5;
        this.log(`${monster.name} を吹き飛ばした！ 5ダメージ。`, "good");
        if (monster.hp <= 0) this.killMonster(monster, true);
        break;
      }
      case "slow_gadget":
        monster.status.slow = 20;
        this.log(`${monster.name} は鈍足になった！`, "good");
        break;
    }
    return this.endTurn();
  }

  monsterAt(x, y) {
    return this.monsters.find((m) => m.x === x && m.y === y && !m.disguised) || null;
  }

  // ------------------------------------------------------------ ターン経過
  endTurn() {
    if (this.state !== "play") return true;
    this.turn++;
    const p = this.player;

    // 状態異常カウント
    for (const key of ["sleep", "confuse", "stun", "slow"]) {
      if (p.status[key] > 0) {
        p.status[key]--;
        if (p.status[key] === 0) {
          const names = { sleep: "目が覚めた。", confuse: "混乱が解けた。", stun: "動けるようになった。", slow: "体が軽くなった。" };
          this.log(names[key], "sys");
        }
      }
    }

    // 充電率（満腹度）: 10ターンで1%消費（オーバーチャージ中は5ターンで1%）
    p.hungerTick++;
    if (p.hungerTick >= (p.overcharge ? 5 : 10)) {
      p.hungerTick = 0;
      if (p.fullness > 0) {
        p.fullness--;
        if (p.fullness === 20) this.log("充電率が低下している……補給が必要だ。", "warn");
        if (p.fullness === 0) this.log("バッテリー切れ！ このままではHPが削られていく！", "bad");
      }
    }

    // オーバーチャージ状態の更新（150%以上で発動、120%未満で解除）
    if (!p.overcharge && p.fullness >= OVERCHARGE_ON) {
      p.overcharge = true;
      this.log("オーバーチャージ状態！ 攻撃力1.5倍・罠無効！", "sys");
    } else if (p.overcharge && p.fullness < OVERCHARGE_OFF) {
      p.overcharge = false;
      this.log("オーバーチャージが解除された。", "sys");
    }

    if (p.fullness <= 0) {
      this.damagePlayer(1, "バッテリー切れ");
      if (this.state !== "play") return true;
    } else if (!p.attackedThisTurn) {
      // 自然回復（攻撃したターンは回復しない）: Lv1-9:+1 / Lv10-19:+2 / Lv20+:+3 を2ターンに1回
      if (this.turn % 2 === 0) {
        const regen = p.level >= 20 ? 3 : p.level >= 10 ? 2 : 1;
        p.hp = Math.min(p.maxHp, p.hp + regen);
      }
    }
    p.attackedThisTurn = false;

    // モンスター行動
    this.processMonsters();
    if (this.state !== "play") return true;

    // 新規モンスター湧き（約40ターンごと）
    this.spawnTick++;
    if (this.spawnTick >= 40) {
      this.spawnTick = 0;
      const m = this.spawnMonster(null, true);
      if (m) m.asleep = false;
    }

    // 突風（フロア滞在制限）
    if (this.windWarned < WIND_WARN_TURNS.length && this.turn >= WIND_WARN_TURNS[this.windWarned]) {
      this.windWarned++;
      const msgs = [
        "どこからか異常な風が吹いている……（早く先へ進もう）",
        "換気システムが暴走を始めた！ 風が強くなっていく……",
        "立っていられないほどの暴風だ！ 今すぐ階段へ！！",
      ];
      this.log(msgs[this.windWarned - 1], "warn");
    }
    if (this.turn >= WIND_BLOW_TURN) {
      this.deathCause = "暴風に吹き飛ばされて";
      this.state = "gameover";
      this.log("暴風に吹き飛ばされ、塔の外へ放り出された……", "bad");
    }

    computeVisibility(this);
    return true;
  }

  // ------------------------------------------------------------ モンスターAI
  processMonsters() {
    for (const m of this.monsters.slice()) {
      if (this.state !== "play") return;
      if (m.hp <= 0) continue;
      // 速度処理: speed2は2回、slowは1回おき
      let acts = m.speed;
      if (m.status.slow > 0) {
        m.actGauge = (m.actGauge + 1) % 2;
        acts = m.actGauge === 0 ? 1 : 0;
      }
      for (let i = 0; i < acts; i++) {
        if (this.state !== "play") return;
        if (m.hp <= 0) break;
        this.monsterAct(m);
      }
      // 状態異常カウント
      for (const key of ["sleep", "confuse", "stun", "slow"]) {
        if (m.status[key] > 0) m.status[key]--;
      }
    }
  }

  monsterAct(m) {
    const p = this.player;
    if (m.status.sleep > 0 || m.status.stun > 0) return;
    if (m.disguised) {
      // 擬態中: プレイヤーが隣に来たら正体を現す
      if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) {
        m.disguised = false;
        m.asleep = false;
        this.log(`アイテムだと思ったら ${m.def.name} だった！`, "bad");
      }
      return;
    }
    if (m.asleep) {
      // 同じ部屋にプレイヤーが入ったら起きることがある
      const room = this.map.roomAt(m.x, m.y);
      if (room && room.contains(p.x, p.y) && this.rng.chance(0.5)) m.asleep = false;
      else return;
    }

    const distX = p.x - m.x, distY = p.y - m.y;
    const adjacent = Math.abs(distX) <= 1 && Math.abs(distY) <= 1;

    // 混乱: ランダム移動か空振り
    if (m.status.confuse > 0) {
      const d = this.rng.pick(DIRS8);
      this.tryMonsterMove(m, d.dx, d.dy);
      return;
    }

    // スティールBot: 盗み&逃走
    if (m.def.ability === "steal" && !m.fleeing) {
      if (adjacent && p.credits > 0) {
        const amount = Math.min(p.credits, this.rng.int(50, 200) * this.floor);
        p.credits -= amount;
        m.fleeing = true;
        m.stolen = amount;
        this.log(`${m.name} に ${amount} クレジットを盗まれた！`, "bad");
        return;
      }
    }
    if (m.fleeing) {
      // プレイヤーから離れる方向へ
      const dx = Math.sign(m.x - p.x), dy = Math.sign(m.y - p.y);
      if (!this.tryMonsterMove(m, dx, dy)) {
        const d = this.rng.pick(DIRS8);
        this.tryMonsterMove(m, d.dx, d.dy);
      }
      return;
    }

    // デバウラー: 隣接モンスターを取り込んで強化
    if (m.def.ability === "levelup") {
      const prey = this.monsters.find(
        (o) => o !== m && !o.def.boss && Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1
      );
      if (prey && this.rng.chance(0.3)) {
        this.monsters = this.monsters.filter((x) => x !== prey);
        m.levelBoost++;
        m.maxHp += 8;
        m.hp = m.maxHp;
        m.atk += 3;
        m.exp += prey.exp;
        if (this.visible[m.y * this.map.w + m.x]) {
          this.log(`${m.def.name} が ${prey.def.name} を取り込んで強化された！`, "warn");
        }
        return;
      }
    }

    // スナイパードローン: 直線上ならレーザー
    if (m.def.ability === "ranged" && !adjacent) {
      if ((m.x === p.x || m.y === p.y || Math.abs(distX) === Math.abs(distY)) && this.lineOfSight(m, p)) {
        const dmg = this.calcDamage(m.atk, this.playerDefValue());
        this.log(`${m.name} のレーザー！ ${dmg} ダメージ。`, "bad");
        this.damagePlayer(dmg, m.def.name);
        return;
      }
    }

    if (adjacent) {
      this.monsterAttack(m);
      return;
    }

    // 追跡: プレイヤーが見える/同じ部屋なら近付く
    const mRoom = this.map.roomAt(m.x, m.y);
    const sameRoom = mRoom && mRoom.contains(p.x, p.y);
    const near = Math.abs(distX) + Math.abs(distY) <= 12;
    if (sameRoom || near) {
      const dx = Math.sign(distX), dy = Math.sign(distY);
      if (!this.tryMonsterMove(m, dx, dy)) {
        // 直進できなければ軸ごとに試す
        if (dx !== 0 && this.tryMonsterMove(m, dx, 0)) return;
        if (dy !== 0 && this.tryMonsterMove(m, 0, dy)) return;
      }
    } else if (this.rng.chance(0.5)) {
      const d = this.rng.pick(DIRS8);
      this.tryMonsterMove(m, d.dx, d.dy);
    }
  }

  lineOfSight(a, b) {
    // 同部屋または近距離の直線のみ簡易判定
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    let x = a.x, y = a.y;
    for (let i = 0; i < 12; i++) {
      x += dx; y += dy;
      if (x === b.x && y === b.y) return true;
      if (!this.map.isWalkable(x, y)) return false;
    }
    return false;
  }

  tryMonsterMove(m, dx, dy) {
    if (dx === 0 && dy === 0) return false;
    const nx = m.x + dx, ny = m.y + dy;
    if (!this.map.isWalkable(nx, ny)) return false;
    if (dx !== 0 && dy !== 0) {
      if (!this.map.isWalkable(m.x + dx, m.y) || !this.map.isWalkable(m.x, m.y + dy)) return false;
    }
    if (this.monsterAt(nx, ny)) return false;
    if (this.player.x === nx && this.player.y === ny) return false;
    m.x = nx;
    m.y = ny;
    return true;
  }

  monsterAttack(m) {
    const p = this.player;
    if (!this.rng.chance(0.85)) {
      this.log(`${m.name} の攻撃をかわした。`);
      return;
    }
    const dmg = this.calcDamage(m.atk, this.playerDefValue());
    this.log(`${m.name} の攻撃！ ${dmg} ダメージ。`, "bad");
    this.damagePlayer(dmg, m.def.name);
    if (this.state !== "play") return;

    // 特殊能力
    if (m.def.ability === "corrode" && this.rng.chance(0.25)) {
      const eq = this.rng.chance(0.5) ? p.weapon : p.shield;
      if (eq) {
        eq.plus--;
        this.log(`${eq.def.name} が腐食した……`, "bad");
      }
    }
    if (m.def.ability === "confuse" && this.rng.chance(0.25)) {
      p.status.confuse = 7;
      this.log("神経系をハックされた！ 混乱した！", "bad");
    }
  }
}
