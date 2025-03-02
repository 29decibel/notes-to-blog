require "mini_magick"
require "fileutils"
require "optparse"
require "pathname"
require "tempfile"

class ImageConverter
  # Default output formats
  # Could be 'avif' or 'webp'
  DEFAULT_WEB_FORMAT = "webp"
  # Thumbnail sizes in pixels
  THUMBNAIL_SIZES = [500, 800, 1200]

  def initialize(options = {})
    @options = {
      output_format: DEFAULT_WEB_FORMAT,
      quality: 85,
      thumbnail_sizes: THUMBNAIL_SIZES,
      strip_metadata: true,
      verbose: false,
      output_dir: nil,
      force: false
    }.merge(options)

    # Simply check which tools are available
    check_tools if @options[:verbose]
  end

  # Check available image processing tools
  def check_tools
    puts("Checking available tools:")

    # Check ImageMagick
    if system("which convert > /dev/null 2>&1")
      puts("✓ Found ImageMagick")
    else
      puts("✗ ImageMagick not found")
    end

    # Check GraphicsMagick
    if system("which gm > /dev/null 2>&1")
      puts("✓ Found GraphicsMagick")
    else
      puts("✗ GraphicsMagick not found")
    end

    # Check HEIC support tools
    if system("which heif-convert > /dev/null 2>&1")
      puts("✓ Found heif-convert (for HEIC support)")
    else
      puts("✗ heif-convert not found (HEIC support may be limited)")
    end

    # Check for sips (macOS only)
    if system("which sips > /dev/null 2>&1")
      puts("✓ Found sips (macOS image conversion)")
    end
  end

  def convert_image(image_path, options = {})
    options = @options.merge(options)

    unless File.exist?(image_path)
      puts("Error: File not found - #{image_path}") if options[:verbose]
      return {success: false, image_path: image_path, message: "File not found"}
    end

    begin
      # Determine output paths
      image_filename = File.basename(image_path, ".*")
      output_dir = options[:output_dir] || File.dirname(image_path)
      output_format = options[:output_format].downcase

      # Ensure output directory exists
      FileUtils.mkdir_p(output_dir) unless File.directory?(output_dir)

      # Results to return
      result = {
        success: true,
        image_path: image_path,
        converted_files: [],
        thumbnails: []
      }

      # Main image output path
      main_output_path = File.join(output_dir, "#{image_filename}.#{output_format}")

      # Skip if file exists and not forcing overwrite
      if File.exist?(main_output_path) && !options[:force]
        puts("File already exists, skipping: #{main_output_path}") if options[:verbose]
      else
        # Check if we need to pre-process special formats
        image_path_to_use = image_path
        temp_file = nil

        # Handle HEIC/HEIF files which may not be directly supported
        if image_path =~ /\.(heic|heif)$/i
          puts("Processing HEIC/HEIF file...") if options[:verbose]
          temp_file, image_path_to_use = preprocess_heic_file(image_path)

          if temp_file.nil?
            return {
              success: false,
              image_path: image_path,
              message: "Failed to convert HEIC/HEIF file. Please install heif-convert or run on macOS with sips."
            }
          end
        end

        # Handle DNG/RAW files
        if image_path =~ /\.(dng|raw|cr2|nef|arw)$/i
          puts("Processing RAW file...") if options[:verbose]
          temp_file, image_path_to_use = preprocess_raw_file(image_path)

          if temp_file.nil?
            return {
              success: false,
              image_path: image_path,
              message: "Failed to process RAW file. Please install exiftool or dcraw."
            }
          end
        end

        begin
          # Open image with MiniMagick
          image = MiniMagick::Image.open(image_path_to_use)

          # Strip metadata if requested
          if options[:strip_metadata]
            image.strip
          end

          # Apply output format
          case output_format
          when "webp"
            image.format("webp")
            image.quality(options[:quality])
          when "jpg", "jpeg"
            image.format("jpeg")
            image.quality(options[:quality])
          when "png"
            image.format("png")
            image.quality(options[:quality])
          else
            image.format(output_format)
            image.quality(options[:quality])
          end

          # Save the image
          image.write(main_output_path)

          result[:converted_files] <<
            {
              path: main_output_path,
              type: "main",
              width: image.width,
              height: image.height,
              format: output_format,
              size_bytes: File.size(main_output_path)
            }

          puts("Converted to #{output_format}: #{main_output_path}") if options[:verbose]
        ensure
          # Clean up temporary file if it exists
          if temp_file && File.exist?(temp_file)
            File.unlink(temp_file)
            puts("Removed temporary file: #{temp_file}") if options[:verbose]
          end
        end
      end

      # Create thumbnails
      options[:thumbnail_sizes].each do |size|
        thumbnail_path = File.join(output_dir, "#{image_filename}_#{size}.#{output_format}")

        # Skip if thumbnail exists and not forcing overwrite
        if File.exist?(thumbnail_path) && !options[:force]
          puts("Thumbnail already exists, skipping: #{thumbnail_path}") if options[:verbose]
          next
        end

        # Use the converted file as the source for thumbnails if it exists
        source_path = (result[:converted_files].first && File.exist?(result[:converted_files].first[:path])) ? result[
          :converted_files
        ]
          .first[:path] : image_path

        # Create the thumbnail
        begin
          thumbnail = MiniMagick::Image.open(source_path)

          # Use appropriate resize method
          if options[:crop_thumbnails]
            # This crops to fill the exact dimensions
            thumbnail.resize("#{size}x#{size}^")
            thumbnail.gravity("center")
            thumbnail.extent("#{size}x#{size}")
          else
            # This maintains aspect ratio
            thumbnail.resize("#{size}x#{size}>")
          end

          # Set format and quality
          thumbnail.format(output_format)
          thumbnail.quality(options[:quality])

          # Write the thumbnail
          thumbnail.write(thumbnail_path)

          result[:thumbnails] <<
            {
              path: thumbnail_path,
              size: size,
              width: thumbnail.width,
              height: thumbnail.height,
              format: output_format,
              size_bytes: File.size(thumbnail_path)
            }

          puts("Created #{size}px thumbnail: #{thumbnail_path}") if options[:verbose]
        rescue => e
          puts("Error creating thumbnail: #{e.message}") if options[:verbose]
        end
      end

      return result
    rescue => e
      puts("Error processing #{image_path}: #{e.message}") if options[:verbose]
      puts(e.backtrace.join("\n")) if options[:verbose]
      return {
        success: false,
        image_path: image_path,
        message: "Failed to convert image",
        error: e.message
      }
    end
  end

  def batch_convert(image_paths, options = {})
    results = []

    image_paths.each do |path|
      result = convert_image(path, options)
      results << result

      if options[:verbose]
        status = result[:success] ? "Success" : "Failed"
        puts("Processed #{path}: #{status}")
      end
    end

    results
  end

  # Preprocess HEIC/HEIF files to convert to a format MiniMagick can handle
  def preprocess_heic_file(heic_path)
    temp_file = File.join(Dir.tmpdir, "heic_converted_#{Time.now.to_i}.jpg")

    # Try heif-convert first
    if system("which heif-convert > /dev/null 2>&1")
      puts("Converting HEIC with heif-convert...") if @options[:verbose]
      system("heif-convert \"#{heic_path}\" \"#{temp_file}\"")
      return temp_file, temp_file if File.exist?(temp_file) && File.size(temp_file) > 0
    end

    # Try sips (macOS)
    if system("which sips > /dev/null 2>&1")
      puts("Converting HEIC with sips...") if @options[:verbose]
      system("sips -s format jpeg \"#{heic_path}\" --out \"#{temp_file}\"")
      return temp_file, temp_file if File.exist?(temp_file) && File.size(temp_file) > 0
    end

    # Try ImageMagick convert
    if system("which convert > /dev/null 2>&1")
      puts("Converting HEIC with ImageMagick...") if @options[:verbose]
      system("convert \"#{heic_path}\" \"#{temp_file}\"")
      return temp_file, temp_file if File.exist?(temp_file) && File.size(temp_file) > 0
    end

    # If all methods failed, clean up and return nil
    File.unlink(temp_file) if File.exist?(temp_file)
    return nil, nil
  end

  # Preprocess RAW files (DNG, etc)
  def preprocess_raw_file(raw_path)
    temp_file = File.join(Dir.tmpdir, "raw_converted_#{Time.now.to_i}.jpg")

    # Try extracting preview with exiftool
    if system("which exiftool > /dev/null 2>&1")
      puts("Extracting preview from RAW with exiftool...") if @options[:verbose]
      system("exiftool -b -PreviewImage \"#{raw_path}\" > \"#{temp_file}\"")
      return temp_file, temp_file if File.exist?(temp_file) && File.size(temp_file) > 0
    end

    # Try dcraw
    if system("which dcraw > /dev/null 2>&1")
      puts("Converting RAW with dcraw...") if @options[:verbose]
      system("dcraw -c -w -H 5 -o 1 -q 3 \"#{raw_path}\" > \"#{temp_file}\"")
      return temp_file, temp_file if File.exist?(temp_file) && File.size(temp_file) > 0
    end

    # If all methods failed, clean up and return nil
    File.unlink(temp_file) if File.exist?(temp_file)
    return nil, nil
  end

  def self.check_dependencies
    has_errors = false

    begin
      MiniMagick::Image.new(Dir.tmpdir)
      puts("✓ MiniMagick appears to be working")
    rescue => e
      puts("✗ Error with MiniMagick: #{e.message}")
      puts("Make sure ImageMagick or GraphicsMagick is installed:")
      puts("  - macOS: brew install imagemagick")
      puts("  - Ubuntu/Debian: sudo apt-get install imagemagick")
      has_errors = true
    end

    # Check for HEIC support
    if system("which heif-convert > /dev/null 2>&1")
      puts("✓ Found HEIC support (heif-convert)")
    elsif system("which sips > /dev/null 2>&1")
      puts("✓ Found HEIC support (macOS sips)")
    else
      puts("⚠️ HEIC support not found")
      puts("For HEIC support (optional):")
      puts("  - macOS: brew install libheif")
      puts("  - Ubuntu/Debian: sudo apt-get install libheif-examples")
    end

    # Check for RAW support
    if system("which exiftool > /dev/null 2>&1")
      puts("✓ Found RAW support (exiftool)")
    elsif system("which dcraw > /dev/null 2>&1")
      puts("✓ Found RAW support (dcraw)")
    else
      puts("⚠️ RAW support not found")
      puts("For RAW support (optional):")
      puts("  - macOS: brew install exiftool dcraw")
      puts("  - Ubuntu/Debian: sudo apt-get install exiftool dcraw")
    end

    !has_errors
  end

  # Helper method to format file sizes nicely
  def self.format_size(size_bytes)
    units = ["B", "KB", "MB", "GB"]
    unit_index = 0
    size = size_bytes.to_f

    while size > 1024 && unit_index < units.length - 1
      size /= 1024.0
      unit_index += 1
    end

    format("%.2f %s", size, units[unit_index])
  end

  # Helper method to print conversion results
  def self.print_conversion_results(result)
    if result[:success]
      puts("✅ Image conversion successful")

      if result[:converted_files]&.any?
        puts("\nMain converted file:")
        result[:converted_files].each do |file|
          size = format_size(file[:size_bytes])
          puts("  - #{File.basename(file[:path])} (#{file[:width]}×#{file[:height]}, #{size})")
        end
      end

      if result[:thumbnails]&.any?
        puts("\nThumbnails:")
        result[:thumbnails].each do |thumb|
          size = format_size(thumb[:size_bytes])
          puts("  - #{File.basename(thumb[:path])} (#{thumb[:width]}×#{thumb[:height]}, #{size})")
        end
      end
    else
      puts("❌ Image conversion failed: #{result[:message]}")
      puts("Error: #{result[:error]}") if result[:error]
    end
  end
