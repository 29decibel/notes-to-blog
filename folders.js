#!/usr/bin/env osascript -l JavaScript

function run() {
    try {
        const Notes = Application('Notes');
        Notes.includeStandardAdditions = true;
        
        // Ensure Notes is running
        if (!Notes.running()) {
            Notes.activate();
        }
        
        // Get all top-level folders
        const folders = Notes.folders();
        
        // Map folders to a simpler structure with error handling
        const folderData = [];
        folders.forEach(folder => {
            try {
                folderData.push({
                    name: folder.name(),
                    // Some properties might not be accessible, so we wrap them in try-catch
                    id: (() => {
                        try { return folder.id() } 
                        catch(e) { return null }
                    })(),
                    noteCount: (() => {
                        try { return folder.notes().length } 
                        catch(e) { return 0 }
                    })()
                });
            } catch(e) {
                // Skip folders that can't be accessed
                console.log(`Skipped folder: ${e.message}`);
            }
        });
        
        return JSON.stringify({ folders: folderData }, null, 2);
    } catch(e) {
        return JSON.stringify({ 
            error: e.message,
            details: "Make sure Notes app is accessible and you have granted automation permissions"
        }, null, 2);
    }
}
