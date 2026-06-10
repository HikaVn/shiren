// 起動・入力処理
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const game = new Game();
  const renderer = new Renderer(canvas);
  const ui = new UI(game);

  const titleOverlay = document.getElementById("title-overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");
  const clearOverlay = document.getElementById("clear-overlay");

  function refresh() {
    renderer.resize(game.map.w, game.map.h);
    renderer.draw(game);
    ui.updateStatus();
    // 状態に応じたオーバーレイ
    titleOverlay.classList.toggle("hidden", game.state !== "title");
    if (game.state === "gameover") {
      document.getElementById("gameover-detail").textContent =
        `${game.deathCause} — 地下${game.floor}階 / レベル${game.player.level} で力尽きた。`;
      gameoverOverlay.classList.remove("hidden");
    } else {
      gameoverOverlay.classList.add("hidden");
    }
    if (game.state === "clear") {
      document.getElementById("clear-detail").textContent =
        `地下${FINAL_FLOOR}階を踏破！ レベル${game.player.level} / ${game.player.credits} クレジット獲得。`;
      clearOverlay.classList.remove("hidden");
    } else {
      clearOverlay.classList.add("hidden");
    }
  }

  function startRun() {
    game.resetRun();
    game.state = "play";
    game.log("電脳塔・地下1階。神髄コアは地下20階に眠る——", "sys");
    refresh();
  }

  // キー → 8方向
  const moveKeys = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], a: [-1, 0], d: [1, 0], x: [0, 1],
    q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  };

  window.addEventListener("keydown", (ev) => {
    const key = ev.key;

    // タイトル / ゲームオーバー / クリア画面
    if (game.state !== "play") {
      if (key === "Enter") {
        startRun();
        ev.preventDefault();
      }
      return;
    }

    // 方向選択モード（投げる・ガジェット）
    if (ui.menuMode === "direction") {
      if (key === "Escape") {
        ui.handleMenuKey(key);
        refresh();
        ev.preventDefault();
        return;
      }
      const dir = moveKeys[key] || moveKeys[key.toLowerCase()];
      if (dir) {
        ui.handleDirectionInput(dir[0], dir[1]);
        refresh();
        ev.preventDefault();
      }
      return;
    }

    // メニュー操作中
    if (ui.menuMode) {
      if (ui.handleMenuKey(key)) {
        refresh();
        ev.preventDefault();
      }
      return;
    }

    // 通常操作
    if (key === "i" || key === "I") {
      ui.openInventory();
      ev.preventDefault();
      return;
    }
    if (key === "g" || key === "G") {
      game.tryPickup(false);
      game.endTurn();
      refresh();
      ev.preventDefault();
      return;
    }
    if (key === ">" || (key === "." && ev.shiftKey)) {
      game.descend(false);
      refresh();
      ev.preventDefault();
      return;
    }
    if (key === "." || key === "s" || key === "S") {
      // 足踏み（sは下移動と紛らわしいため足踏みに割当、下移動は x / ↓）
      game.passTurn();
      refresh();
      ev.preventDefault();
      return;
    }

    const dir = moveKeys[key];
    if (dir) {
      game.playerMove(dir[0], dir[1]);
      refresh();
      ev.preventDefault();
    }
  });

  // 初期描画
  refresh();
  game.log("Enter キーで潜入を開始してください。", "sys");
})();