end

# CLI handling if the script is executed directly
if __FILE__ == $PROGRAM_NAME
  options = {
    output_format: ImageConverter::DEFAULT_WEB_FORMAT,
    quality: 95,
    thumbnail_sizes: ImageConverter::THUMBNAIL_SIZES,
    strip_metadata: true,
    verbose: false,
    output_dir: nil,
    force: false,
    crop_thumbnails: false
  }

  # Parse command line options
  OptionParser
    .new do |opts|
      opts.banner = "Usage: ruby image_converter.rb [options] IMAGE_PATH [IMAGE_PATH2 ...]"

      opts.on(
        "-f",
        "--format FORMAT",
        ["webp", "avif", "jpg", "png"],
        "Output format (webp, avif, jpg, png)"
      ) do |format|
        options[:output_format] = format
      end

      opts.on("-q", "--quality QUALITY", Integer, "Output quality (1-100)") do |quality|
        options[:quality] = quality.to_i
      end

      opts.on("-t", "--thumbnails SIZES", Array, "Thumbnail sizes (comma-separated)") do |sizes|
        options[:thumbnail_sizes] = sizes.map(&:to_i)
      end

      opts.on("-c", "--crop", "Crop thumbnails to exact size") do
        options[:crop_thumbnails] = true
      end

      opts.on("--keep-metadata", "Keep image metadata") do
        options[:strip_metadata] = false
      end

      opts.on("-o", "--output DIR", "Output directory") do |dir|
        options[:output_dir] = dir
      end

      opts.on("--force", "Force overwrite existing files") do
        options[:force] = true
      end

      opts.on("--verbose", "Enable verbose output") do
        options[:verbose] = true
      end

      opts.on("--check", "Check dependencies") do
        ImageConverter.check_dependencies
        exit
      end

      opts.on("-h", "--help", "Show this help message") do
        puts(opts)
        exit
      end
    end
    .parse!

  if ARGV.empty?
    puts("Error: Please provide at least one image path")
    puts("Usage: ruby image_converter.rb [options] IMAGE_PATH [IMAGE_PATH2 ...]")
    exit(1)
  end

  # Process images
  image_paths = ARGV
  converter = ImageConverter.new(options)

  if image_paths.length == 1
    # Single image
    result = converter.convert_image(image_paths[0], options)
    ImageConverter.print_conversion_results(result)
  else
    # Multiple images
    results = converter.batch_convert(image_paths, options)
    puts("\nProcessed #{results.length} images:")
    successful = results.count { |r| r[:success] }
    failed = results.length - successful
    puts("✅ Successful: #{successful}")
    puts("❌ Failed: #{failed}") if failed > 0

    if options[:verbose]
      results.each_with_index do |result, index|
        puts("\n--- Image #{index + 1}: #{File.basename(result[:image_path])} ---")
        ImageConverter.print_conversion_results(result)
      end
    end
  end
end
