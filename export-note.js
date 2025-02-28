function run(argv) {
  // Check if we have the right number of arguments
  if (argv.length !== 2) {
    throw new Error(
      'Usage: osascript -l JavaScript script.js "FOLDER_NAME" "EXPORT_PATH"',
    );
  }

  /**
   *
   * @param {String | null} filename
   * @returns {String} extension name
   */
  function getFileExtension(filename) {
    if (!filename) {
      return "";
    }

    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  const folderName = argv[0];
  const exportPath = argv[1];
  console.log(
    "Starting export from folder '" +
      folderName +
      "' to path '" +
      exportPath +
      "'",
  );

  // First check if Notes is running and launch if needed
  const isRunning = Application("System Events")
    .processes.byName("Notes")
    .exists();
  if (!isRunning) {
    Application("Notes").activate();
    // Wait a bit for Notes to fully launch
    delay(3);
  }

  // Use app "System Events" for shell commands
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.doShellScript("mkdir -p " + JSON.stringify(exportPath));

  const Notes = Application("Notes");

  // Get the specified folder
  console.log("Finding specified Notes folder...");
  const testFolder = Notes.folders.whose({ name: folderName })[0];

  const Finder = Application("Finder");
  const currentFolderPath = exportPath + "/" + testFolder.name();

  if (!Finder.exists(Path(currentFolderPath))) {
    Finder.make({
      new: "folder",
      at: Path(exportPath),
      withProperties: { name: testFolder.name() },
    });
  }

  const currentNotes = testFolder.notes();
  console.log("Found " + currentNotes.length + " notes to export");

  for (let i = 0; i < currentNotes.length; i++) {
    const currentNote = currentNotes[i];
    const noteId = currentNote.id();
    const md5Hash = app
      .doShellScript("echo -n '" + noteId.replace(/'/g, "'\\''") + "' | md5")
      .trim();
    const currentNoteFile = currentFolderPath + "/" + md5Hash + ".html";
    const currentNoteTitle = currentNote.name();
    const currentNoteBody = currentNote.body();

    console.log("Exporting note: " + currentNoteTitle);

    console.log("Writing note to file: " + currentNoteFile);

    // Handle large note bodies with NSFileManager
    const nsString = $.NSString.alloc.initWithString(currentNoteBody);
    const nsData = nsString.dataUsingEncoding($.NSUTF8StringEncoding);
    const success = nsData.writeToFileAtomically($(currentNoteFile), true);

    if (!success) {
      console.log("Error writing note: " + currentNoteTitle);
    }

    console.log("Getting attachment...");
    const attachments = currentNote.attachments();
    for (let j = 0; j < attachments.length; j++) {
      const currentAttachment = attachments[j];
      const attachmentName = currentAttachment.name();
      // const thePath = currentFolderPath + "/" + md5Hash + "_" + attachmentName;
      const contentId = currentAttachment.contentIdentifier();
      const attachmentHash = app
        .doShellScript(
          "echo -n '" + contentId.replace(/'/g, "'\\''") + "' | md5",
        )
        .trim();

      const thePath =
        currentFolderPath +
        "/" +
        md5Hash +
        "_" +
        attachmentHash +
        "." +
        getFileExtension(attachmentName);

      // log attachment info
      // contentIdentifier
      // modificationDate
      // url
      // console.log("Attachment: " + attachmentName);
      // console.log(
      //   "Content Identifier: " + currentAttachment.contentIdentifier(),
      // );
      // console.log("Modification Date: " + currentAttachment.modificationDate());
      // console.log("URL: " + currentAttachment.url());

      try {
        console.log("Saving ---> " + attachmentName + " " + thePath);
        if (attachmentName) {
          currentAttachment.save({ in: Path(thePath) });
        } else {
          console.log("No attachment name, skipping...");
        }
      } catch (e) {
        console.log("Error saving attachment: " + e);
      }
    }
  }
}
