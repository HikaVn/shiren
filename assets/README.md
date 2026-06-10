# assets/ — 画像アセット仕様

ここに PNG を置いて `manifest.json` に登録すると、ゲームがスプライト描画に切り替わります。
**登録が無い・読み込めないものは自動で従来の記号描画になる**ので、一部だけ置いてもOKです。

## 基本仕様

- 形式: PNG（透過推奨）
- 1マスのサイズ: **幅32px基準**（ゲーム側で表示サイズに自動スケール）
- **キャラクター（プレイヤー・モンスター）は縦長OK**: 例 32×40 / 32×48。
  足元基準（bottom-anchor）で描画されるため、頭がマスからはみ出る「奥行きのある見た目」になる
- **タイルは 32×32 の正方形を推奨**（壁はゲーム側が疑似3D表現でフォールバック描画する）
- アニメーション: **横一列のストリップ**（例: 4フレームの32×40なら 128×40px）。フレーム数とfpsは manifest で指定
- 向き: クォータービュー風の正面〜やや斜め見下ろし。左右の向きはゲーム側で反転しないため正面向きでデザインする

## manifest.json の書式

```json
{
  "sprites": {
    "player":        { "file": "sprites/player.png",        "frames": 4, "fps": 6 },
    "tile_wall":     { "file": "tiles/wall.png" },
    "mon_scout_drone": { "file": "sprites/scout_drone.png", "frames": 2, "fps": 4 }
  }
}
```

`frames` 省略時は 1（静止画）、`fps` 省略時は 6。

## スプライトキー一覧

### プレイヤー・共通

| キー | 内容 |
|---|---|
| `player` | 主人公（ランナー） |
| `trap` | 発見済みの罠（共通アイコン。`trap_<id>` で罠別の上書きも可） |

### タイル（静止画推奨）

| キー | 内容 |
|---|---|
| `tile_floor` | 部屋の床 |
| `tile_corridor` | 通路 |
| `tile_wall` | 壁 |
| `tile_stairs` | 降下シャフト（階段） |
| `tile_shop` | 店の床（省略時は床に金色オーバーレイ） |

### モンスター（キーは `mon_<id>`）

| キー | 名前 |
|---|---|
| `mon_scout_drone` | スカウトドローン |
| `mon_patrol_bot` | パトロールボット |
| `mon_mimic_bot` | ミミックBot |
| `mon_acid_slime` | 酸性スライム |
| `mon_sniper_drone` | スナイパードローン |
| `mon_steal_bot` | スティールBot |
| `mon_hacker_wisp` | ハッカーウィスプ |
| `mon_assault_mech` | アサルトメック |
| `mon_devour_unit` | デバウラー |
| `mon_phase_stalker` | フェイズストーカー |
| `mon_guardian_mech` | ガーディアンメック |
| `mon_dekkai` | ビヒモス・ギガメック（大型なので 64×64 推奨） |
| `mon_merchant_droid` | マーチャントドロイド（店主） |
| `mon_security_enforcer` | セキュリティエンフォーサー |
| `mon_togro_avatar` | セルペンス・アバター（ボス） |

### アイテム

個別指定 `item_<id>`（例: `item_pulse_blade`）が最優先、無ければカテゴリ共通 `item_cat_<cat>` を使用:

| キー | 内容 |
|---|---|
| `item_cat_food` | エナジーパック類 |
| `item_cat_herb` | ナノ薬剤類 |
| `item_cat_chip` | データチップ類 |
| `item_cat_gadget` | ガジェット類 |
| `item_cat_card` | ハッキングカード類 |
| `item_cat_weapon` | 武器 |
| `item_cat_shield` | 防具 |
| `item_cat_pot` | コンテナ |
| `item_cat_money` | クレジット |
| `item_cat_goal` | シンギュラリティコア |

アイテム id の一覧は `js/data.js` の ITEMS を参照。

## 推奨ディレクトリ構成

```
assets/
  manifest.json
  tiles/    wall.png floor.png corridor.png stairs.png
  sprites/  player.png scout_drone.png ...
  items/    pulse_blade.png ...
```
