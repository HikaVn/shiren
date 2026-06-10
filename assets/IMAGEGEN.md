# IMAGEGEN.md — ImageGen でスプライトを作り切るための完全指示書

Codex の ImageGen（gpt-image 系）で NEON DELVE の全スプライトを生成するためのドキュメント。
上から順に生成すれば全アセットが揃う。生成後はリポジトリにコミットして
「pullして組み込んで」と Claude に指示すれば反映される。

---

## 1. 共通ルール（全プロンプトに適用）

### ベースプロンプト（毎回プロンプトの先頭に付ける）

```
Retro 16-bit pixel art game sprite, 3/4 top-down view (slightly angled like SNES RPG),
cyberpunk neon style, dark navy color world with neon cyan and magenta accents,
clean bold silhouette readable at small size, single subject centered,
transparent background, no text, no watermark, no frame, crisp pixel edges
```

### カラーパレット（ゲーム画面と揃える。プロンプトに `palette:` として添える）

| 用途 | HEX |
|---|---|
| 背景の闇 | `#05080f` |
| 壁の青 | `#2a4060` |
| ネオンシアン（メインアクセント） | `#00e5ff` |
| ネオンマゼンタ | `#ff2d78` |
| プレイヤーグリーン | `#4dff88` |
| 警告イエロー | `#ffd866` |
| 敵レッド | `#ff5c5c` |

### 技術仕様

- 生成サイズ: **1024×1024**（ImageGen の最小）→ 後処理で縮小
- 最終サイズ: **32×32px**（ビヒモスのみ 64×64、キャラは任意で 32×40 可）
- 形式: **透過PNG**（必ず "transparent background" を入れる）
- アニメは v1 では不要（全部 静止画 frames:1 でOK。動きはゲーム側の揺れ/発光が担う）
- 構図: 被写体をキャンバスの**中央に大きく**。足元が下端に来るように（キャラのみ）

### 後処理（縮小コマンド）

ImageMagick がある場合（ニアレストネイバーでドット感を維持）:

```bash
magick input.png -background none -filter point -resize 32x32 output.png
# ビヒモスのみ
magick dekkai.png -background none -filter point -resize 64x64 sprites/dekkai.png
```

無い場合は any 画像エディタで「補間なし/ニアレストネイバー」縮小を選ぶこと。

---

## 2. 生成リスト

「📁」は保存先ファイル名。プロンプトはベースプロンプトの後ろに連結する。

### 2-1. プレイヤー

📁 `assets/sprites/player.png`
```
lone cyberpunk runner protagonist, slim agile silhouette, dark tactical jacket with
glowing neon green (#4dff88) trim lines, short messy hair, small visor over eyes,
facing camera (south), standing idle pose, full body
```

### 2-2. タイル（フラットな床は「真上視点」で生成する点に注意）

📁 `assets/tiles/floor.png` — ※ベースの「3/4 view」を「top-down flat texture」に置換
```
seamless sci-fi floor tile texture, viewed from directly above, dark blue metal panel
(#0c1626) with thin grid seams (#13243d), subtle wear, very dark, tileable
```

📁 `assets/tiles/corridor.png` — 同上
```
seamless sci-fi corridor floor texture, viewed from directly above, darker metal grating
(#0a1220), industrial, tileable, very dark
```

📁 `assets/tiles/wall.png`
```
sci-fi wall block tile, front-facing cube face: top 40% is lit blue metal slab (#2a4060)
with bright edge, bottom 60% is dark panel wall (#0b1424) with vertical seams and a thin
glowing cyan (#00e5ff) neon strip at the boundary, fills entire canvas, tileable horizontally
```

📁 `assets/tiles/stairs.png`
```
sci-fi descending shaft hatch in floor, viewed from directly above, open hexagonal hole
with glowing cyan (#00e5ff) light rising from below, warning stripes on rim
```

📁 `assets/tiles/shop.png` — ※真上視点
```
seamless sci-fi shop floor tile, viewed from directly above, dark metal with warm golden
(#ffd866) hologram carpet pattern, luxurious, tileable
```

### 2-3. モンスター（15体）

📁 `assets/sprites/scout_drone.png`
```
tiny weak scout drone robot mouse, single camera eye, pale grey-blue (#9fb4cc),
hovering close to ground, cute but mechanical, smallest enemy
```

