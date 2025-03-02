require "mini_exiftool"
require "fileutils"
require "optparse"

class LocationDataRemover
  LOCATION_TAGS = [
    "GPSLatitude",
    "GPSLongitude",
    "GPSAltitude",
    "GPSLatitudeRef",
    "GPSLongitudeRef",
    "GPSAltitudeRef",
    "GPSTimeStamp",
    "GPSDateStamp",
    "GPSHPositioningError",
    "GPSSpeed",
    "GPSImgDirection",
    "GPSTrack",
    "GPSSpeedRef",
    "GPSTrackRef",
    "GPSImgDirectionRef",
    "GPSDestLatitude",
    "GPSDestLongitude",
    "GPSDestBearing",
    "GPSDestDistance",
    "GPSDestLatitudeRef",
    "GPSDestLongitudeRef",
    "GPSDestBearingRef",
    "GPSDestDistanceRef",
    "GPSMapDatum",
    "GPSMeasureMode",
    "GPSDifferential",
    "GPSStatus",
    "GPSSatellites",
    "LocationName",
    "LocationCreatedCity",
    "LocationCreatedProvinceState",
    "LocationCreatedCountryName",
    "LocationCreatedCountryCode",
    "LocationShownCity",
    "LocationShownProvinceState",
    "LocationShownCountryName",
    "LocationShownCountryCode",
    "XMP-iptcExt:LocationCreated",
    "XMP-iptcExt:LocationShown",
    "XMP:Location",
    "XMP:Country",
    "XMP:City",
    "XMP:State",
    "IPTC:Country",
    "IPTC:CountryCode",
    "IPTC:Province-State",
    "IPTC:City",
    "IPTC:Sub-location"
  ]

  def initialize(options = {})
    @options = {
      create_backup: false,
      verbose: false
    }.merge(options)
  end

  def remove_location_data(image_path)
    unless File.exist?(image_path)
      puts("Error: File not found - #{image_path}") if @options[:verbose]
      return {success: false, image_path: image_path, message: "File not found"}
    end

    begin
      # Create backup if requested
      if @options[:create_backup]
        backup_path = "#{image_path}.original"
        FileUtils.cp(image_path, backup_path)
        puts("Created backup at #{backup_path}") if @options[:verbose]
      end

      # Open the image with MiniExiftool
      photo = MiniExiftool.new(image_path)

      # Remove all location tags
      LOCATION_TAGS.each do |tag|
        if photo.tags.include?(tag) && !photo[tag].nil?
          photo[tag] = nil
          puts("Removed #{tag}") if @options[:verbose]
        end
      end

      # Save changes
      photo.save

      return {
        success: true,
        image_path: image_path,
        message: "Location data removed successfully"
      }
    rescue => e
      puts("Error processing #{image_path}: #{e.message}") if @options[:verbose]
      return {
        success: false,
        image_path: image_path,
        message: "Failed to remove location data",
        error: e.message
      }
    end
  end

  def batch_remove_location_data(image_paths)
    results = []

    image_paths.each do |path|
      result = remove_location_data(path)
      results << result

      if @options[:verbose]
        status = result[:success] ? "Success" : "Failed"
        puts("Processed #{path}: #{status}")
      end
    end

    results
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
    create_backup: false,
    verbose: false
  }

  # Parse command line options
  OptionParser
    .new do |opts|
      opts.banner = "Usage: ruby trim_location.rb [options] IMAGE_PATH"

      opts.on("--backup", "Create backup of original file") do
        options[:create_backup] = true
      end

      opts.on("--verbose", "Enable verbose output") do
        options[:verbose] = true
      end

      opts.on("-h", "--help", "Show this help message") do
        puts(opts)
        exit
      end
    end
    .parse!

  if ARGV.empty?
    puts("Error: Please provide an image path")
    puts("Usage: ruby trim_location.rb [options] IMAGE_PATH")
    exit(1)
  end

  # Check if dependencies are installed
  unless LocationDataRemover.check_dependencies
    exit(1)
  end

  # Process the image
  image_path = ARGV[0]
  remover = LocationDataRemover.new(options)
  result = remover.remove_location_data(image_path)

  if result[:success]
    puts("✅ Successfully removed location data from #{File.basename(image_path)}")
  else
    puts("❌ Failed to remove location data: #{result[:message]}")
    exit(1)
  end
end
