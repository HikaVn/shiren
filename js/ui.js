// UI — ステータスバー / ログ / インベントリメニュー / 方向選択
"use strict";

class UI {
  constructor(game) {
    this.game = game;
    this.logEl = document.getElementById("log");
    this.menuEl = document.getElementById("menu");
    this.menuMode = null; // null | "inventory" | "action"
    this.menuIndex = 0;
    this.actionIndex = 0;
    this.selectedItem = null;
    this.pendingDirection = null; // {verb: "throw"|"gadget", item}

    game.onMessage = (text, kind) => this.appendLog(text, kind);
  }

  appendLog(text, kind) {
    const div = document.createElement("div");
    div.className = `msg-${kind}`;
    div.textContent = text;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 60) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  updateStatus() {
    const g = this.game;
    const p = g.player;
    document.getElementById("st-floor").textContent = g.floor;
    document.getElementById("st-level").textContent = p.level;
    document.getElementById("st-hp").textContent = `${p.hp}/${p.maxHp}`;
    document.getElementById("hp-bar").style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    const ratio = p.hp / p.maxHp;
    document.getElementById("hp-bar").style.background =
      ratio > 0.5 ? "var(--green)" : ratio > 0.25 ? "var(--yellow)" : "var(--red)";
    document.getElementById("st-fullness").textContent =
      `${p.fullness}%` + (p.overcharge ? " ⚡OC" : "");
    document.getElementById("st-atk").textContent = g.playerAtkValue();
    document.getElementById("st-def").textContent = g.playerDefValue();
    document.getElementById("st-gold").textContent =
      p.credits + (g.shop && g.shop.unpaid > 0 ? `（未払い ${g.shop.unpaid}）` : "");
  }

  // ------------------------------------------------------------ インベントリ
  openInventory() {
    this.menuMode = "inventory";
    this.menuIndex = Math.min(this.menuIndex, Math.max(0, this.game.player.inventory.length - 1));
    this.renderMenu();
  }

  closeMenu() {
    this.menuMode = null;
    this.selectedItem = null;
    this.pendingDirection = null;
    this.menuEl.classList.add("hidden");
  }

  actionsFor(item) {
    const cat = item.def.cat;
    const acts = [];
    if (cat === "food") acts.push({ id: "use", label: "補給する" });
    if (cat === "herb") acts.push({ id: "use", label: "飲む" });
    if (cat === "chip") acts.push({ id: "use", label: "起動する" });
    if (cat === "gadget") acts.push({ id: "gadget", label: "発射する" });
    if (cat === "pot") {
      acts.push({ id: "potIn", label: "入れる" });
      if (item.def.id === "storage_container") acts.push({ id: "potOut", label: "出す" });
      acts.push({ id: "potBreak", label: "割る" });
    }
    if (cat === "weapon" || cat === "shield") {
      const equipped = this.game.player.weapon === item || this.game.player.shield === item;
      acts.push({ id: "use", label: equipped ? "外す" : "装備する" });
    }
    acts.push({ id: "throw", label: "投げる" });
    acts.push({ id: "drop", label: "置く" });
    acts.push({ id: "desc", label: "説明を見る" });
    return acts;
  }

