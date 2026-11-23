/*
 * Armada UI kit runtime: builds the kit's components, plays its animations and mounts the game's
 * HUD over the canvas. Plain script, no build step; it defines `window.ArmadaUI`.
 *
 * The styles live in armada-ui.css; the guide is lib/docs/UI-KIT.md and the live catalogue is
 * web/ui/index.html. The game feeds the HUD through `GameHud.apply`, which web/adapter.js calls
 * with the JSON the Rust client sends (src/gui/web_ui.rs).
 */
(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const script = document.currentScript;
  const base = script && script.src ? new URL(".", script.src).href : "ui/";

  const SPRITES = `
<svg xmlns="${SVG_NS}" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <filter id="ac-wobble" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <symbol id="ac-tool-axe" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 42 32 10" fill="none" stroke-width="9"/><path d="M14 42 32 10" fill="none" stroke="#c27a3e" stroke-width="3.5"/>
    <path d="M26 9c5-5 13-3 16 2-4 1-7 5-7 10-5-1-9-6-9-12z" fill="#e6e8e4"/></g></symbol>
  <symbol id="ac-tool-pickaxe" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 42 30 14" fill="none" stroke-width="9"/><path d="M12 42 30 14" fill="none" stroke="#c27a3e" stroke-width="3.5"/>
    <path d="M10 14c8-8 22-9 32-2-9-1-16 1-21 6-3-3-7-4-11-4z" fill="#cfd3cf"/></g></symbol>
  <symbol id="ac-tool-net" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 42 24 24" fill="none" stroke-width="9"/><path d="M10 42 24 24" fill="none" stroke="#c27a3e" stroke-width="3.5"/>
    <circle cx="31" cy="16" r="11" fill="#ecdcb9"/>
    <path d="M23 10l16 12M21 17l17-9M26 26l10-19" fill="none" stroke-width="2"/></g></symbol>
  <symbol id="ac-tool-hand" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 26V14a3 3 0 0 1 6 0v8V10a3 3 0 0 1 6 0v12V12a3 3 0 0 1 6 0v12-6a3 3 0 0 1 6 0v12c0 8-6 14-13 14-6 0-9-3-12-8l-5-8a3 3 0 0 1 5-4z" fill="#f0c49a"/></g></symbol>
</svg>`;

  const reducedMotion = () =>
    !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /** Injects the wobble filter and the tool symbols once per document. */
  function install(doc) {
    const d = doc || document;
    if (d.getElementById("ac-wobble")) return;
    const holder = d.createElement("div");
    holder.innerHTML = SPRITES.trim();
    d.body.insertBefore(holder.firstChild, d.body.firstChild);
  }

  /** The URL of an item's icon, cropped from its drop sprite by scripts/build-ui-icons.py. */
  const itemIcon = (item) => `${base}items/${encodeURIComponent(item)}.png`;

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function icon(item, className) {
    const img = el("img", `ac-icon ${className || ""}`.trim(), { alt: "", draggable: "false" });
    img.src = itemIcon(item);
    return img;
  }

  function toolIcon(tool, className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", `ac-icon ${className || ""}`.trim());
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#ac-tool-${tool || "hand"}`);
    svg.appendChild(use);
    return svg;
  }

  /** Restarts a CSS animation class on `node`. */
  function replay(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  /** A squash-and-stretch hit, for whatever was struck. */
  const hit = (node) => replay(node, "ac-hit");

  /**
   * The inventory bar. `render(slots)` takes one entry per slot, `null` for an empty one and
   * `{ item, name, count }` otherwise.
   */
  class Hotbar {
    constructor(root, options) {
      this.root = root;
      this.keys = !!(options && options.keys);
      this.buttons = !!(options && options.buttons);
      this.slots = [];
      root.classList.add("ac-hand", "ac-hotbar");
      root.setAttribute("role", "group");
      if (!root.hasAttribute("aria-label")) root.setAttribute("aria-label", "Inventario");
    }

    render(slots) {
      while (this.slots.length < slots.length) {
        const index = this.slots.length;
        const node = el(this.buttons ? "button" : "div", "ac-slot");
        if (this.buttons) node.type = "button";
        if (this.keys) {
          const key = el("span", "ac-slot__key");
          key.textContent = String(index + 1);
          node.appendChild(key);
        }
        const count = el("span", "ac-slot__count");
        node.appendChild(count);
        this.root.appendChild(node);
        this.slots.push({ node, count, img: null, item: null });
      }
      while (this.slots.length > slots.length) this.slots.pop().node.remove();
      slots.forEach((stack, index) => this.paint(index, stack));
    }

    paint(index, stack) {
      const slot = this.slots[index];
      const item = stack ? stack.item : null;
      if (slot.item !== item) {
        if (slot.img) slot.img.remove();
        slot.img = item ? icon(item, "ac-slot__icon") : null;
        if (slot.img) slot.node.insertBefore(slot.img, slot.count);
        slot.item = item;
      }
      slot.node.classList.toggle("is-empty", !stack);
      slot.count.textContent = stack && stack.count > 1 ? String(stack.count) : "";
      slot.node.setAttribute("aria-label", stack ? `${stack.name}: ${stack.count}` : "Vacío");
    }

    /** The slot element holding `item`, or the first empty one. */
    slotFor(item) {
      const holding = this.slots.find((slot) => slot.item === item);
      const empty = this.slots.find((slot) => slot.item === null);
      return (holding || empty || this.slots[0] || {}).node || this.root;
    }

    select(index) {
      this.slots.forEach((slot, i) => slot.node.setAttribute("aria-pressed", String(i === index)));
    }

    bump(node) {
      replay(node, "is-bump");
    }
  }

  /**
   * The comic bubble: one per `layer`, popped at `x`, `y` (its tail's tip, in the layer's pixels).
   * `gain` shows `+amount icon name`; `text` shows a plain line; `warning` paints it red.
   */
  function bubble(layer, options) {
    let node = layer.querySelector(":scope > .ac-bubble");
    if (!node) {
      node = el("div", "ac-bubble", { role: "status", "aria-live": "polite" });
      node.innerHTML =
        '<div class="ac-bubble__body ac-hand"></div>' +
        '<svg class="ac-bubble__tail" viewBox="0 0 34 30" aria-hidden="true"><path d="M3 2 L14 28 L31 2"/></svg>';
      layer.appendChild(node);
    }
    const body = node.firstChild;
    body.textContent = "";
    if (options.amount !== undefined) {
      const amount = el("span", "ac-bubble__amount");
      amount.textContent = `+${options.amount}`;
      body.appendChild(amount);
      if (options.item) body.appendChild(icon(options.item, "ac-bubble__icon"));
    }
    const label = el("span");
    label.textContent = options.text || options.name || "";
    body.appendChild(label);
    node.classList.toggle("is-warning", !!options.warning);
    node.style.left = `${options.x}px`;
    node.style.top = `${options.y}px`;
    node.hidden = false;
    node.classList.remove("is-out");
    replay(node, "is-in");
    clearTimeout(node._acHide);
    const hold = options.ms || 1600;
    node._acHide = setTimeout(() => {
      node.classList.remove("is-in");
      node.classList.add("is-out");
      node._acHide = setTimeout(() => {
        node.hidden = true;
        node.classList.remove("is-out");
      }, 260);
    }, hold);
    return node;
  }

  /**
   * Throws `+amount icon` in an arc from `from` (viewport pixels) to the element `to`, shaking as
   * it goes, then calls `onLand`. Resolves at once when the viewer asks for less motion.
   */
  function fly(options) {
    const { from, to, amount, item, onLand } = options;
    const done = () => onLand && onLand();
    if (reducedMotion() || !to) {
      done();
      return;
    }
    const node = el("div", "ac-fly");
    const label = el("span");
    label.textContent = `+${amount}`;
    node.appendChild(label);
    if (item) node.appendChild(icon(item, "ac-fly__icon"));
    document.body.appendChild(node);
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const target = to.getBoundingClientRect();
    const x0 = from.x - w / 2 + (Math.random() * 24 - 12);
    const y0 = from.y - h / 2;
    const x1 = target.left + target.width / 2 - w / 2;
    const y1 = target.top + target.height / 2 - h / 2;
    const peak = Math.min(y0, y1) - 110;
    const frames = [];
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * ((x0 + x1) / 2) + t * t * x1;
      const y = u * u * y0 + 2 * u * t * peak + t * t * y1;
      const scale = t < 0.15 ? 0.4 + t * 5.2 : 1.18 - t * 0.5;
      const turn = Math.sin(t * Math.PI * 6) * (1 - t) * 14;
      frames.push({
        transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${turn}deg)`,
        opacity: t > 0.92 ? 0 : 1,
      });
    }
    const animation = node.animate(frames, { duration: 760, easing: "cubic-bezier(.4,0,.6,1)" });
    animation.onfinish = () => {
      node.remove();
      done();
    };
  }

  /** Calls `onChange(true)` while `button` is held by mouse, touch or pen, and `false` on release. */
  function holdButton(button, onChange, options) {
    let pointer = null;
    const release = () => {
      if (pointer === null) return;
      pointer = null;
      button.classList.remove("is-pressed");
      onChange(false);
      if (options && options.refocus) options.refocus.focus({ preventScroll: true });
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (pointer !== null || button.disabled) return;
      pointer = event.pointerId;
      try {
        button.setPointerCapture(pointer);
      } catch {}
      button.classList.add("is-pressed");
      onChange(true);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    return { release };
  }

  /** Builds a round action button: `{ verb, tool, key }`. */
  function actionButton(options) {
    const button = el("button", "ac-action ac-hand", { type: "button", tabindex: "-1" });
    if (options && options.key) {
      const key = el("span", "ac-action__key");
      key.textContent = options.key;
      button.appendChild(key);
    }
    const label = el("span", "ac-action__label");
    button.appendChild(toolIcon(options && options.tool, "ac-action__icon"));
    button.appendChild(label);
    button._acLabel = label;
    setAction(button, options || {});
    return button;
  }

  function setAction(button, options) {
    const svgUse = button.querySelector(".ac-action__icon use");
    if (svgUse) svgUse.setAttribute("href", `#ac-tool-${options.tool || "hand"}`);
    button._acLabel.textContent = options.verb || "";
    button.setAttribute("aria-label", options.verb || "");
  }

  /** The prompt chip: `{ text, key, progress, blocked }`. */
  class Prompt {
    constructor(root) {
      this.root = root;
      root.classList.add("ac-hand", "ac-prompt");
      this.line = el("span");
      this.bar = el("div", "ac-progress");
      this.bar.appendChild(el("div", "ac-progress__fill"));
      root.append(this.line, this.bar);
    }

    render(state) {
      this.root.hidden = !state;
      if (!state) return;
      this.line.textContent = "";
      if (state.key && !state.blocked) {
        const key = el("kbd");
        key.textContent = state.key;
        this.line.append(key, " ");
      }
      this.line.append(state.text);
      this.root.classList.toggle("is-blocked", !!state.blocked);
      const working = typeof state.progress === "number";
      this.bar.hidden = !working;
      if (working) this.bar.style.setProperty("--ac-progress", String(Math.max(0, Math.min(1, state.progress))));
    }
  }

  /**
   * The game's HUD over the canvas: hotbar, prompt, action button, bubble and flying gains. The
   * Rust client drives it with `apply({ frame, gains })` (see src/gui/web_ui.rs for the shape).
   */
  class GameHud {
    constructor(parent, options) {
      install(parent.ownerDocument);
      this.canvas = options && options.canvas;
      this.root = el("div", "ac-hud");
      this.root.hidden = true;
      const bottom = el("div", "ac-hud__bottom");
      this.prompt = new Prompt(el("div"));
      this.prompt.render(null);
      const bar = el("div");
      this.hotbar = new Hotbar(bar);
      bottom.append(this.prompt.root, bar);
      this.action = actionButton({ verb: "", tool: "hand", key: "E" });
      const actionHolder = el("div", "ac-hud__action");
      actionHolder.appendChild(this.action);
      actionHolder.hidden = true;
      this.actionHolder = actionHolder;
      this.root.append(bottom, actionHolder);
      parent.appendChild(this.root);
      this.gatherHeld = false;
      holdButton(this.action, (held) => (this.gatherHeld = held), { refocus: this.canvas });
      this.slots = [];
      this.inFlight = new Map();
    }

    apply(message) {
      if (message.frame) this.frame(message.frame);
      for (const gain of message.gains || []) this.gain(gain);
    }

    frame(frame) {
      this.root.hidden = !frame.visible;
      this.root.classList.toggle("is-touch", !!frame.touch);
      this.root.style.setProperty("--ac-slots", String(frame.slots.length || 1));
      this.slots = frame.slots;
      this.hotbar.render(this.shownSlots());
      const prompt = frame.prompt;
      this.prompt.render(
        prompt && {
          text: prompt.text,
          key: "E",
          progress: prompt.progress,
          blocked: prompt.blocked,
        },
      );
      const canAct = !!prompt && !prompt.blocked;
      this.actionHolder.hidden = !canAct;
      if (canAct) setAction(this.action, { verb: prompt.verb, tool: prompt.tool });
      this.action.classList.toggle("is-working", canAct && typeof prompt.progress === "number");
      if (frame.note) this.note(frame.note);
    }

    /** The slots as shown: counts still in the air are not in their slot yet. */
    shownSlots() {
      return this.slots.map((stack) => {
        if (!stack) return null;
        const pending = this.inFlight.get(stack.item) || 0;
        return pending ? { ...stack, count: Math.max(0, stack.count - pending) } : stack;
      });
    }

    gain(gain) {
      const x = gain.x * global.innerWidth;
      const y = gain.y * global.innerHeight;
      bubble(this.root, { x, y: y - 40, amount: gain.amount, item: gain.item, name: gain.name });
      this.inFlight.set(gain.item, (this.inFlight.get(gain.item) || 0) + gain.amount);
      this.hotbar.render(this.shownSlots());
      const to = this.hotbar.slotFor(gain.item);
      fly({
        from: { x, y },
        to,
        amount: gain.amount,
        item: gain.item,
        onLand: () => {
          const left = (this.inFlight.get(gain.item) || 0) - gain.amount;
          if (left > 0) this.inFlight.set(gain.item, left);
          else this.inFlight.delete(gain.item);
          this.hotbar.render(this.shownSlots());
          this.hotbar.bump(this.hotbar.slotFor(gain.item));
        },
      });
    }

    note(text) {
      if (this.lastNote === text && Date.now() - this.lastNoteAt < 1600) return;
      this.lastNote = text;
      this.lastNoteAt = Date.now();
      const bar = this.hotbar.root.getBoundingClientRect();
      bubble(this.root, { x: bar.left + bar.width / 2, y: bar.top - 70, text, warning: true });
    }
  }

  /** Mounts the game's HUD into `parent`, or `null` if the page cannot host it. */
  function mountGameHud(parent, options) {
    try {
      return new GameHud(parent || document.body, options);
    } catch {
      return null;
    }
  }

  global.ArmadaUI = {
    install,
    itemIcon,
    icon,
    toolIcon,
    hit,
    replay,
    Hotbar,
    Prompt,
    bubble,
    fly,
    holdButton,
    actionButton,
    setAction,
    GameHud,
    mountGameHud,
  };
})(window);
