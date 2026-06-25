// BlockNotes - a simple notes app
// Each note is called a "block" and has a hash based on its content.

// Load saved notes from the browser, or start with an empty list
let notes = JSON.parse(localStorage.getItem("notes")) || [];

// Get references to the HTML elements we need
const noteTitle = document.getElementById("noteTitle");
const noteBody = document.getElementById("noteBody");
const addBtn = document.getElementById("addBtn");
const notesList = document.getElementById("notesList");
const noteCount = document.getElementById("noteCount");
const emptyMessage = document.getElementById("emptyMessage");
const searchInput = document.getElementById("searchInput");

const editBox = document.getElementById("editBox");
const editTitle = document.getElementById("editTitle");
const editBody = document.getElementById("editBody");
const saveEditBtn = document.getElementById("saveEditBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

let editingIndex = null; // keeps track of which note is being edited

// Show the notes on the page when it first loads
showNotes(notes);

// Makes a simple fake "hash" string from the note's text.
// This is NOT a real secure hash, just for the blockchain theme.
function makeHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000000;
  }
  return hash.toString(16); // turn it into letters/numbers
}

// Save the notes array into the browser's storage
function saveNotes() {
  localStorage.setItem("notes", JSON.stringify(notes));
}

// Show a list of notes on the page
function showNotes(list) {
  notesList.innerHTML = ""; // clear what's currently shown
  noteCount.textContent = notes.length;

  if (list.length === 0) {
    emptyMessage.classList.remove("hidden");
  } else {
    emptyMessage.classList.add("hidden");
  }

  list.forEach((note, index) => {
    const block = document.createElement("div");
    block.className = "note-block";

    block.innerHTML = `
      <p class="note-title"></p>
      <p class="note-body"></p>
      <p class="note-hash">Block #${index} - hash: ${note.hash}</p>
      <div class="note-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    // Use textContent so any text the user types is shown safely
    block.querySelector(".note-title").textContent = note.title;
    block.querySelector(".note-body").textContent = note.body;

    // When Edit is clicked, open the edit box for this note
    block.querySelector(".edit-btn").addEventListener("click", () => {
      openEditBox(index);
    });

    // When Delete is clicked, remove this note
    block.querySelector(".delete-btn").addEventListener("click", () => {
      notes.splice(index, 1);
      saveNotes();
      showNotes(notes);
    });

    notesList.appendChild(block);
  });
}

// Add a new note when the button is clicked
addBtn.addEventListener("click", () => {
  const title = noteTitle.value.trim();
  const body = noteBody.value.trim();

  if (title === "" && body === "") {
    return; // don't add an empty note
  }

  const newNote = {
    title: title || "Untitled",
    body: body,
    hash: makeHash(title + body + Date.now())
  };

  notes.push(newNote);
  saveNotes();
  showNotes(notes);

  // clear the form
  noteTitle.value = "";
  noteBody.value = "";
});

// Open the edit box and fill it with the note's current info
function openEditBox(index) {
  editingIndex = index;
  editTitle.value = notes[index].title;
  editBody.value = notes[index].body;
  editBox.classList.remove("hidden");
}

// Save changes made in the edit box
saveEditBtn.addEventListener("click", () => {
  const note = notes[editingIndex];
  note.title = editTitle.value.trim() || "Untitled";
  note.body = editBody.value.trim();
  note.hash = makeHash(note.title + note.body + Date.now());

  saveNotes();
  showNotes(notes);
  editBox.classList.add("hidden");
});

// Close the edit box without saving
cancelEditBtn.addEventListener("click", () => {
  editBox.classList.add("hidden");
});

// Search/filter notes as the user types
searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase();

  const filtered = notes.filter(note =>
    note.title.toLowerCase().includes(query) ||
    note.body.toLowerCase().includes(query)
  );

  showNotes(filtered);
});