📁 `assets/sprites/patrol_bot.png`
```
small wheeled patrol security robot, rounded body, light blue (#7fd4ff) glowing visor,
one extendable baton arm
```

📁 `assets/sprites/mimic_bot.png`
```
robot disguised as a glowing yellow (#ffd866) supply crate with a question mark hologram,
sinister mechanical jaws slightly visible at the seam
```

📁 `assets/sprites/acid_slime.png`
```
blob of glowing toxic green (#9dff5c) nano-gel slime, semi-transparent, corroding drips,
small machine parts dissolving inside it
```

📁 `assets/sprites/sniper_drone.png`
```
hovering sniper drone, elongated body with one long glowing orange (#ff9d5c) laser barrel,
single targeting lens, angular stealth plating
```

📁 `assets/sprites/steal_bot.png`
```
sneaky thief robot, hunched fast-looking silhouette, purple (#e08aff) glowing eyes,
large grabbing claw hands, satchel full of stolen credit chips
```

📁 `assets/sprites/hacker_wisp.png`
```
floating ball of glitching cyan (#5cd9ff) holographic code, ghost-like digital wisp,
trailing corrupted data particles, no solid body
```

📁 `assets/sprites/assault_mech.png`
```
heavy red (#ff5c5c) combat mech, broad armored shoulders, twin gatling arms,
menacing forward-leaning stance, battle-scarred plating
```

📁 `assets/sprites/devour_unit.png`
```
horrifying scavenger machine with a huge circular shredder maw, acid green (#c4ff5c)
glow from inside mouth, robotic limbs of eaten machines fused onto its back
```

📁 `assets/sprites/phase_stalker.png`
```
assassin robot mid-phase-shift, sleek black body partially transparent and glitching,
violet (#b48aff) energy blades on both arms, motion-blur afterimage
```

📁 `assets/sprites/guardian_mech.png`
```
massive elite guardian mech, fortress-like golden-orange (#ffae42) armor plates,
tower shield arm, glowing core in chest, immovable heavy stance
```

📁 `assets/sprites/dekkai.png` — ※最終サイズ 64×64
```
colossal behemoth-class siege mech, screen-filling silhouette, crimson-pink (#ff2d78)
warning lights all over, four crushing legs, cathedral-sized body with antenna towers,
terrifying scale
```

📁 `assets/sprites/merchant_droid.png`
```
friendly merchant droid shopkeeper, rotund vending-machine body, warm yellow (#ffd866)
holographic apron, welcoming raised hand, kind single lens eye
```

📁 `assets/sprites/security_enforcer.png`
```
riot-suppression enforcer robot, bulky orange (#ff7a00) armor with POLICE-like markings,
riot shield and stun rod, faceless intimidating visor
```

📁 `assets/sprites/togro_avatar.png`
```
final boss: combat avatar of rogue AI, tall serpentine humanoid frame coiled like a snake,
blood red (#ff0044) core lines across black chrome body, crown-like sensor array,
regal and menacing
```

### 2-4. アイテム（カテゴリ共通 10種）

📁 `assets/items/cat_food.png`
```
sci-fi energy pack item icon, compact battery canister with yellow (#ffd866) charge
indicator bars, slight glow
```

📁 `assets/items/cat_herb.png`
```
small glass ampoule item icon filled with glowing green (#4dff88) nano-repair fluid,
cork-less sci-fi vial with digital label
```

📁 `assets/items/cat_chip.png`
```
data chip item icon, small circuit board card with glowing cyan (#5cd9ff) traces,
holographic shimmer
```

📁 `assets/items/cat_gadget.png`
```
handheld sci-fi gadget item icon, pistol-grip device with glowing emitter, yellow (#ffe25c)
charge cells visible on side
```

📁 `assets/items/cat_card.png`
```
hacking keycard item icon, sleek black card with animated magenta (#ff5c8a) circuit
pattern, sharp corners
```

📁 `assets/items/cat_weapon.png`
```
energy blade weapon item icon, short sword with glowing cyan (#00e5ff) plasma edge,
dark hilt, displayed diagonally
```

📁 `assets/items/cat_shield.png`
```
barrier unit item icon, forearm-mounted emitter projecting a small hexagonal cyan
(#00e5ff) energy shield
```

📁 `assets/items/cat_pot.png`
```
storage container item icon, cylindrical sci-fi canister with transparent window showing
items inside, purple (#c8b8ff) hologram capacity gauge
```

