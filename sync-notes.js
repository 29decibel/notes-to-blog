import { exec } from "child_process";
import { promisify } from "util";
import { Database } from "bun:sqlite";
import { readFile, unlink, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const execAsync = promisify(exec);
const ATTACHMENTS_DIR = "attachments";

// Ensure attachments directory exists
async function ensureAttachmentsDir() {
  if (!existsSync(ATTACHMENTS_DIR)) {
    await mkdir(ATTACHMENTS_DIR);
  }
}

// Add this mapping for file extensions
const MIME_TO_EXT = {
  png: "png",
  jpeg: "jpg",
  jpg: "jpg",
  gif: "gif",
  "x-adobe-dng": "dng",
  dng: "dng",
  // add more formats as needed
};

// Extract and save base64 images, return updated content
async function processBase64Images(content, noteId) {
  const base64Regex = /data:image\/([-\w.]+);base64,([^"'\s]+)/g;
  const noteDir = path.join(ATTACHMENTS_DIR, noteId);

  // Ensure note-specific directory exists
  if (!existsSync(noteDir)) {
    await mkdir(noteDir, { recursive: true });
  }

  let match;
  let updatedContent = content;
  let counter = 1;

  while ((match = base64Regex.exec(content)) !== null) {
    const [fullMatch, mimeSubtype, base64Data] = match;

    // Get the appropriate file extension
    const ext = MIME_TO_EXT[mimeSubtype.toLowerCase()] || mimeSubtype;

    // Create filename
    const filename = `image_${counter}.${ext}`;
    const filePath = path.join(noteDir, filename);
    const relativePath = path.join(noteId, filename);

    // Save image
    try {
      await writeFile(filePath, Buffer.from(base64Data, "base64"));

      // Replace base64 data with local file reference
      updatedContent = updatedContent.replace(
        fullMatch,
        `file://${relativePath}`,
      );

      console.log(`Saved ${ext} image: ${filename}`);

      counter++;
    } catch (error) {
      console.error(`Failed to save image ${filename}:`, error);
    }
  }

  return updatedContent;
}

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

async function saveNotesToDatabase(db, notesData, folderName) {
  // First process all images and collect the results
  const processedNotes = await Promise.all(
    notesData.map(async (note) => ({
      ...note,
      body: await processBase64Images(note.body, note.id),
    })),
  );

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO notes (id, name, created, modified, body, folder_name) VALUES ($id, $name, $created, $modified, $body, $folder_name)",
  );

  const tx = db.transaction(async (notes) => {
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

  tx(processedNotes);
}

export async function syncNotes(notesFolder) {
  await checkOsascript();
  const db = initializeDatabase();

  await ensureAttachmentsDir();

  try {
    // First get metadata of all notes
    console.log(`Checking notes in folder "${notesFolder}"...`);
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

    console.log("Processing attachments...");
    await saveNotesToDatabase(db, notesData.notes, notesData.name);

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

function listNotes(db) {
  const query = db.prepare(`
    SELECT
      name as title,
      created,
      modified,
      LENGTH(body) as content_size,
      folder_name
    FROM notes
    ORDER BY modified DESC
  `);

  const notes = query.all();

  console.log("\nNotes in database:");
  console.log("=================");

  notes.forEach((note) => {
    // Convert content size to KB or MB
    const size =
      note.content_size > 1024 * 1024
        ? `${(note.content_size / (1024 * 1024)).toFixed(2)} MB`
        : `${(note.content_size / 1024).toFixed(2)} KB`;

    // Format dates
    const modified = new Date(note.modified).toLocaleString();
    const created = new Date(note.created).toLocaleString();

    console.log(`
Title: ${note.title}
Folder: ${note.folder_name}
Created: ${created}
Modified: ${modified}
Content Size: ${size}
-------------------`);
  });

  console.log(`\nTotal notes: ${notes.length}`);
}

if (import.meta.main) {
  const db = initializeDatabase();

  const command = process.argv[2];

  if (command === "list") {
    listNotes(db);
    db.close();
  } else {
    const folderName = command || "Blog";
    console.log(`Starting sync for folder: ${folderName}`);
    await syncNotes(folderName);
  }
}
