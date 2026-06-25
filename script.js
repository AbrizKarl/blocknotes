/* ===========================================================
   BlockNotes
   A simple notes app themed around blockchain concepts.

   Each note is a "block" containing:
     - index       (its position in the chain)
     - title, body (the actual note content)
     - timestamp   (when it was created/edited)
     - prevHash    (hash of the block before it)
     - hash        (this block's own "hash")

   This is NOT a real blockchain (no mining difficulty, no
   network, no real cryptography) — it's a learning project
   that borrows the chain-of-blocks idea to make a notes app
   more fun to build and look at.
   =========================================================== */

const STORAGE_KEY = 'blocknotes_chain';

let chain = loadChain();

// ---- DOM references ----
const chainContainer = document.getElementById('chainContainer');
const emptyState = document.getElementById('emptyState');
const chainLengthEl = document.getElementById('chainLength');
const noteTitleInput = document.getElementById('noteTitle');
const noteBodyInput = document.getElementById('noteBody');
const charHint = document.getElementById('charHint');
const mineBtn = document.getElementById('mineBtn');
const searchInput = document.getElementById('searchInput');

const editModal = document.getElementById('editModal');
const editTitleInput = document.getElementById('editTitle');
const editBodyInput = document.getElementById('editBody');
const saveEditBtn = document.getElementById('saveEdit');
const cancelEditBtn = document.getElementById('cancelEdit');

let editingId = null; // tracks which block is currently being edited

// ---- Init ----
render(chain);

/* ===========================================================
   Hashing
   A tiny, fast, NON-cryptographic hash just to give each block
   a believable-looking fingerprint. Good enough for a demo —
   do not use this for anything that needs real security.
   =========================================================== */
function fakeHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // keep it a 32-bit int
  }
  // turn it into a hex-looking string and pad it out
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return (hex + hex).slice(0, 16);
}

function computeBlockHash(block) {
  const payload = `${block.index}|${block.title}|${block.body}|${block.timestamp}|${block.prevHash}`;
  return fakeHash(payload);
}

/* ===========================================================
   Storage
   =========================================================== */
function loadChain() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Could not read saved notes:', err);
    return [];
  }
}

function saveChain() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
}

/* ===========================================================
   Chain operations
   =========================================================== */
function mineBlock(title, body) {
  const prevBlock = chain[chain.length - 1];
  const prevHash = prevBlock ? prevBlock.hash : '0'.repeat(16);

  const block = {
    id: crypto.randomUUID(),
    index: chain.length,
    title: title.trim() || 'Untitled block',
    body: body.trim(),
    timestamp: Date.now(),
    prevHash,
    hash: '' // filled in below
  };

  block.hash = computeBlockHash(block);
  chain.push(block);
  saveChain();
  render(chain);
}

function deleteBlock(id) {
  chain = chain.filter(b => b.id !== id);
  // re-index and re-link the remaining blocks so the chain stays valid
  relinkChain();
}

function updateBlock(id, newTitle, newBody) {
  const block = chain.find(b => b.id === id);
  if (!block) return;

  block.title = newTitle.trim() || 'Untitled block';
  block.body = newBody.trim();
  block.timestamp = Date.now();
  block.hash = computeBlockHash(block);

  relinkChain(); // changing this block's hash means everything after it must relink
}

function relinkChain() {
  chain.forEach((block, i) => {
    block.index = i;
    block.prevHash = i === 0 ? '0'.repeat(16) : chain[i - 1].hash;
    block.hash = computeBlockHash(block);
  });
  saveChain();
  render(chain);
}

/* ===========================================================
   Rendering
   =========================================================== */
function render(list) {
  chainLengthEl.textContent = chain.length;
  chainContainer.innerHTML = '';

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  list.forEach((block, i) => {
    if (i > 0) {
      chainContainer.appendChild(makeLinkEl());
    }
    chainContainer.appendChild(makeBlockEl(block));
  });
}

function makeLinkEl() {
  const link = document.createElement('div');
  link.className = 'chain-link';
  return link;
}

function makeBlockEl(block) {
  const el = document.createElement('article');
  el.className = 'block';

  const date = new Date(block.timestamp);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="block-header">
      <h3 class="block-title"></h3>
      <span class="block-index">#${block.index}</span>
    </div>
    <p class="block-body"></p>
    <div class="block-meta">
      <span class="block-hash">${dateStr} · ${timeStr} · <span class="hash-bright">${block.hash}</span></span>
      <div class="block-actions">
        <button class="edit-btn">Edit</button>
        <button class="danger delete-btn">Delete</button>
      </div>
    </div>
  `;

  // set text content via textContent (not innerHTML) to avoid any HTML/script injection
  el.querySelector('.block-title').textContent = block.title;
  el.querySelector('.block-body').textContent = block.body || '(no content)';

  el.querySelector('.edit-btn').addEventListener('click', () => openEditModal(block));
  el.querySelector('.delete-btn').addEventListener('click', () => {
    if (confirm(`Delete block #${block.index} — "${block.title}"? This can't be undone.`)) {
      deleteBlock(block.id);
    }
  });

  return el;
}

/* ===========================================================
   Mining (creating a new note)
   =========================================================== */
mineBtn.addEventListener('click', () => {
  const title = noteTitleInput.value;
  const body = noteBodyInput.value;

  if (!title.trim() && !body.trim()) {
    noteTitleInput.focus();
    return;
  }

  mineBlock(title, body);
  noteTitleInput.value = '';
  noteBodyInput.value = '';
  updateCharHint();
  noteTitleInput.focus();
});

// Allow Ctrl/Cmd + Enter to mine quickly from the textarea
noteBodyInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    mineBtn.click();
  }
});

function updateCharHint() {
  charHint.textContent = `${noteBodyInput.value.length} / 1000`;
}
noteBodyInput.addEventListener('input', updateCharHint);
noteBodyInput.setAttribute('maxlength', '1000');

/* ===========================================================
   Editing
   =========================================================== */
function openEditModal(block) {
  editingId = block.id;
  editTitleInput.value = block.title;
  editBodyInput.value = block.body;
  editModal.classList.remove('hidden');
  editTitleInput.focus();
}

function closeEditModal() {
  editingId = null;
  editModal.classList.add('hidden');
}

saveEditBtn.addEventListener('click', () => {
  if (editingId) {
    updateBlock(editingId, editTitleInput.value, editBodyInput.value);
  }
  closeEditModal();
});

cancelEditBtn.addEventListener('click', closeEditModal);

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModal.classList.contains('hidden')) {
    closeEditModal();
  }
});

/* ===========================================================
   Search / filter
   =========================================================== */
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    render(chain);
    return;
  }

  const filtered = chain.filter(b =>
    b.title.toLowerCase().includes(query) ||
    b.body.toLowerCase().includes(query)
  );
  render(filtered);
});