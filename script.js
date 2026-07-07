// =============================================================
// BlockNotes — premium edition
// Each note is a "block" in a visible chain. Blocks can be plain
// text, checklists, or runnable JS snippets. Everything autosaves
// with a debounce, and there's a command palette for quick actions.
// =============================================================

// ---------- Config -------------------------------------------------
// Flip BACKEND.enabled to true and fill in a Supabase project to
// sync blocks to a real database instead of (or in addition to)
// localStorage. Left off by default so the app works with zero setup.
const BACKEND = {
  enabled: false,
  url: "",       // e.g. "https://xxxx.supabase.co"
  anonKey: "",   // your Supabase anon/public key
  table: "notes"
};

let supabaseClient = null;
if (BACKEND.enabled && BACKEND.url && BACKEND.anonKey && window.supabase) {
  supabaseClient = window.supabase.createClient(BACKEND.url, BACKEND.anonKey);
}

// ---------- State ----------------------------------------------------
let notes = loadNotes();
let activeType = "text";
let editingId = null;
let checklistDraft = [];
let dragId = null;
let saveTimer = null;

// ---------- DOM refs ---------------------------------------------------
const $ = (id) => document.getElementById(id);

const noteTitle = $("noteTitle");
const noteBody = $("noteBody");
const checklistEditor = $("checklistEditor");
const codeEditor = $("codeEditor");
const codeBody = $("codeBody");
const codeLang = $("codeLang");
const addBtn = $("addBtn");
const notesList = $("notesList");
const noteCount = $("noteCount");
const emptyMessage = $("emptyMessage");
const searchInput = $("searchInput");
const composerHint = $("composerHint");
const syncStatus = $("syncStatus");

const editOverlay = $("editOverlay");
const editBox = $("editBox");
const editTitle = $("editTitle");
const editBody = $("editBody");
const saveEditBtn = $("saveEditBtn");
const cancelEditBtn = $("cancelEditBtn");
const cancelEditBtn2 = $("cancelEditBtn2");

const cmdkTrigger = $("cmdkTrigger");
const cmdkOverlay = $("cmdkOverlay");
const cmdkInput = $("cmdkInput");
const cmdkResults = $("cmdkResults");

const themeToggle = $("themeToggle");
const toastStack = $("toastStack");

// =============================================================
// Persistence — debounced autosave with a visible sync status
// =============================================================

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem("blocknotes_v2")) || [];
  } catch {
    return [];
  }
}

function scheduleSave() {
  setSyncState("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commitSave, 500);
}

async function commitSave() {
  try {
    localStorage.setItem("blocknotes_v2", JSON.stringify(notes));

    if (supabaseClient) {
      // Optional real backend sync — mirrors the whole chain.
      await supabaseClient.from(BACKEND.table).upsert(
        notes.map((n) => ({ id: n.id, payload: n }))
      );
    }

    setSyncState("saved");
  } catch (err) {
    console.error("Save failed:", err);
    setSyncState("error");
  }
}

function setSyncState(state) {
  syncStatus.dataset.state = state;
  const label = syncStatus.querySelector(".sync-label");
  if (state === "saving") label.textContent = "Saving…";
  else if (state === "error") label.textContent = "Save failed";
  else label.textContent = supabaseClient ? "Synced" : "Saved locally";
}

// =============================================================
// Hashing — themed, not cryptographic
// =============================================================

function makeHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(6, "0").slice(0, 6);
}

function prevHashFor(index) {
  return index === 0 ? "000000" : notes[index - 1].hash;
}

// =============================================================
// Toasts
// =============================================================

function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;
  el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  toastStack.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }, 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================
// Composer — type switching
// =============================================================

document.querySelectorAll(".type-tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveType(tab.dataset.type));
});

function setActiveType(type) {
  activeType = type;
  document.querySelectorAll(".type-tab").forEach((t) => t.classList.toggle("active", t.dataset.type === type));

  noteBody.classList.toggle("hidden", type !== "text");
  checklistEditor.classList.toggle("hidden", type !== "checklist");
  codeEditor.classList.toggle("hidden", type !== "code");

  const hints = { text: "Text block", checklist: "Checklist block", code: "Runnable code block" };
  composerHint.textContent = hints[type];

  if (type === "checklist" && checklistDraft.length === 0) {
    addChecklistRow();
  }
}

// checklist rows in composer
function addChecklistRow(value = "") {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
  checklistDraft.push({ id, text: value, done: false });
  renderChecklistEditor();
}

