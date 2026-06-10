// ゲームデータ定義 — 近未来テーマ（電脳塔）
// シレン6のアイテム/モンスター体系を近未来に置き換えたもの:
//   おにぎり→エナジーパック, 草→ナノ薬剤, 巻物→データチップ,
//   杖→ガジェット, 札→ハッキングカード, 壺→コンテナ, ギタン→クレジット
"use strict";

const FINAL_FLOOR = 20; // 神髄コアのあるフロア

// ---------------------------------------------------------------- モンスター
// floors: [min, max] 出現フロア帯
const MONSTERS = [
  {
    id: "scout_drone", name: "スカウトドローン", glyph: "d", color: "#9fb4cc",
    hp: 5, atk: 3, def: 1, exp: 2, speed: 1, floors: [1, 3],
    desc: "最弱の偵察ドローン。",
  },
  {
    id: "patrol_bot", name: "パトロールボット", glyph: "p", color: "#7fd4ff",
    hp: 9, atk: 5, def: 2, exp: 5, speed: 1, floors: [1, 5],
    desc: "巡回中の警備ロボ。",
  },
  {
    id: "mimic_bot", name: "ミミックBot", glyph: "?", color: "#ffd866",
    hp: 12, atk: 7, def: 3, exp: 10, speed: 1, floors: [2, 8],
    ability: "mimic",
    desc: "アイテムに擬態して獲物を待つ。拾おうとした瞬間に襲いかかる。",
  },
  {
    id: "acid_slime", name: "酸性スライム", glyph: "s", color: "#9dff5c",
    hp: 14, atk: 6, def: 4, exp: 12, speed: 1, floors: [3, 9],
    ability: "corrode",
    desc: "攻撃時、稀に武器か防具を腐食させて弱体化させる。",
  },
  {
    id: "sniper_drone", name: "スナイパードローン", glyph: "n", color: "#ff9d5c",
    hp: 13, atk: 5, def: 3, exp: 14, speed: 1, floors: [4, 11],
    ability: "ranged",
    desc: "直線上の遠距離からレーザーを撃つ。",
  },
  {
    id: "steal_bot", name: "スティールBot", glyph: "t", color: "#e08aff",
    hp: 16, atk: 4, def: 5, exp: 18, speed: 2, floors: [5, 12],
    ability: "steal",
    desc: "倍速で接近しクレジットを盗んで逃走する。",
  },
  {
    id: "hacker_wisp", name: "ハッカーウィスプ", glyph: "h", color: "#5cd9ff",
    hp: 18, atk: 8, def: 4, exp: 22, speed: 1, floors: [6, 13],
    ability: "confuse",
    desc: "攻撃時、稀に神経系をハックして混乱させる。",
  },
  {
    id: "assault_mech", name: "アサルトメック", glyph: "A", color: "#ff5c5c",
    hp: 26, atk: 11, def: 6, exp: 35, speed: 1, floors: [8, 15],
    desc: "重装甲の戦闘メカ。高い攻撃力を持つ。",
  },
  {
    id: "devour_unit", name: "デバウラー", glyph: "D", color: "#c4ff5c",
    hp: 22, atk: 9, def: 5, exp: 30, speed: 1, floors: [9, 16],
    ability: "levelup",
    desc: "他の機体を取り込んで進化する。放置は危険。",
  },
  {
    id: "phase_stalker", name: "フェイズストーカー", glyph: "F", color: "#b48aff",
    hp: 28, atk: 12, def: 7, exp: 45, speed: 2, floors: [12, 18],
    desc: "倍速で行動する暗殺ユニット。",
  },
  {
    id: "guardian_mech", name: "ガーディアンメック", glyph: "G", color: "#ffae42",
    hp: 40, atk: 15, def: 10, exp: 70, speed: 1, floors: [14, 20],
    desc: "深層を守る大型警備機。",
  },
  {
    id: "dekkai", name: "デッ怪ギガメック", glyph: "Ω", color: "#ff2d78",
    hp: 90, atk: 24, def: 14, exp: 300, speed: 1, floors: [7, 20], big: true,
    rare: true,
    desc: "規格外の超大型機体。倒せば莫大な経験値を得られるが、近付くのは命懸け。",
  },
  {
    id: "togro_avatar", name: "トグロ・アバター", glyph: "Ψ", color: "#ff0044",
    hp: 80, atk: 20, def: 12, exp: 500, speed: 1, floors: [20, 20], boss: true,
    desc: "AI《トグロ》の戦闘端末。神髄コアを守護する。",
  },
];

