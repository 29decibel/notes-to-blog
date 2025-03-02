#!/usr/bin/env ruby
require "sqlite3"
require "json"
require "fileutils"
require "base64"
require "date"

class NotesSync
  ATTACHMENTS_DIR = "attachments"

  MIME_TO_EXT = {
    "png" => "png",
    "jpeg" => "jpg",
    "jpg" => "jpg",
    "gif" => "gif",
    "x-adobe-dng" => "dng",
    "dng" => "dng"
    # Add more formats as needed
  }

  def initialize
    @db = initialize_database
  end

  def ensure_attachments_dir
    FileUtils.mkdir_p(ATTACHMENTS_DIR) unless Dir.exist?(ATTACHMENTS_DIR)
  end

  def process_base64_images(content, note_id)
    note_dir = File.join(ATTACHMENTS_DIR, note_id)

    # Ensure note-specific directory exists
    FileUtils.mkdir_p(note_dir) unless Dir.exist?(note_dir)

    updated_content = content
    counter = 1
    extracted_images = []

    # Find and process base64 images
    content.scan(/data:image\/([-\w.]+);base64,([^"'\s]+)/) do |mime_subtype, base64_data|
      # Get the appropriate file extension
      ext = MIME_TO_EXT[mime_subtype.downcase] || mime_subtype

      # Create filename
      filename = "image_#{counter}.#{ext}"
      file_path = File.join(note_dir, filename)
      relative_path = File.join(note_id, filename)

      # Save image
      begin
        File.open(file_path, "wb") do |file|
          file.write(Base64.decode64(base64_data))
        end

        # Replace base64 data with local file reference
        updated_content = updated_content.gsub(
          "data:image/#{mime_subtype};base64,#{base64_data}",
          "file://#{relative_path}"
        )

        # Add image info to the extracted list
        extracted_images <<
          {
            original_index: counter,
            filename: filename,
            path: relative_path,
            mime_type: "image/#{mime_subtype}"
          }

        puts("Saved #{ext} image: #{filename}")
        counter += 1
      rescue => e
        puts("Failed to save image #{filename}: #{e.message}")
      end
    end

    {updated_content: updated_content, extracted_images: extracted_images}
  end

  def initialize_database
    db = SQLite3::Database.new("notes.db")
    db.results_as_hash = true

    db.execute(
      <<-SQL
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        name TEXT,
        created TEXT,
        modified TEXT,
        body TEXT,
        folder_name TEXT,
        images TEXT
      )
      SQL
    )

    db
  end

  def check_osascript
    system("which osascript", out: File::NULL)
    unless $?.success?
      puts("Error: osascript is not installed on this system")
      exit(1)
    end

    true
  end

  def metadata_script(folder_name)
    <<~SCRIPT
      function run(argv) {
        const folderName = "#{folder_name}";
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
    SCRIPT
  end

  def full_export_script(folder_name)
    <<~SCRIPT
      function run(argv) {
        const folderName = "#{folder_name}";
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
    SCRIPT
  end

  def get_notes_metadata(folder_name)
    command = "osascript -l JavaScript -e '#{metadata_script(folder_name)}'"
    stdout = `#{command}`
    JSON.parse(stdout)
  end

  def get_note_from_db(note_id)
    stmt = @db.prepare("SELECT modified FROM notes WHERE id = ?")
    stmt.bind_param(1, note_id)
    result = stmt.execute.next
    stmt.close
    result
  end

  def save_notes_to_database(notes_data, folder_name)
    # Process all images and collect the results
    processed_notes = notes_data.map do |note|
      result = process_base64_images(note["body"], note["id"])
      note["body"] = result[:updated_content]
      note["images"] = result[:extracted_images].to_json
      note
    end

    # Insert or replace the notes in the database
    @db.transaction do
      processed_notes.each do |note|
        @db.execute(
          "INSERT OR REPLACE INTO notes (id, name, created, modified, body, folder_name, images) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [note["id"], note["name"], note["created"], note["modified"], note["body"], folder_name, note["images"]]
        )
      end
    end
  end

  def sync_notes(notes_folder)
    check_osascript
    ensure_attachments_dir

    begin
      # First get metadata of all notes
      puts("Checking notes in folder \"#{notes_folder}\"...")
      metadata = get_notes_metadata(notes_folder)

      # Filter notes that need updating
      notes_to_update = metadata.select do |note|
        db_note = get_note_from_db(note["id"])
        !db_note || db_note["modified"] != note["modified"]
      end

      if notes_to_update.empty?
        puts("All notes are up to date!")
        return
      end

      puts("Found #{notes_to_update.size} notes that need updating.")
      puts("Syncing Apple notes folder: #{notes_folder}. This may take a while..")

      temp_output_file = "temp_notes_#{Time.now.to_i}.json"
      command = "osascript -l JavaScript -e '#{full_export_script(notes_folder)}' > #{temp_output_file}"

      system(command)
      unless $?.success?
        puts("Command failed with status: #{$?.exitstatus}")
        exit(1)
      end

      notes_data = JSON.parse(File.read(temp_output_file))

      # Filter full export data to only include notes that need updating
      update_ids = notes_to_update.map { |n| n["id"] }
      notes_data["notes"].select! { |note| update_ids.include?(note["id"]) }

      puts("Processing attachments...")
      save_notes_to_database(notes_data["notes"], notes_data["name"])

      # Clean up
      File.unlink(temp_output_file)

      puts("Successfully synced #{notes_to_update.size} notes to SQLite database")
    rescue => e
      puts("Error executing command: #{e.message}")
      puts(e.backtrace)
      exit(1)
    end
  end

  def list_notes
    notes = @db.execute(
      "
      SELECT
        name as title,
        created,
        modified,
        LENGTH(body) as content_size,
        folder_name,
        images
      FROM notes
      ORDER BY modified DESC
    "
    )

    puts("\nNotes in database:")
    puts("=================")

    notes.each do |note|
      # Convert content size to KB or MB
      size = if note["content_size"] > 1024 * 1024
        "#{(note["content_size"] / (1024.0 * 1024)).round(2)} MB"
      else
        "#{(note["content_size"] / 1024.0).round(2)} KB"
      end

      # Format dates
      modified = DateTime.parse(note["modified"]).strftime("%Y-%m-%d %H:%M:%S")
      created = DateTime.parse(note["created"]).strftime("%Y-%m-%d %H:%M:%S") if note["created"]

      # Parse and count images
      image_count = 0
      begin
        images = JSON.parse(note["images"] || "[]")
        image_count = images.size
      rescue => e
        puts("Error parsing images for note \"#{note["title"]}\": #{e.message}")
      end

      puts(
        "" \
          "
Title: #{note["title"]}
Folder: #{note["folder_name"]}
Created: #{created}
Modified: #{modified}
Content Size: #{size}
Images: #{image_count}
-------------------" \
          ""
      )
    end

    puts("\nTotal notes: #{notes.size}")
  end

  def close
    @db.close if @db
  end
end

if __FILE__ == $PROGRAM_NAME
  sync = NotesSync.new

  command = ARGV[0]

  if command == "list"
    sync.list_notes
  else
    folder_name = command || "Blog"
    puts("Starting sync for folder: #{folder_name}")
    sync.sync_notes(folder_name)
  end

  sync.close
end