function renderChecklistEditor() {
  checklistEditor.innerHTML = "";
  checklistDraft.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "checklist-row";
    rowEl.innerHTML = `
      <input type="text" placeholder="List item…" value="${escapeHtml(row.text)}">
      <button type="button" class="row-remove" aria-label="Remove item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    `;
    rowEl.querySelector("input").addEventListener("input", (e) => {
      checklistDraft[i].text = e.target.value;
    });
    rowEl.querySelector(".row-remove").addEventListener("click", () => {
      checklistDraft.splice(i, 1);
      if (checklistDraft.length === 0) addChecklistRow();
      else renderChecklistEditor();
    });
    checklistEditor.appendChild(rowEl);
  });

  const addRowBtn = document.createElement("button");
  addRowBtn.type = "button";
  addRowBtn.className = "checklist-add";
  addRowBtn.textContent = "+ Add item";
  addRowBtn.addEventListener("click", () => addChecklistRow());
  checklistEditor.appendChild(addRowBtn);
}

renderChecklistEditor();

// =============================================================
// Add note
// =============================================================

addBtn.addEventListener("click", addNote);

function addNote() {
  const title = noteTitle.value.trim();
  let payload = {};
  let contentForHash = title;

  if (activeType === "text") {
    const body = noteBody.value.trim();
    if (title === "" && body === "") return;
    payload = { body };
    contentForHash += body;
  } else if (activeType === "checklist") {
    const items = checklistDraft.filter((r) => r.text.trim() !== "");
    if (title === "" && items.length === 0) return;
    payload = { items: items.map((r) => ({ text: r.text.trim(), done: false })) };
    contentForHash += items.map((r) => r.text).join("");
  } else if (activeType === "code") {
    const code = codeBody.value.trim();
    if (title === "" && code === "") return;
    payload = { code, lang: codeLang.value };
    contentForHash += code;
  }

  const newNote = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: activeType,
    title: title || "Untitled",
    ...payload,
    hash: makeHash(contentForHash + Date.now()),
    createdAt: Date.now()
  };

  notes.push(newNote);
  scheduleSave();
  showNotes(notes);
  toast("Block added to the chain");

  // reset composer
  noteTitle.value = "";
  noteBody.value = "";
  codeBody.value = "";
  checklistDraft = [];
  addChecklistRow();
  noteTitle.focus();
}

// =============================================================
// Render the chain
// =============================================================

function showNotes(list) {
  notesList.innerHTML = "";
  noteCount.textContent = notes.length;
  emptyMessage.classList.toggle("hidden", list.length !== 0);

  list.forEach((note) => {
    const realIndex = notes.indexOf(note);
    const block = document.createElement("div");
    block.className = "note-block";
    block.draggable = true;
    block.dataset.id = note.id;

    block.innerHTML = `
      <div class="chain-node" title="Drag to reorder">
        <div class="chain-node-dot"></div>
      </div>
      <div class="note-card">
        <div class="note-card-head">
          <p class="note-title"></p>
          <span class="note-type-badge">${note.type}</span>
        </div>
        <div class="note-content"></div>
        <p class="note-hash">Block <span class="hash-chip">#${realIndex}</span> · prev <span class="hash-chip">${prevHashFor(realIndex)}</span> · hash <span class="hash-chip">${note.hash}</span></p>
        <div class="note-actions">
          <button class="pill-btn edit-btn" type="button">Edit</button>
          <button class="pill-btn delete-btn" type="button">Delete</button>
        </div>
      </div>
    `;

    block.querySelector(".note-title").textContent = note.title;
    renderNoteContent(block.querySelector(".note-content"), note);

    block.querySelector(".edit-btn").addEventListener("click", () => openEditBox(note.id));
    block.querySelector(".delete-btn").addEventListener("click", () => deleteNote(note.id));

    // drag & drop reorder
    block.addEventListener("dragstart", () => {
      dragId = note.id;
      requestAnimationFrame(() => block.classList.add("dragging"));
    });
    block.addEventListener("dragend", () => {
      block.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });
    block.addEventListener("dragover", (e) => {
      e.preventDefault();
      block.classList.add("drag-over");
    });
    block.addEventListener("dragleave", () => block.classList.remove("drag-over"));
    block.addEventListener("drop", (e) => {
      e.preventDefault();
      block.classList.remove("drag-over");
      reorderNotes(dragId, note.id);
    });

    notesList.appendChild(block);
  });
}

