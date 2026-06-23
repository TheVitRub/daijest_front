// ============================================================
//   EVENTS — delegated event handling
// ============================================================
// One set of listeners on a root node. Interactive elements declare:
//   data-act="fnName"             handler name (looked up in actions.fns)
//   data-args='["a","b",2]'       JSON args; placeholders resolved at call:
//                                   $value $checked $files $event $this
//   data-self                     (click) only fire when target === element
//   data-counter / data-max       (input) update a char-counter element
//   data-keydown='{"Enter":"fn"}' (keydown) key -> action name
import { fns } from "./actions.js";

function resolveArgs(raw, el, event) {
  if (!raw) return [];
  return JSON.parse(raw).map((a) => {
    switch (a) {
      case "$value":   return el.value;
      case "$checked": return el.checked;
      case "$files":   return el.files;
      case "$event":   return event;
      case "$this":    return el;
      default:         return a;
    }
  });
}

function run(name, el, event) {
  const fn = fns[name];
  if (typeof fn !== "function") { console.warn("delegation: unknown action", name); return; }
  fn(...resolveArgs(el.dataset.args, el, event));
}

function updateCounter(el) {
  const id = el.dataset.counter;
  if (!id) return;
  const c = document.getElementById(id);
  if (c) c.textContent = `${(el.value || "").length}/${el.dataset.max || ""}`;
}

export function attachDelegatedEvents(root = document) {
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if ("self" in el.dataset && e.target !== el) return; // backdrop: only the element itself
    run(el.dataset.act, el, e);
  });

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !("act" in el.dataset || "counter" in el.dataset)) return;
    if ("act" in el.dataset) run(el.dataset.act, el, e);
    updateCounter(el);
  });

  root.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !("act" in el.dataset)) return;
    run(el.dataset.act, el, e);
  });

  root.addEventListener("submit", (e) => {
    const el = e.target.closest("form[data-act]");
    if (!el) return;
    e.preventDefault();
    run(el.dataset.act, el, e);
  });

  root.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-keydown]");
    if (!el) return;
    const map = JSON.parse(el.dataset.keydown);
    const name = map[e.key];
    if (name) run(name, el, e);
  });

  // Drag & drop: data-dragstart/dragend/dragover/drop = action name,
  // data-dargs = JSON positional args (the DOM event is passed first).
  for (const type of ["dragstart", "dragend", "dragover", "drop"]) {
    root.addEventListener(type, (e) => {
      const el = e.target.closest(`[data-${type}]`);
      if (!el) return;
      const fn = fns[el.dataset[type]];
      if (typeof fn !== "function") return;
      const args = el.dataset.dargs ? JSON.parse(el.dataset.dargs) : [];
      // Under delegation e.currentTarget is the root; expose the matched
      // element so handlers can reference it (they use e.delegateTarget).
      e.delegateTarget = el;
      fn(e, ...args);
    });
  }

  // Drag handles: data-draghandle="<ancestor selector>" toggles that
  // ancestor's draggable flag while the handle is pressed.
  const setDraggable = (e, on) => {
    const h = e.target.closest("[data-draghandle]");
    if (!h) return;
    const node = h.closest(h.dataset.draghandle);
    if (node) node.draggable = on;
  };
  root.addEventListener("mousedown", (e) => setDraggable(e, true));
  root.addEventListener("mouseup", (e) => setDraggable(e, false));
}
