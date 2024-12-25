#!/usr/bin/env osascript -l JavaScript

function run() {
  const Notes = Application('Notes');
  const blogFolder = Notes.folders.whose({ name: "Blog" })[0];

  // Get all notes from the folder
  const notes = blogFolder.notes();

  // Map notes to a clean data structure
  const notesData = notes.map(note => ({
    name: note.name(),
    id: note.id(),
    created: note.creationDate().toISOString(), // Convert date to ISO string format
    modified: note.modificationDate().toISOString(),
    body: note.body()
  }));

  // Output JSON directly
  return JSON.stringify({ notes: notesData }, null, 2);
}