📁 `assets/items/cat_money.png`
```
credit currency item icon, small stack of glowing yellow (#ffe25c) hexagonal coins
with digital symbols
```

📁 `assets/items/cat_goal.png`
```
legendary singularity core item icon, fist-sized crystalline AI core, intense
magenta-red (#ff2d78) inner light, floating fragments orbiting it, most precious object
```

### 2-5. 罠

📁 `assets/sprites/trap.png`
```
revealed floor trap icon viewed from above, triangular warning emitter embedded in floor
panel, blinking magenta (#ff5c8a) hazard light, small and flat
```

---

## 3. 生成のコツ

- **1枚ずつ生成し、即縮小して確認**する。32×32に潰してシルエットが判別できなければ、
  「simpler silhouette, bolder shapes, less detail」を追加して再生成
- 同じチャットセッション内で続けて生成するとスタイルが揃いやすい。
  ずれてきたら「same art style as previous sprites」を追加
- 背景が透過にならなかった場合は「isolated on fully transparent background, no floor shadow」を強調
- 余白が大きすぎたら「subject fills 90% of canvas」を追加

## 4. 完成後の登録

すべて配置したら `assets/manifest.json` を以下の内容で作成（静止画なので frames 指定は不要）:

```json
{
  "sprites": {
    "player":               { "file": "sprites/player.png" },
    "tile_floor":           { "file": "tiles/floor.png" },
    "tile_corridor":        { "file": "tiles/corridor.png" },
    "tile_wall":            { "file": "tiles/wall.png" },
    "tile_stairs":          { "file": "tiles/stairs.png" },
    "tile_shop":            { "file": "tiles/shop.png" },
    "mon_scout_drone":      { "file": "sprites/scout_drone.png" },
    "mon_patrol_bot":       { "file": "sprites/patrol_bot.png" },
    "mon_mimic_bot":        { "file": "sprites/mimic_bot.png" },
    "mon_acid_slime":       { "file": "sprites/acid_slime.png" },
    "mon_sniper_drone":     { "file": "sprites/sniper_drone.png" },
    "mon_steal_bot":        { "file": "sprites/steal_bot.png" },
    "mon_hacker_wisp":      { "file": "sprites/hacker_wisp.png" },
    "mon_assault_mech":     { "file": "sprites/assault_mech.png" },
    "mon_devour_unit":      { "file": "sprites/devour_unit.png" },
    "mon_phase_stalker":    { "file": "sprites/phase_stalker.png" },
    "mon_guardian_mech":    { "file": "sprites/guardian_mech.png" },
    "mon_dekkai":           { "file": "sprites/dekkai.png" },
    "mon_merchant_droid":   { "file": "sprites/merchant_droid.png" },
    "mon_security_enforcer":{ "file": "sprites/security_enforcer.png" },
    "mon_togro_avatar":     { "file": "sprites/togro_avatar.png" },
    "item_cat_food":        { "file": "items/cat_food.png" },
    "item_cat_herb":        { "file": "items/cat_herb.png" },
    "item_cat_chip":        { "file": "items/cat_chip.png" },
    "item_cat_gadget":      { "file": "items/cat_gadget.png" },
    "item_cat_card":        { "file": "items/cat_card.png" },
    "item_cat_weapon":      { "file": "items/cat_weapon.png" },
    "item_cat_shield":      { "file": "items/cat_shield.png" },
    "item_cat_pot":         { "file": "items/cat_pot.png" },
    "item_cat_money":       { "file": "items/cat_money.png" },
    "item_cat_goal":        { "file": "items/cat_goal.png" },
    "trap":                 { "file": "sprites/trap.png" }
  }
}
```

コミット＆プッシュして Claude に「pullして組み込んで」と伝えれば、次のデプロイで
スプライト描画に切り替わる（読み込めなかったものは自動で従来の記号描画のまま）。

## 5. 発展（v2 でやること）

- 2〜4フレームの待機アニメ: 同ポーズの微差分を生成して横に並べ、
  manifest に `"frames": 2, "fps": 3` を追記（横幅 = 32×フレーム数）
- 個別アイテム差分: `item_<id>.png`（例 `item_pulse_blade.png`）を置くとカテゴリ共通より優先される
- タイルのバリエーション（床の汚れ違い等）はゲーム側の対応が必要なので Claude に相談
