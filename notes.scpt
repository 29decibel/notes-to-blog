tell application "Notes"
  repeat with theNote in notes
    set theNoteName to name of theNote
    log theNoteName

    set theNoteBody to body of theNote
    log theNoteBody

    log "----"
  end repeat
end tell
