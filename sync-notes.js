import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function checkOsascript() {
  try {
    await execAsync("which osascript");
    return true;
  } catch (error) {
    console.error("Error: osascript is not installed on this system");
    process.exit(1);
  }
}

// make sure not using single quote in this script string
const appleScript = (folderName) => {
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

export async function syncNotes(notesFolder) {
  // Check if osascript exists first
  await checkOsascript();

  // Construct the command
  const command = `osascript -l JavaScript -e '${appleScript(notesFolder)}' > blog.json`;

  console.log(
    `Syncing Apple notes folder: ${notesFolder}. This may take a while..`,
  );

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.error(`Command stderr: ${stderr}`);
      process.exit(1);
    }

    console.log("Successfully synced notes to blog.json");
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    process.exit(1);
  }
}
