tell application "Notes"
    set targetFolder to folder "Blog"
    
    repeat with theNote in notes in targetFolder
        -- Get note name
        set theNoteName to name of theNote
        
        -- Get unique ID
        set theID to id of theNote
        
        -- Get timestamps
        set creationDate to creation date of theNote
        set modificationDate to modification date of theNote

        -- Get note body
        set theNoteBody to body of theNote
        log theNoteBody
        
        -- Log everything
        log theNoteName
        log "ID: " & theID
        log "Created: " & creationDate
        log "Modified: " & modificationDate
        log theNoteBody
        log "----"
    end repeat
end tell
