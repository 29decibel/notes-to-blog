require "mini_exiftool"
require "json"
require "optparse"

class CameraInfoExtractor
  # Tags to extract about the camera and lens
  CAMERA_LENS_TAGS = {
    # Camera information
    make: "Make",
    model: "Model",
    software: "Software",

    # Lens information
    lens_make: "LensMake",
    lens_model: "LensModel",
    lens: "Lens",

    # Camera settings
    aperture: "FNumber",
    focal_length: "FocalLength",
    focal_length_35mm: "FocalLengthIn35mmFormat",
    exposure_time: "ExposureTime",
    shutter_speed: "ShutterSpeed",
    iso: "ISO",
    exposure_program: "ExposureProgram",
    exposure_mode: "ExposureMode",
    exposure_compensation: "ExposureCompensation",
    metering_mode: "MeteringMode",

    # Image details
    width: "ImageWidth",
    height: "ImageHeight",
    megapixels: "Megapixels",

    # Date information
    date_time_original: "DateTimeOriginal",
    create_date: "CreateDate",

    # Other interesting technical data
    flash: "Flash",
    white_balance: "WhiteBalance",
    light_source: "LightSource",
    scene_type: "SceneType",
    scene_capture_type: "SceneCaptureType",
    contrast: "Contrast",
    saturation: "Saturation",
    sharpness: "Sharpness",
    digital_zoom_ratio: "DigitalZoomRatio",
    focus_mode: "FocusMode"
  }

  def initialize(options = {})
    @options = {
      verbose: false,
      # 'readable', 'raw', or 'json'
      format: "readable"
    }.merge(options)
  end

  def extract_info(image_path)
    unless File.exist?(image_path)
      puts("Error: File not found - #{image_path}") if @options[:verbose]
      return {success: false, image_path: image_path, message: "File not found"}
    end

    begin
      # Open image with MiniExiftool
      photo = MiniExiftool.new(image_path)

      # Extract camera and lens info
      info = {}
      CAMERA_LENS_TAGS.each do |key, tag|
        info[key] = photo[tag] if photo.tags.include?(tag)
      end

      # Add a simple camera name for display purposes
      if info[:make] && info[:model]
        info[:camera_display_name] = "#{info[:make]} #{info[:model]}"
      end

      # Add a simple lens name for display purposes
      if info[:lens_model]
        info[:lens_display_name] = info[:lens_model]
      elsif info[:lens]
        info[:lens_display_name] = info[:lens]
      end

      # Add some formatted fields for better display
      if info[:aperture]
        info[:aperture_display] = "f/#{info[:aperture]}"
      end

      if info[:focal_length]
        info[:focal_length_display] = "#{info[:focal_length]}mm"
      end

      if info[:exposure_time]
        # Format exposure time as a fraction if needed
        if info[:exposure_time] < 1
          denominator = (1.0 / info[:exposure_time]).round
          info[:exposure_time_display] = "1/#{denominator}s"
        else
          info[:exposure_time_display] = "#{info[:exposure_time]}s"
        end
      end

      if info[:iso]
        info[:iso_display] = "ISO #{info[:iso]}"
      end

      # Format image dimensions
      if info[:width] && info[:height]
        info[:dimensions] = "#{info[:width]} × #{info[:height]}"
      end

      return {
        success: true,
        image_path: image_path,
        info: info
      }
    rescue => e
      puts("Error processing #{image_path}: #{e.message}") if @options[:verbose]
      return {
        success: false,
        image_path: image_path,
        message: "Failed to extract camera info",
        error: e.message
      }
    end
  end

  def batch_extract_info(image_paths)
    results = []

    image_paths.each do |path|
      result = extract_info(path)
      results << result

      if @options[:verbose]
        status = result[:success] ? "Success" : "Failed"
        puts("Processed #{path}: #{status}")
      end
    end

    results
  end

  # Create a human-readable summary of camera information
  def format_readable_summary(info)
    summary = []
    photo_info = info[:info]

    # Camera and basic information
    if photo_info[:camera_display_name]
      summary << "Camera: #{photo_info[:camera_display_name]}"
    end

    if photo_info[:lens_display_name]
      summary << "Lens: #{photo_info[:lens_display_name]}"
    end

    # Exposure settings section
    exposure_parts = []
    exposure_parts << photo_info[:focal_length_display] if photo_info[:focal_length_display]
    exposure_parts << photo_info[:aperture_display] if photo_info[:aperture_display]
    exposure_parts << photo_info[:exposure_time_display] if photo_info[:exposure_time_display]
    exposure_parts << photo_info[:iso_display] if photo_info[:iso_display]

    if exposure_parts.any?
      summary << "Settings: #{exposure_parts.join(" | ")}"
    end

    # Image information
    if photo_info[:dimensions]
      mp = photo_info[:megapixels] ? "#{photo_info[:megapixels].round(1)}MP" : ""
      summary << "Dimensions: #{photo_info[:dimensions]} #{mp}".strip
    end

    # Date information
    if photo_info[:date_time_original]
      date = photo_info[:date_time_original].is_a?(Time) ? photo_info[:date_time_original].strftime(
        "%B %d, %Y %H:%M:%S"
      ) : photo_info[:date_time_original].to_s
      summary << "Date: #{date}"
    end

    summary.join("\n")
  end

  def self.check_dependencies
    begin
      MiniExiftool.command
      true
    rescue => e
      puts("Error: ExifTool is not installed or not in your PATH")
      puts("Install it with:")
      puts("  - macOS: brew install exiftool")
      puts("  - Ubuntu/Debian: sudo apt-get install libimage-exiftool-perl")
      puts("  - Windows: Download from https://exiftool.org/")
      false
    end
  end
end

# CLI handling if the script is executed directly
if __FILE__ == $PROGRAM_NAME
  options = {
    verbose: false,
    format: "readable"
  }

  # Parse command line options
  OptionParser
    .new do |opts|
      opts.banner = "Usage: ruby camera_info.rb [options] IMAGE_PATH"

      opts.on("--verbose", "Enable verbose output") do
        options[:verbose] = true
      end

      opts.on(
        "--format FORMAT",
        ["readable", "raw", "json"],
        "Output format (readable, raw, json)"
      ) do |format|
        options[:format] = format
      end

      opts.on("-h", "--help", "Show this help message") do
        puts(opts)
        exit
      end
    end
    .parse!

  if ARGV.empty?
    puts("Error: Please provide an image path")
    puts("Usage: ruby camera_info.rb [options] IMAGE_PATH")
    exit(1)
  end

  # Check if dependencies are installed
  unless CameraInfoExtractor.check_dependencies
    exit(1)
  end

  # Process the image
  image_path = ARGV[0]
  extractor = CameraInfoExtractor.new(options)
  result = extractor.extract_info(image_path)

  if result[:success]
    case options[:format]
    when "json"
      puts(JSON.pretty_generate(result))
    when "raw"
      require "pp"

      pp(result)
      # readable
    else
      puts(extractor.format_readable_summary(result))
    end
  else
    puts("❌ Failed to extract camera info: #{result[:message]}")
    exit(1)
  end
end
