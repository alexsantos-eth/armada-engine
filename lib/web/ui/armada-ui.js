/*
 * Armada UI kit runtime: builds the kit's components and plays its animations. Plain script, no
 * build step; it defines `window.ArmadaUI`.
 *
 * The styles live in armada-ui.css; the guide is lib/docs/UI-KIT.md and the live catalogue is
 * web/ui/index.html. The game does not load this page: scripts/export-ui.cjs renders the kit to
 * sprites (content/ui/) and the client draws its HUD from them on every platform (src/gui/clay/).
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
  <symbol id="ac-tool-hand" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 26V14a3 3 0 0 1 6 0v8V10a3 3 0 0 1 6 0v12V12a3 3 0 0 1 6 0v12-6a3 3 0 0 1 6 0v12c0 8-6 14-13 14-6 0-9-3-12-8l-5-8a3 3 0 0 1 5-4z" fill="#f0c49a"/></g></symbol>
  <symbol id="ac-lock" viewBox="0 0 48 48"><g stroke="#1a120d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M15 22v-6a9 9 0 0 1 18 0v6" fill="none"/>
    <path d="M11 22h26a2 2 0 0 1 2 2v14a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V24a2 2 0 0 1 2-2z" fill="#f4b934"/>
    <path d="M24 29v5" stroke-width="3"/></g></symbol>
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

  /** The tool each family of tools is drawn with in the kit's own pages (the first tool of it). */
  const KIND_TOOL = { axe: "flint_axe", pickaxe: "stone_pickaxe", net: "fiber_net" };

  /** A tool's icon: the rendered, inked sprite of the tool (an id of items.json, or a family
   *  such as `axe`), or the drawn hand for none. */
  function toolIcon(tool, className) {
    const name = KIND_TOOL[tool] || tool || "hand";
    if (name !== "hand") return icon(name, `ac-tool ${className || ""}`.trim());
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", `ac-icon ${className || ""}`.trim());
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#ac-tool-${tool || "hand"}`);
    svg.appendChild(use);
    return svg;
  }

  /** A kit symbol that is not a tool, such as the sprint lock (`lock`). */
  function symbolIcon(name, className) {
    const svg = toolIcon("hand", className);
    svg.firstChild.setAttribute("href", `#ac-${name}`);
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
    const old = button.querySelector(".ac-action__icon");
    if (old && options.tool !== undefined) old.replaceWith(toolIcon(options.tool, "ac-action__icon"));
    button._acLabel.textContent = options.verb || "";
    button.setAttribute("aria-label", options.verb || "");
  }

  global.ArmadaUI = {
    install,
    itemIcon,
    icon,
    toolIcon,
    symbolIcon,
    hit,
    replay,
    Hotbar,
    bubble,
    fly,
    holdButton,
    actionButton,
    setAction,
  };
})(window);
