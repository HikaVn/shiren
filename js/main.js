// 起動・入力処理（キーボード + タッチ）
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const game = new Game();
  const renderer = new Renderer(canvas);
  const ui = new UI(game);
  ui.onAction = () => refresh();

  const titleOverlay = document.getElementById("title-overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");
  const clearOverlay = document.getElementById("clear-overlay");

  // 画面幅に応じてビューポートを切り替え（小画面はプレイヤー追従カメラ）
  function applyView() {
    const small = window.matchMedia("(max-width: 820px)").matches;
    if (small) {
      renderer.setView(Math.min(game.map.w, 21), Math.min(game.map.h, 15));
    } else {
      renderer.setView(game.map.w, game.map.h);
    }
  }

  function refresh() {
    applyView();
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
    game.log("電脳塔・地下1階。シンギュラリティコアは地下20階に眠る——", "sys");
    refresh();
  }

  // ------------------------------------------------------------ アクション
  // キーボードとタッチの両方から呼ばれる共通処理
  function doMove(dx, dy) {
    if (game.state !== "play") return;
    if (ui.menuMode === "direction") {
      ui.handleDirectionInput(dx, dy);
      refresh();
      return;
    }
    if (ui.menuMode) return;
    game.playerMove(dx, dy);
    refresh();
  }

  function doWait() {
    if (game.state !== "play" || ui.menuMode) return;
    game.passTurn();
    refresh();
  }

  function doPickup() {
    if (game.state !== "play" || ui.menuMode) return;
    game.tryPickup(false);
    game.endTurn();
    refresh();
  }

  function doDescend() {
    if (game.state !== "play" || ui.menuMode) return;
    game.descend(false);
    refresh();
  }

  function doInventory() {
    if (game.state !== "play") return;
    if (ui.menuMode) {
      ui.closeMenu();
    } else {
      ui.openInventory();
    }
    refresh();
  }

  function doConfirmOrStart() {
    if (game.state !== "play") {
      startRun();
      return;
    }
    if (ui.menuMode) {
      ui.handleMenuKey("Enter");
      refresh();
    }
  }

  // ------------------------------------------------------------ キーボード
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
        doMove(dir[0], dir[1]);
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
      doInventory();
      ev.preventDefault();
      return;
    }
    if (key === "g" || key === "G") {
      doPickup();
      ev.preventDefault();
      return;
    }
    if (key === ">" || (key === "." && ev.shiftKey)) {
      doDescend();
      ev.preventDefault();
      return;
    }
    if (key === "." || key === "s" || key === "S") {
      // 足踏み（sは下移動と紛らわしいため足踏みに割当、下移動は x / ↓）
      doWait();
      ev.preventDefault();
      return;
    }

    const dir = moveKeys[key];
    if (dir) {
      doMove(dir[0], dir[1]);
      ev.preventDefault();
    }
  });

  // ------------------------------------------------------------ タッチ操作
  // D-パッド（8方向+中央=足踏み）とアクションボタン
  const padActions = {
    "pad-nw": () => doMove(-1, -1), "pad-n": () => doMove(0, -1), "pad-ne": () => doMove(1, -1),
    "pad-w": () => doMove(-1, 0), "pad-c": () => doWait(), "pad-e": () => doMove(1, 0),
    "pad-sw": () => doMove(-1, 1), "pad-s": () => doMove(0, 1), "pad-se": () => doMove(1, 1),
    "btn-pickup": () => doPickup(),
    "btn-inventory": () => doInventory(),
    "btn-stairs": () => doDescend(),
    "btn-confirm": () => doConfirmOrStart(),
  };
  for (const [id, fn] of Object.entries(padActions)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      fn();
    });
  }

  // オーバーレイはタップ/クリックでも開始できる
  for (const overlay of [titleOverlay, gameoverOverlay, clearOverlay]) {
    overlay.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      if (game.state !== "play") startRun();
    });
  }

  // 画面回転・リサイズで再描画
  window.addEventListener("resize", () => refresh());

  // 初期描画
  refresh();
  game.log("Enter キーまたは画面タップで潜入を開始してください。", "sys");
})();
