import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

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

export async function syncNotes(notesFolder) {
  // Check if osascript exists first
  await checkOsascript();

  // Construct the command
  const command = `osascript save-notes-to-json.js "${notesFolder}" > blog.json`;

  console.log(`Executing command: ${command}`);

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
