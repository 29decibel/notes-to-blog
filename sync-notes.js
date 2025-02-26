import { exec } from "child_process";
import { promisify } from "util";
import { Database } from "bun:sqlite";
import { readFile, unlink } from "fs/promises";

const execAsync = promisify(exec);

function initializeDatabase() {
  const db = new Database("notes.db", { create: true });

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      name TEXT,
      created TEXT,
      modified TEXT,
      body TEXT,
      folder_name TEXT
    )
  `);

  return db;
}

async function checkOsascript() {
  try {
    await execAsync("which osascript");
    return true;
  } catch (error) {
    console.error("Error: osascript is not installed on this system");
    process.exit(1);
  }
}

const metadataScript = (folderName) => {
  return `
  function run(argv) {
    const folderName = "${folderName}";
    const Notes = Application("Notes");
    const blogFolder = Notes.folders.whose({ name: folderName })[0];

    // Get all notes from the folder
    const notes = blogFolder.notes();

    // Map only metadata
    const notesMetadata = notes.map((note) => ({
      id: note.id(),
      modified: note.modificationDate().toISOString()
    }));

    return JSON.stringify(notesMetadata);
  }
  `;
};

const fullExportScript = (folderName) => {
  return `
  function run(argv) {
    const folderName = "${folderName}";
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
  `;
};

async function getNotesMetadata(folderName) {
  const command = `osascript -l JavaScript -e '${metadataScript(folderName)}'`;
  const { stdout } = await execAsync(command);
  return JSON.parse(stdout);
}

function getNoteFromDb(db, noteId) {
  return db.prepare("SELECT modified FROM notes WHERE id = ?").get(noteId);
}

function saveNotesToDatabase(db, notesData, folderName) {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO notes (id, name, created, modified, body, folder_name) VALUES ($id, $name, $created, $modified, $body, $folder_name)",
  );

  const tx = db.transaction((notes) => {
    for (const note of notes) {
      stmt.run({
        $id: note.id,
        $name: note.name,
        $created: note.created,
        $modified: note.modified,
        $body: note.body,
        $folder_name: folderName,
      });
    }
  });

  tx(notesData);
}

export async function syncNotes(notesFolder) {
  await checkOsascript();
  const db = initializeDatabase();

  try {
    // First get metadata of all notes
    console.log("Checking for updates...");
    const metadata = await getNotesMetadata(notesFolder);

    // Filter notes that need updating
    const notesToUpdate = metadata.filter((note) => {
      const dbNote = getNoteFromDb(db, note.id);
      return !dbNote || dbNote.modified !== note.modified;
    });

    if (notesToUpdate.length === 0) {
      console.log("All notes are up to date!");
      db.close();
      return;
    }

    console.log(`Found ${notesToUpdate.length} notes that need updating.`);
    console.log(
      `Syncing Apple notes folder: ${notesFolder}. This may take a while..`,
    );

    const tempOutputFile = `temp_notes_${Date.now()}.json`;
    const command = `osascript -l JavaScript -e '${fullExportScript(notesFolder)}' > ${tempOutputFile}`;

    const { stderr } = await execAsync(command);

    if (stderr) {
      console.error(`Command stderr: ${stderr}`);
      process.exit(1);
    }

    const notesData = JSON.parse(await readFile(tempOutputFile, "utf8"));

    // Filter full export data to only include notes that need updating
    const updateIds = new Set(notesToUpdate.map((n) => n.id));
    notesData.notes = notesData.notes.filter((note) => updateIds.has(note.id));

    saveNotesToDatabase(db, notesData.notes, notesData.name);

    // Clean up
    await unlink(tempOutputFile);

    console.log(
      `Successfully synced ${notesToUpdate.length} notes to SQLite database`,
    );
    db.close();
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    db.close();
    process.exit(1);
  }
}

if (import.meta.main) {
  const folderName = process.argv[2] || "Blog";
  console.log(`Starting sync for folder: ${folderName}`);
  await syncNotes(folderName);
}