  renderMenu() {
    const g = this.game;
    const el = this.menuEl;
    el.classList.remove("hidden");
    el.innerHTML = "";

    if (this.menuMode === "inventory") {
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `持ち物 (${g.player.inventory.length}/${MAX_INVENTORY})`;
      el.appendChild(title);
      if (g.player.inventory.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "何も持っていない。";
        el.appendChild(empty);
      }
      g.player.inventory.forEach((item, i) => {
        const div = document.createElement("div");
        div.className = "item" + (i === this.menuIndex ? " sel" : "");
        let tag = "";
        if (g.player.weapon === item) tag = " <span class='equipped'>[装備中]</span>";
        if (g.player.shield === item) tag = " <span class='equipped'>[装備中]</span>";
        div.innerHTML = `${item.def.glyph} ${escapeHtml(g.displayName(item))}${tag}`;
        div.addEventListener("click", () => {
          this.menuIndex = i;
          this.selectMenuItem();
        });
        el.appendChild(div);
      });
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "↑↓: 選択 / Enter: 決定 / Esc: 閉じる";
      el.appendChild(hint);
    } else if (this.menuMode === "action") {
      const item = this.selectedItem;
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = g.displayName(item);
      el.appendChild(title);
      const acts = this.actionsFor(item);
      acts.forEach((a, i) => {
        const div = document.createElement("div");
        div.className = "item" + (i === this.actionIndex ? " sel" : "");
        div.textContent = a.label;
        div.addEventListener("click", () => {
          this.actionIndex = i;
          this.executeAction();
        });
        el.appendChild(div);
      });
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "↑↓: 選択 / Enter: 決定 / Esc: 戻る";
      el.appendChild(hint);
    } else if (this.menuMode === "potInsert") {
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${g.displayName(this.potTarget)} に入れる`;
      el.appendChild(title);
      const candidates = this.potCandidates();
      candidates.forEach((item, i) => {
        const div = document.createElement("div");
        div.className = "item" + (i === this.potIndex ? " sel" : "");
        div.textContent = `${item.def.glyph} ${g.displayName(item)}`;
        div.addEventListener("click", () => {
          this.potIndex = i;
          this.executePotInsert();
        });
        el.appendChild(div);
      });
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "↑↓: 選択 / Enter: 入れる / Esc: 戻る";
      el.appendChild(hint);
    } else if (this.menuMode === "direction") {
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "方向を選択";
      el.appendChild(title);
      const p = document.createElement("div");
      p.textContent = "矢印キー（または QEZC で斜め）で方向を選んでください。Esc でキャンセル。";
      el.appendChild(p);
    }
  }

  selectMenuItem() {
    const inv = this.game.player.inventory;
    if (inv.length === 0) return;
    this.selectedItem = inv[this.menuIndex];
    this.menuMode = "action";
    this.actionIndex = 0;
    this.renderMenu();
  }

  executeAction() {
    const g = this.game;
    const item = this.selectedItem;
    const act = this.actionsFor(item)[this.actionIndex];
    if (!act) return;
    switch (act.id) {
      case "use":
        this.closeMenu();
        g.useItem(item);
        break;
      case "drop":
        this.closeMenu();
        g.dropItem(item);
        break;
      case "throw":
        this.pendingDirection = { verb: "throw", item };
        this.menuMode = "direction";
        this.renderMenu();
        break;
      case "gadget":
        this.pendingDirection = { verb: "gadget", item };
        this.menuMode = "direction";
        this.renderMenu();
        break;
      case "potIn": {
        const candidates = g.player.inventory.filter((it) => it !== item && it.def.cat !== "pot");
        if (candidates.length === 0) {
          g.log("コンテナに入れられるアイテムを持っていない。");
          this.closeMenu();
          break;
        }
        this.menuMode = "potInsert";
        this.potTarget = item;
        this.potIndex = 0;
        this.renderMenu();
        break;
      }
      case "potOut":
        this.closeMenu();
        g.takeFromPot(item);
        break;
      case "potBreak":
        this.closeMenu();
        g.breakPot(item);
        break;
      case "desc": {
        const d = item.def;
        const known = d.identified || g.identified.has(d.id);
        g.log(known ? `${d.name}: ${d.desc}` : "正体が分からない。使うかスキャンチップで識別できる。", "sys");
        this.closeMenu();
        break;
      }
    }
  }

  potCandidates() {
    return this.game.player.inventory.filter(
      (it) => it !== this.potTarget && it.def.cat !== "pot"
    );
  }

  executePotInsert() {
    const candidates = this.potCandidates();
    const item = candidates[this.potIndex];
    const pot = this.potTarget;
    this.closeMenu();
    if (item && pot) this.game.putIntoPot(pot, item);
  }

  // 方向選択中の入力。処理したら true
  handleDirectionInput(dx, dy) {
    if (this.menuMode !== "direction" || !this.pendingDirection) return false;
    const { verb, item } = this.pendingDirection;
    this.closeMenu();
    if (verb === "throw") this.game.throwItem(item, dx, dy);
    else if (verb === "gadget") this.game.useGadget(item, dx, dy);
    return true;
  }

  handleMenuKey(key) {
    if (!this.menuMode) return false;
    const g = this.game;
    if (key === "Escape") {
      if (this.menuMode === "action" || this.menuMode === "direction" || this.menuMode === "potInsert") {
        this.menuMode = this.menuMode === "potInsert" ? "action" : "inventory";
        this.pendingDirection = null;
        this.renderMenu();
      } else {
        this.closeMenu();
      }
      return true;
    }
    if (this.menuMode === "direction") return true; // 方向キーは main.js 側で処理
    const listLen = this.menuMode === "inventory"
      ? g.player.inventory.length
      : this.menuMode === "potInsert"
        ? this.potCandidates().length
        : this.actionsFor(this.selectedItem).length;
    const moveSel = (delta) => {
      const len = Math.max(1, listLen);
      if (this.menuMode === "inventory") this.menuIndex = (this.menuIndex + delta + len) % len;
      else if (this.menuMode === "potInsert") this.potIndex = (this.potIndex + delta + len) % len;
      else this.actionIndex = (this.actionIndex + delta + len) % len;
      this.renderMenu();
    };
    if (key === "ArrowUp" || key === "w" || key === "W") {
      moveSel(-1);
      return true;
    }
    if (key === "ArrowDown" || key === "s" || key === "S") {
      moveSel(1);
      return true;
    }
    if (key === "Enter") {
      if (this.menuMode === "inventory") this.selectMenuItem();
      else if (this.menuMode === "potInsert") this.executePotInsert();
      else this.executeAction();
      return true;
    }
    return true; // メニュー中は他のキーを吸収
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
