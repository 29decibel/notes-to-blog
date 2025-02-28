// test-extract-images.js

function run(argv) {
  // Check if we have the right number of arguments
  if (argv.length !== 1) {
    throw new Error(
      'Usage: osascript -l JavaScript test-extract-images.js "OUTPUT_FOLDER_PATH"',
    );
  }

  const outputDir = argv[0];
  console.log(`Using output directory: ${outputDir}`);

  // Add MIME type to file extension mapping
  const MIME_TO_EXT = {
    png: "png",
    jpeg: "jpg",
    jpg: "jpg",
    gif: "gif",
    webp: "webp",
    tiff: "tiff",
    "x-adobe-dng": "dng",
    dng: "dng",
    bmp: "bmp",
    "svg+xml": "svg",
    svg: "svg",
    heic: "heic",
    heif: "heif",
    // add more formats as needed
  };

  // Sample HTML content with embedded base64 images
  const sampleContent = `
    <div>
      <h1>Test Note with Images</h1>
      <p>This is a test note with some embedded images:</p>
      <p>Image 1:</p>
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==" alt="Red dot" />
      <p>Image 2:</p>
      <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKKKAP/2Q==" alt="Black dot" />
    </div>
  `;

  // Prepare output directory
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  // Create output directory if it doesn't exist
  try {
    app.doShellScript(`mkdir -p "${outputDir}"`);
    console.log("Created directory: " + outputDir);
  } catch (error) {
    console.log("Error creating directory: " + error);
    return;
  }

  // Extract base64 images
  console.log("Extracting images from sample content...");
  const base64Regex = /data:image\/([-\w.]+);base64,([^"'\s]+)/g;

  let match;
  let counter = 1;
  let updatedContent = sampleContent;

  while ((match = base64Regex.exec(sampleContent)) !== null) {
    const [fullMatch, mimeType, base64Data] = match;
    console.log(`Found image ${counter} of type: ${mimeType}`);

    // Get file extension from MIME type using the mapping
    const mimeKey = mimeType.toLowerCase();
    const ext = MIME_TO_EXT[mimeKey] || mimeKey;
    console.log(`Using file extension: ${ext} for MIME type: ${mimeType}`);

    const filename = `image_${counter}.${ext}`;
    const filePath = `${outputDir}/${filename}`;

    console.log(`Saving image ${counter} to: ${filePath}`);
    console.log(`Base64 data length: ${base64Data.length}`);

    try {
      // Always use this method to create nsString and nsData
      const nsString = $.NSString.alloc.initWithString(base64Data);
      const nsData = nsString.dataUsingEncoding($.NSUTF8StringEncoding);

      // Write data to file
      const success = nsData.writeToFileAtomically($(filePath), true);

      if (success) {
        console.log(`Successfully saved image to ${filePath}`);

        // Replace the base64 data with a file reference in updated content
        updatedContent = updatedContent.replace(
          fullMatch,
          `file://${filePath}`,
        );
      } else {
        console.log(`Failed to save image to ${filePath}`);
      }
    } catch (error) {
      console.log(`Error processing image: ${error}`);

      // Fallback to shell command if needed
      try {
        const escapedBase64 = base64Data.replace(/'/g, "'\\''");
        app.doShellScript(
          `echo '${escapedBase64}' | base64 -D > "${filePath}"`,
        );
        console.log(
          `Successfully saved image using shell command to ${filePath}`,
        );

        // Replace the base64 data with a file reference in updated content
        updatedContent = updatedContent.replace(
          fullMatch,
          `file://${filePath}`,
        );
      } catch (shellError) {
        console.log(`Shell fallback also failed: ${shellError}`);
      }
    }

    counter++;
  }

  // Write the updated HTML to a file
  const htmlPath = `${outputDir}/test_result.html`;
  const nsString = $.NSString.alloc.initWithString(updatedContent);
  const htmlData = nsString.dataUsingEncoding($.NSUTF8StringEncoding);
  const htmlSuccess = htmlData.writeToFileAtomically($(htmlPath), true);

  if (htmlSuccess) {
    console.log(`Updated HTML saved to ${htmlPath}`);
  } else {
    console.log(`Failed to save updated HTML to ${htmlPath}`);
  }

  return "Image extraction test complete!";
}
