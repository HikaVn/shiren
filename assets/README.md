# assets/ — 画像アセット仕様

ここに PNG を置いて `manifest.json` に登録すると、ゲームがスプライト描画に切り替わります。
**登録が無い・読み込めないものは自動で従来の記号描画になる**ので、一部だけ置いてもOKです。

## 基本仕様

- 形式: PNG（透過推奨）
- 1マスのサイズ: **32×32px**（ゲーム側で表示サイズに自動スケール。48×48でも可、正方形なら任意）
- アニメーション: **横一列のストリップ**（例: 4フレームなら 128×32px）。フレーム数とfpsは manifest で指定
- 向き: 見下ろし（トップダウン）。左右の向きはゲーム側で反転しないため、正面向きでデザインする

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