function renderNoteContent(container, note) {
  if (note.type === "text") {
    const p = document.createElement("p");
    p.className = "note-body";
    p.textContent = note.body || "";
    container.appendChild(p);
  } else if (note.type === "checklist") {
    const ul = document.createElement("ul");
    ul.className = "note-checklist";
    (note.items || []).forEach((item, i) => {
      const li = document.createElement("li");
      li.className = item.done ? "done" : "";
      li.innerHTML = `<span class="box"></span><span class="item-text"></span>`;
      li.querySelector(".item-text").textContent = item.text;
      li.addEventListener("click", () => {
        item.done = !item.done;
        li.classList.toggle("done", item.done);
        scheduleSave();
      });
      ul.appendChild(li);
    });
    container.appendChild(ul);
  } else if (note.type === "code") {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    const pre = document.createElement("pre");
    pre.textContent = note.code || "";
    wrap.appendChild(pre);

    if (note.lang === "javascript") {
      const bar = document.createElement("div");
      bar.className = "code-run-bar";
      bar.innerHTML = `
        <button class="run-btn" type="button">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Run
        </button>
        <span class="code-output"></span>
      `;
      const output = bar.querySelector(".code-output");
      bar.querySelector(".run-btn").addEventListener("click", () => runSnippet(note.code, output));
      wrap.appendChild(bar);
    }
    container.appendChild(wrap);
  }
}

function runSnippet(code, outputEl) {
  const logs = [];
  const fakeConsole = {
    log: (...args) => logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "))
  };
  try {
    // Sandboxed to this closure only — no access to page state beyond a fake console.
    const runner = new Function("console", code);
    runner(fakeConsole);
    outputEl.classList.remove("error");
    outputEl.textContent = logs.length ? logs.join("\n") : "✓ ran with no output";
  } catch (err) {
    outputEl.classList.add("error");
    outputEl.textContent = "✗ " + err.message;
  }
}

function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  scheduleSave();
  showNotes(applyFilter());
  toast("Block removed", "error");
}

function reorderNotes(fromId, toId) {
  if (fromId === toId || !fromId) return;
  const fromIndex = notes.findIndex((n) => n.id === fromId);
  const toIndex = notes.findIndex((n) => n.id === toId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = notes.splice(fromIndex, 1);
  notes.splice(toIndex, 0, moved);
  // re-hash the chain so links stay honest after reordering
  notes.forEach((n, i) => {
    n.hash = makeHash(n.title + JSON.stringify(n.body || n.items || n.code || "") + i + n.createdAt);
  });
  scheduleSave();
  showNotes(applyFilter());
}

// =============================================================
// Edit panel
// =============================================================

function openEditBox(id) {
  editingId = id;
  const note = notes.find((n) => n.id === id);
  editTitle.value = note.title;

  if (note.type === "text") editBody.value = note.body || "";
  else if (note.type === "checklist") editBody.value = (note.items || []).map((i) => i.text).join("\n");
  else if (note.type === "code") editBody.value = note.code || "";

  editOverlay.classList.remove("hidden");
  editBox.classList.remove("hidden");
  editTitle.focus();
}

function closeEditBox() {
  editOverlay.classList.add("hidden");
  editBox.classList.add("hidden");
  editingId = null;
}

[cancelEditBtn, cancelEditBtn2].forEach((btn) => btn.addEventListener("click", closeEditBox));
editOverlay.addEventListener("click", closeEditBox);

saveEditBtn.addEventListener("click", () => {
  const note = notes.find((n) => n.id === editingId);
  if (!note) return;
  note.title = editTitle.value.trim() || "Untitled";

  if (note.type === "text") {
    note.body = editBody.value.trim();
  } else if (note.type === "checklist") {
    const existingDone = {};
    (note.items || []).forEach((i) => (existingDone[i.text] = i.done));
    note.items = editBody.value.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, done: !!existingDone[t] }));
  } else if (note.type === "code") {
    note.code = editBody.value;
  }

  note.hash = makeHash(note.title + JSON.stringify(note.body || note.items || note.code || "") + Date.now());
  scheduleSave();
  showNotes(applyFilter());
  closeEditBox();
  toast("Block updated");
});

// =============================================================
// External APIs — two integrations
//   1. Quotes API      (https://dummyjson.com/quotes/random)
//   2. Dictionary API  (https://api.dictionaryapi.dev)
// Both are free, need no API key, and allow browser requests
// (CORS), so they work on GitHub Pages with zero setup.
// Flow: the API response fills the composer, then the user
// reviews it and presses "Add to chain" like any other block.
// =============================================================

