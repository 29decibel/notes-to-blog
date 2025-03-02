on run argv
    -- Check if we have the right number of arguments
    if (count of argv) is not 2 then
        error "Usage: osascript script.scpt \"FOLDER_NAME\" \"EXPORT_PATH\""
    end if

    set folderName to item 1 of argv
    set exportPath to item 2 of argv

    log "Starting export from folder '" & folderName & "' to path '" & exportPath & "'"

    -- First check if Notes is running and launch if needed
    tell application "System Events"
        set isRunning to (exists process "Notes")
        if not isRunning then
            tell application "Notes" to activate
            -- Wait a bit for Notes to fully launch
            delay 3
        end if
    end tell

    do shell script "mkdir -p " & quoted form of exportPath
    set exportFolderPath to (POSIX file exportPath) as alias

    tell application "Notes"
        -- Get the specified folder
        log "Finding specified Notes folder..."
        set testFolder to first folder whose name is folderName

        tell application "Finder"
            set currentFolderPath to (exportFolderPath & name of testFolder) as text
            if not (exists folder currentFolderPath) then
                make new folder at exportFolderPath with properties {name:name of testFolder}
            end if
        end tell

        set currentNotes to notes of testFolder
        log "Found " & (count of currentNotes) & " notes to export"

        repeat with currentNote in currentNotes
            set noteId to id of currentNote
            set md5Command to "echo -n '" & noteId & "' | md5"
            set md5Hash to do shell script md5Command

            set currentNoteFile to currentFolderPath & ":" & md5Hash & ".html"

            set currentNoteTitle to the name of currentNote
            set currentNoteBody to the body of currentNote

            log "Exporting note: " & currentNoteTitle

            -- set currentNoteFile to currentFolderPath & ":" & cleanTitle & ".html"

            set fileHandle to open for access currentNoteFile with write permission
            write currentNoteBody to fileHandle starting at 0 as «class utf8»
            close access fileHandle

            repeat with currentAttachment in attachments of currentNote
                set thePath to currentFolderPath & ":" & md5Hash & "_" & (name of currentAttachment)
                try
                    save currentAttachment in file (thePath)
                end try
            end repeat

        end repeat
    end tell
end run
