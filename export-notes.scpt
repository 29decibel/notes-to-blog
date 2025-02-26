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
            set currentNoteTitle to the name of currentNote
            set currentNoteBody to the body of currentNote

            log "Exporting note: " & currentNoteTitle

            set allowedChars to "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- "
            set cleanTitle to ""
            repeat with i from 1 to length of currentNoteTitle
                set thisChar to character i of currentNoteTitle
                if thisChar is not in allowedChars and ((ASCII character (0)) ≤ thisChar) and (thisChar < (ASCII character (128))) then
                    set thisChar to "_"
                end if
                set cleanTitle to cleanTitle & thisChar
            end repeat

            set currentNoteFile to currentFolderPath & ":" & cleanTitle & ".html"
            set fileHandle to open for access currentNoteFile with write permission
            write currentNoteBody to fileHandle starting at 0 as «class utf8»
            close access fileHandle

            repeat with currentAttachment in attachments of currentNote
                set thePath to currentFolderPath & ":" & cleanTitle & "_" & (name of currentAttachment)
                try
                    save currentAttachment in file (thePath)
                end try
            end repeat

        end repeat
    end tell
end run
