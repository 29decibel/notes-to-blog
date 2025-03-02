import { promises as fs } from "fs";
import { join, dirname } from "path";
import * as cheerio from "cheerio";
import { syncNotes } from "./sync-notes";
import { styleString } from "./style";
import { Database } from "bun:sqlite";
import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { generateBlogIndex } from "./themes/blog-index";
import { generatePhotosIndex } from "./themes/photos-index";

function initializeDatabase() {
  return new Database("notes.db", { create: true });
}

async function copyRequiredAttachments(outputDir, notes) {
  const destImagesDir = join(outputDir, "images");
  try {
    await fs.mkdir(destImagesDir, { recursive: true });

    // Collect all required images from all notes
    let requiredImages = [];
    for (const note of notes) {
      // Parse images data from the database
      if (note.images && note.images.trim()) {
        try {
          const noteImages = JSON.parse(note.images);
          requiredImages = requiredImages.concat(noteImages);
        } catch (error) {
          console.error(`Error parsing images for note "${note.name}":`, error);
        }
      }
    }

    // Copy only the required images
    for (const image of requiredImages) {
      const sourcePath = join("attachments", image.path);
      const destPath = join(destImagesDir, image.path);

      // Ensure the destination directory exists
      await mkdir(dirname(destPath), { recursive: true });

      // Copy the image file if it exists
      if (existsSync(sourcePath)) {
        await cp(sourcePath, destPath);
        console.log(`Copied image: ${image.path}`);
      } else {
        console.warn(`Warning: Image file not found: ${sourcePath}`);
      }
    }

    console.log(
      `Copied ${requiredImages.length} required images to output directory`,
    );
  } catch (error) {
    console.error("Error copying attachments:", error);
    throw error;
  }
}

const copyStylesheet = async (htmlDir) => {
  try {
    await fs.writeFile(join(htmlDir, "style.css"), styleString);
    console.log("Copied style.css to html directory");
  } catch (error) {
    console.error("Error copying style.css:", error);
    throw error;
  }
};

const processHtml = (html, publishedDate) => {
  const $ = cheerio.load(html);

  // Add CSS link and meta tags
  $("head").length ? $("head") : $("html").prepend("<head>");
  $("head").prepend(`
     <meta charset="UTF-8">
     <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <link rel="stylesheet" href="style.css">
   `);

  // Wrap content in body if it doesn't exist
  if (!$("body").length) {
    $("*").wrapAll("<body>");
  }

  // Add site link
  $("body").prepend(`
    <div class="site-link">
      <a href="/">Back to site</a>
    </div>
  `);

  // Set title
  const title = $("h1").first().text();
  $("head").append(`<title>${title}</title>`);

  // Add published date
  const formattedDate = new Date(publishedDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  $("body").append(`
    <div class="published-date">Published on ${formattedDate}</div>
  `);

  // Update image paths if needed
  $('img[src^="file://"]').each((_, img) => {
    const src = $(img).attr("src");
    const newSrc = src.replace("file://", "images/");
    $(img).attr("src", newSrc);
  });

  return $.html();
};

async function generateSite(outputDir, folderName, indexPageGeneartor) {
  try {
    const db = initializeDatabase();

    // Get all notes from database for the specified folder
    const notes = db
      .prepare(
        `
      SELECT * FROM notes
      WHERE folder_name = ?
      ORDER BY modified DESC
    `,
      )
      .all(folderName);

    // Create output directory
    const htmlDir = outputDir || join(process.cwd(), "html");
    await fs.mkdir(htmlDir, { recursive: true });

    // Copy stylesheet
    await copyStylesheet(htmlDir);

    // Copy only required attachments instead of all attachments
    await copyRequiredAttachments(htmlDir, notes);

    // Process each note and generate HTML
    for (const note of notes) {
      const processedHtml = processHtml(note.body, note.created);
      const htmlPath = join(
        htmlDir,
        `${note.name.replace(/[^a-z0-9]/gi, "_")}.html`,
      );
      await fs.writeFile(htmlPath, processedHtml);
      console.log(`HTML saved to ${htmlPath}`);
    }

    // Generate index.html
    await indexPageGeneartor(notes, htmlDir, folderName);

    db.close();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.length < 4) {
    console.error("Error: Missing required arguments");
    console.log("Usage: generate <notesFolder> <outputDir> [theme]");
    console.log("Available themes: blog (default), photos");
    process.exit(1);
  }

  const notesFolder = process.argv[2];
  const outputDir = process.argv[3];
  const theme = process.argv[4] || "blog"; // Default to blog theme if not specified

  // Select the appropriate index generator based on the theme
  let indexPageGenerator;
  switch (theme.toLowerCase()) {
    case "photos":
      indexPageGenerator = generatePhotosIndex;
      console.log("Using photos theme for index page");
      break;
    case "blog":
    default:
      indexPageGenerator = generateBlogIndex;
      console.log("Using blog theme for index page");
      break;
  }

  // First sync notes to database
  await syncNotes(notesFolder);

  // Then generate the static site with the selected index generator
  await generateSite(outputDir, notesFolder, indexPageGenerator);
}

main();