const QUOTE_API = "https://dummyjson.com/quotes/random";
const DICTIONARY_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

const quoteBtn = $("quoteBtn");
const defineBtn = $("defineBtn");
const defineRow = $("defineRow");
const defineInput = $("defineInput");

// --- API #1: random quote -> composer -------------------------------
async function insertRandomQuote() {
  setApiLoading(quoteBtn, true);
  try {
    const res = await fetch(QUOTE_API);
    if (!res.ok) throw new Error(`Quote API responded with ${res.status}`);
    const data = await res.json();

    setActiveType("text");
    noteTitle.value = `Quote — ${data.author}`;
    noteBody.value = `“${data.quote}”\n— ${data.author}`;
    noteBody.focus();
    toast("Quote loaded — review it and add to chain");
  } catch (err) {
    console.error("Quote API failed:", err);
    toast("Couldn't reach the quote API — check your connection", "error");
  } finally {
    setApiLoading(quoteBtn, false);
  }
}

// --- API #2: dictionary lookup -> composer ---------------------------
async function defineWord(rawWord) {
  const word = rawWord.trim().toLowerCase();
  if (!word) return;

  setApiLoading(defineBtn, true);
  try {
    const res = await fetch(DICTIONARY_API + encodeURIComponent(word));
    if (res.status === 404) {
      toast(`No definition found for “${word}”`, "error");
      return;
    }
    if (!res.ok) throw new Error(`Dictionary API responded with ${res.status}`);

    const data = await res.json();
    const entry = data[0];

    // Take up to three meanings: "(noun) a small piece of..."
    const meanings = (entry.meanings || [])
      .slice(0, 3)
      .map((m) => `(${m.partOfSpeech}) ${m.definitions[0].definition}`)
      .join("\n\n");

    const phonetic = entry.phonetic || (entry.phonetics || []).map((p) => p.text).find(Boolean) || "";

    setActiveType("text");
    noteTitle.value = `Define: ${entry.word}`;
    noteBody.value = (phonetic ? phonetic + "\n\n" : "") + meanings;
    noteBody.focus();

    defineInput.value = "";
    defineRow.classList.add("hidden");
    toast(`Definition of “${entry.word}” loaded`);
  } catch (err) {
    console.error("Dictionary API failed:", err);
    toast("Couldn't reach the dictionary API — check your connection", "error");
  } finally {
    setApiLoading(defineBtn, false);
  }
}

// --- shared helpers + wiring -----------------------------------------
function setApiLoading(btn, isLoading) {
  btn.disabled = isLoading;
  btn.classList.toggle("loading", isLoading);
}

function toggleDefineRow(forceOpen = null) {
  const open = forceOpen === null ? defineRow.classList.contains("hidden") : forceOpen;
  defineRow.classList.toggle("hidden", !open);
  if (open) defineInput.focus();
}

quoteBtn.addEventListener("click", insertRandomQuote);
defineBtn.addEventListener("click", () => toggleDefineRow());

defineInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") defineWord(defineInput.value);
  else if (e.key === "Escape") toggleDefineRow(false);
});

// =============================================================
// Search
// =============================================================

