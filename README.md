# BlockNotes

A simple notes app with a blockchain theme. Built as a practice project for learning Git and GitHub.

Each note is shown as a "block" in a chain. When you save a note, it gets a short hash and links to the block before it. This is just a visual idea borrowed from blockchain — there's no real cryptography or network involved.

## Features

- Create notes (called "mining a block")
- Edit notes
- Delete notes
- Search notes
- Notes are saved in the browser using localStorage, so they stay after you close the tab

## Files

- `index.html` - page structure
- `style.css` - styling
- `script.js` - app logic (storage, rendering, events)

## Running it

Open `index.html` in a browser. No installation needed.

## Why I built this

Practice project for:
- Vanilla JavaScript and the DOM
- localStorage
- Basic Git and GitHub workflow