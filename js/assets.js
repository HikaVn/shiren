// 画像アセットローダー
// assets/manifest.json に登録されたスプライトを読み込む。
// マニフェストが無い・画像が読めない場合は何もせず、描画側がグリフにフォールバックする。
"use strict";

const ASSETS = {
  loaded: false,
  sprites: {}, // key -> { img, frames, fps, frameW, frameH }
};

async function loadAssets() {
  try {
    const res = await fetch("assets/manifest.json", { cache: "no-cache" });
    if (!res.ok) return;
    const manifest = await res.json();
    const entries = Object.entries(manifest.sprites || {});
    await Promise.all(entries.map(([key, def]) => loadSprite(key, def)));
    ASSETS.loaded = true;
  } catch (e) {
    // アセット無しで続行（グリフ描画）
  }
}

function loadSprite(key, def) {
  return new Promise((resolve) => {
    if (!def || !def.file) return resolve();
    const img = new Image();
    img.onload = () => {
      const frames = Math.max(1, def.frames || 1);
      ASSETS.sprites[key] = {
        img,
        frames,
        fps: def.fps || 6,
        frameW: Math.floor(img.width / frames),
        frameH: img.height,
      };
      resolve();
    };
    img.onerror = () => resolve(); // 読めないものは黙ってスキップ
    img.src = "assets/" + def.file;
  });
}

// 現在時刻に応じたアニメーションフレームを返す
function getSprite(key) {
  return ASSETS.sprites[key] || null;
}

function spriteFrame(sprite, timeMs) {
  if (sprite.frames <= 1) return 0;
  return Math.floor((timeMs / 1000) * sprite.fps) % sprite.frames;
}