function applyFilter() {
  const query = searchInput.value.toLowerCase().trim();
  if (!query) return notes;
  return notes.filter((note) => {
    const haystack = [
      note.title,
      note.body || "",
      note.code || "",
      ...(note.items || []).map((i) => i.text)
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

searchInput.addEventListener("input", () => showNotes(applyFilter()));

// =============================================================
// Theme toggle
// =============================================================

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("blocknotes_theme", theme);
}

applyTheme(localStorage.getItem("blocknotes_theme") || "dark");

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  toast(next === "light" ? "Light mode on" : "Dark mode on");
});

// =============================================================
// Command palette
// =============================================================

function getCommands() {
  return [
    { tag: "action", label: "New text block", run: () => { setActiveType("text"); noteTitle.focus(); } },
    { tag: "action", label: "New checklist block", run: () => { setActiveType("checklist"); noteTitle.focus(); } },
    { tag: "action", label: "New code block", run: () => { setActiveType("code"); noteTitle.focus(); } },
    { tag: "api", label: "Insert random quote", run: insertRandomQuote },
    { tag: "api", label: "Define a word", run: () => toggleDefineRow(true) },
    { tag: "action", label: "Focus search", run: () => searchInput.focus() },
    { tag: "action", label: "Toggle theme", run: () => themeToggle.click() },
    { tag: "action", label: "Export chain as JSON", run: exportJSON },
    { tag: "action", label: "Clear all blocks", run: clearAll }
  ];
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blocknotes-export.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Chain exported");
}

function clearAll() {
  if (notes.length === 0) return toast("Chain is already empty", "error");
  notes = [];
  scheduleSave();
  showNotes(notes);
  toast("All blocks cleared", "error");
}

let cmdkActiveIndex = 0;

function openCmdk() {
  cmdkOverlay.classList.remove("hidden");
  cmdkInput.value = "";
  renderCmdkResults("");
  cmdkInput.focus();
}

function closeCmdk() {
  cmdkOverlay.classList.add("hidden");
}

function renderCmdkResults(query) {
  const q = query.toLowerCase();
  const commandMatches = getCommands().filter((c) => c.label.toLowerCase().includes(q));
  const noteMatches = q ? notes.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 6) : [];

  cmdkResults.innerHTML = "";
  cmdkActiveIndex = 0;

  if (commandMatches.length === 0 && noteMatches.length === 0) {
    cmdkResults.innerHTML = `<div class="cmdk-empty">No matches — try "new", "theme", or a note title</div>`;
    return;
  }

  const items = [
    ...commandMatches.map((c) => ({ label: c.label, tag: "action", onSelect: () => { c.run(); closeCmdk(); } })),
    ...noteMatches.map((n) => ({ label: n.title, tag: n.type, onSelect: () => { openEditBox(n.id); closeCmdk(); } }))
  ];

  items.forEach((item, i) => {
    const el = document.createElement("div");
    el.className = "cmdk-item" + (i === 0 ? " active" : "");
    el.innerHTML = `<span class="cmdk-item-main">${escapeHtml(item.label)}</span><span class="cmdk-item-tag">${item.tag}</span>`;
    el.addEventListener("click", item.onSelect);
    el.addEventListener("mouseenter", () => setCmdkActive(i));
    cmdkResults.appendChild(el);
  });

  cmdkResults._items = items;
}

function setCmdkActive(index) {
  const children = [...cmdkResults.children];
  children.forEach((c) => c.classList.remove("active"));
  if (children[index]) {
    children[index].classList.add("active");
    cmdkActiveIndex = index;
  }
}

cmdkTrigger.addEventListener("click", openCmdk);
cmdkOverlay.addEventListener("click", (e) => { if (e.target === cmdkOverlay) closeCmdk(); });
cmdkInput.addEventListener("input", () => renderCmdkResults(cmdkInput.value));

cmdkInput.addEventListener("keydown", (e) => {
  const items = cmdkResults._items || [];
  if (e.key === "ArrowDown") { e.preventDefault(); setCmdkActive(Math.min(cmdkActiveIndex + 1, items.length - 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setCmdkActive(Math.max(cmdkActiveIndex - 1, 0)); }
  else if (e.key === "Enter") { e.preventDefault(); items[cmdkActiveIndex] && items[cmdkActiveIndex].onSelect(); }
  else if (e.key === "Escape") closeCmdk();
});

document.addEventListener("keydown", (e) => {
  const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
  if (isCmdK) {
    e.preventDefault();
    cmdkOverlay.classList.contains("hidden") ? openCmdk() : closeCmdk();
  } else if (e.key === "Escape") {
    if (!editBox.classList.contains("hidden")) closeEditBox();
  }
});

// =============================================================
// Ambient chain backdrop — a few slow-drifting linked nodes
// =============================================================

function initBackdrop() {
  const canvas = $("bg");
  const ctx = canvas.getContext("2d");
  let w, h, nodes;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeNodes() {
    const count = Math.max(5, Math.min(9, Math.floor(w / 220)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15
    }));
  }

  resize();
  makeNodes();
  window.addEventListener("resize", () => { resize(); makeNodes(); });

  const accent = getComputedStyle(document.documentElement);

  function frame() {
    ctx.clearRect(0, 0, w, h);
    const lineColor = document.documentElement.dataset.theme === "light" ? "180,170,140" : "79,216,196";

    nodes.forEach((n) => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 260) {
          ctx.strokeStyle = `rgba(${lineColor},${0.09 * (1 - dist / 260)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${lineColor},0.5)`;
      ctx.beginPath();
      ctx.arc(nodes[i].x, nodes[i].y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    requestAnimationFrame(frame);
  }
}

// =============================================================
// Boot
// =============================================================

initBackdrop();
setSyncState("saved");
showNotes(notes);