// ---------------------------------------------------------------- アイテム
// 未識別カテゴリ用のダミー名
const UNIDENTIFIED_NAMES = {
  herb: ["赤いアンプル", "青いアンプル", "緑のアンプル", "黒いアンプル", "白いアンプル", "紫のアンプル", "黄のアンプル", "銀のアンプル"],
  chip: ["暗号化チップA", "暗号化チップB", "暗号化チップC", "暗号化チップD", "暗号化チップE", "暗号化チップF", "暗号化チップG"],
  gadget: ["謎のガジェットα", "謎のガジェットβ", "謎のガジェットγ", "謎のガジェットδ", "謎のガジェットε"],
  card: ["無記名カードI", "無記名カードII", "無記名カードIII"],
};

const ITEMS = [
  // ===== 食料（エナジーパック）: 充電率を回復 =====
  {
    id: "energy_pack", name: "エナジーパック", cat: "food", glyph: "*", color: "#ffd866",
    w: 22, fullness: 50, identified: true, price: 100,
    desc: "携帯型バッテリー。充電率を50%回復する。",
  },
  {
    id: "big_energy_pack", name: "大容量エナジーパック", cat: "food", glyph: "*", color: "#ffae42",
    w: 8, fullness: 100, identified: true, price: 200,
    desc: "高密度バッテリー。充電率を100%回復し、最大値も少し増える。",
  },

  // ===== ナノ薬剤（草）: 飲む =====
  {
    id: "repair_nano", name: "リペアナノ", cat: "herb", glyph: "!", color: "#4dff88",
    w: 22, price: 80,
    desc: "ナノマシンがHPを25回復する。満タン時は最大HP+1。",
  },
  {
    id: "full_repair_nano", name: "フルリペアナノ", cat: "herb", glyph: "!", color: "#00e5a0",
    w: 9, price: 300,
    desc: "HPを100回復する。満タン時は最大HP+2。",
  },
  {
    id: "muscle_booster", name: "マッスルブースター", cat: "herb", glyph: "!", color: "#ff8a5c",
    w: 7, price: 350,
    desc: "ちからの最大値が1上がる。",
  },
  {
    id: "exp_chip_serum", name: "経験促進剤", cat: "herb", glyph: "!", color: "#e0c4ff",
    w: 4, price: 800,
    desc: "レベルが1上がる。",
  },
  {
    id: "backup_chip", name: "バックアップチップ", cat: "herb", glyph: "!", color: "#fff2a8",
    w: 3, price: 1500,
    desc: "持っているだけで力尽きた時に一度だけ完全復活する。",
  },
  {
    id: "toxin_vial", name: "劣化ウイルス", cat: "herb", glyph: "!", color: "#9dff5c",
    w: 12, bad: true, price: 50,
    desc: "ちからが1下がる毒物。敵に投げつければ弱体化できる。",
  },
  {
    id: "confusion_gas", name: "混乱ガス", cat: "herb", glyph: "!", color: "#ff5c8a",
    w: 10, bad: true, price: 50,
    desc: "飲むと10ターン混乱する。投げれば敵を混乱させられる。",
  },
  {
    id: "sleep_inducer", name: "強制スリープ剤", cat: "herb", glyph: "!", color: "#7f9dff",
    w: 8, bad: true, price: 50,
    desc: "飲むと5ターン眠ってしまう。投げれば敵を眠らせられる。",
  },

  // ===== データチップ（巻物）: 使う =====
  {
    id: "scan_chip", name: "スキャンチップ", cat: "chip", glyph: "=", color: "#5cd9ff",
    w: 20, price: 150,
    desc: "アイテムを1つ解析して正体を識別する。",
  },
  {
    id: "map_chip", name: "マッピングチップ", cat: "chip", glyph: "=", color: "#5cffd9",
    w: 12, price: 200,
    desc: "フロア全体の地形を明らかにする。",
  },
  {
    id: "weapon_up_chip", name: "武器強化チップ", cat: "chip", glyph: "=", color: "#ff8a5c",
    w: 10, price: 400,
    desc: "装備中の武器の強化値を+1する。",
  },
  {
    id: "shield_up_chip", name: "防具強化チップ", cat: "chip", glyph: "=", color: "#8aa8ff",
    w: 10, price: 400,
    desc: "装備中の防具の強化値を+1する。",
  },
  {
    id: "emp_chip", name: "EMPバーストチップ", cat: "chip", glyph: "=", color: "#ffe25c",
    w: 9, price: 500,
    desc: "部屋にいる全ての敵に25ダメージを与える。",
  },
  {
    id: "escape_chip", name: "緊急離脱チップ", cat: "chip", glyph: "=", color: "#c4ff5c",
    w: 7, price: 600,
    desc: "このフロアの階段の位置まで瞬間転送する。",
  },

  // ===== ガジェット（杖）: 振る（直線上の敵に効果・回数制限あり） =====
  {
    id: "stun_gadget", name: "スタナー", cat: "gadget", glyph: "/", color: "#ffe25c",
    w: 10, charges: [4, 6], price: 700,
    desc: "直線上の敵を行動不能にする。攻撃すると解除されてしまう。",
  },
  {
    id: "swap_gadget", name: "テレポーター", cat: "gadget", glyph: "/", color: "#e08aff",
    w: 9, charges: [4, 6], price: 700,
    desc: "直線上の敵と自分の位置を入れ替える。",
  },
  {
    id: "blast_gadget", name: "ブラスター", cat: "gadget", glyph: "/", color: "#ff5c5c",
    w: 10, charges: [4, 6], price: 700,
    desc: "直線上の敵を吹き飛ばして5ダメージを与える。",
  },
  {
    id: "slow_gadget", name: "ジャマー", cat: "gadget", glyph: "/", color: "#7f9dff",
    w: 8, charges: [4, 6], price: 700,
    desc: "直線上の敵を鈍足化する。",
  },

  // ===== ハッキングカード（札）: 投げて状態異常 =====
  {
    id: "confuse_card", name: "混乱カード", cat: "card", glyph: "#", color: "#ff5c8a",
    w: 8, count: [2, 4], price: 300,
    desc: "敵に投げると混乱させる。外れない。",
  },
  {
    id: "sleep_card", name: "スリープカード", cat: "card", glyph: "#", color: "#7f9dff",
    w: 8, count: [2, 4], price: 300,
    desc: "敵に投げると眠らせる。外れない。",
  },
  {
    id: "zap_card", name: "ショックカード", cat: "card", glyph: "#", color: "#ffe25c",
    w: 8, count: [2, 4], price: 300,
    desc: "敵に投げると20ダメージを与える。外れない。",
  },

  // ===== 武器 =====
  {
    id: "pipe_wrench", name: "パイプレンチ", cat: "weapon", glyph: ")", color: "#9fb4cc",
    w: 12, power: 3, identified: true, price: 240,
    desc: "ありふれた工具。ないよりマシ。",
  },
  {
    id: "vibro_knife", name: "バイブロナイフ", cat: "weapon", glyph: ")", color: "#7fd4ff",
    w: 10, power: 5, identified: true, price: 500,
    desc: "高周波振動するナイフ。",
  },
  {
    id: "pulse_blade", name: "パルスブレード", cat: "weapon", glyph: ")", color: "#00e5ff",
    w: 7, power: 8, identified: true, resonance: "pulse", price: 1200,
    desc: "プラズマ刃の剣。パルスバリアと共鳴する。",
  },
  {
    id: "plasma_axe", name: "プラズマアックス", cat: "weapon", glyph: ")", color: "#ff8a5c",
    w: 4, power: 11, identified: true, price: 2400,
    desc: "重量級のプラズマ斧。最高クラスの威力。",
  },

  // ===== 防具（バリアユニット） =====
  {
    id: "scrap_plate", name: "スクラッププレート", cat: "shield", glyph: "[", color: "#9fb4cc",
    w: 12, power: 3, identified: true, price: 240,
    desc: "廃材を加工した装甲板。",
  },
  {
    id: "kevlar_unit", name: "ケブラーユニット", cat: "shield", glyph: "[", color: "#c4ff5c",
    w: 10, power: 5, identified: true, price: 500,
    desc: "軽量の防弾ユニット。",
  },
  {
    id: "pulse_barrier", name: "パルスバリア", cat: "shield", glyph: "[", color: "#00e5ff",
    w: 7, power: 8, identified: true, resonance: "pulse", price: 1200,
    desc: "プラズマ障壁の発生装置。パルスブレードと共鳴する。",
  },
  {
    id: "aegis_field", name: "イージスフィールド", cat: "shield", glyph: "[", color: "#ffae42",
    w: 4, power: 11, identified: true, price: 2400,
    desc: "軍用の力場発生装置。最高クラスの防御力。",
  },

  // ===== クレジット（お金） =====
  {
    id: "credits", name: "クレジット", cat: "money", glyph: "$", color: "#ffe25c",
    w: 18, identified: true, price: 0,
    desc: "電子通貨。",
  },

  // ===== 神髄コア（クリアアイテム・最深層のみ） =====
  {
    id: "shinzui_core", name: "神髄コア", cat: "goal", glyph: "◆", color: "#ff2d78",
    w: 0, identified: true, price: 99999,
    desc: "AI《トグロ》の中枢コア。これを持ち帰るのが目的だ。",
  },
];

