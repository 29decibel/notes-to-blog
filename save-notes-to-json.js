#!/usr/bin/env osascript -l JavaScript
function run(argv) {
  const folderName = argv[0] || "Blog"; // Use first argument or default to "Blog"
  const Notes = Application("Notes");
  const blogFolder = Notes.folders.whose({ name: folderName })[0];

  // Get all notes from the folder
  const notes = blogFolder.notes();

  // Map notes to a clean data structure
  const notesData = notes.map((note) => ({
    name: note.name(),
    id: note.id(),
    created: note.creationDate().toISOString(),
    modified: note.modificationDate().toISOString(),
    body: note.body(),
  }));

  // Output JSON directly
  return JSON.stringify({ notes: notesData, name: folderName }, null, 2);
}