// 共鳴ボーナス定義: 対応する武器+防具を同時装備で発動
const RESONANCE = {
  pulse: {
    name: "パルス共鳴",
    atk: 3,
    def: 3,
    desc: "パルスブレード+パルスバリア装備中: 攻+3 防+3",
  },
};

// ---------------------------------------------------------------- 罠
const TRAPS = [
  { id: "mine", name: "対人マイン", effect: "damage", power: 0.5, w: 10, desc: "踏むとHPの半分のダメージ。" },
  { id: "dart", name: "オートタレット", effect: "dart", power: 8, w: 14, desc: "踏むとダーツが飛んでくる。" },
  { id: "slow_trap", name: "重力フィールド", effect: "slow", w: 10, desc: "踏むと一定ターン鈍足になる。" },
  { id: "warp_trap", name: "転送パッド", effect: "warp", w: 12, desc: "フロアのどこかへ転送される。" },
  { id: "sleep_gas", name: "睡眠ガス噴出口", effect: "sleep", w: 10, desc: "踏むと数ターン眠ってしまう。" },
  { id: "pitfall", name: "崩落シャフト", effect: "pitfall", w: 8, desc: "下のフロアへ落下する（ダメージあり）。" },
  { id: "rust_gas", name: "腐食ガス噴出口", effect: "rust", w: 9, desc: "武器か防具の強化値が下がる。" },
  { id: "drain_field", name: "放電フィールド", effect: "drain", w: 9, desc: "充電率が10%減る。" },
];

// レベルアップに必要な累計経験値（Lv1→2 は 8）
const EXP_TABLE = [0, 0, 8, 20, 40, 70, 110, 160, 230, 320, 430, 560, 720, 920, 1160, 1440, 1760, 2130, 2550, 3020, 3550, 4140, 4800, 5530, 6340, 7240, 8230, 9320, 10510, 11810, 13230];

function expForLevel(level) {
  if (level < EXP_TABLE.length) return EXP_TABLE[level];
  return EXP_TABLE[EXP_TABLE.length - 1] + (level - EXP_TABLE.length + 1) * 1500;
}
