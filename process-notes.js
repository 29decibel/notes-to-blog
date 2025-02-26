import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import * as cheerio from "cheerio";
import { syncNotes } from "./sync-notes";
import { styleString } from "./style";
import { Database } from "bun:sqlite";
import { cp } from "fs/promises";

function initializeDatabase() {
  return new Database("notes.db", { create: true });
}

async function copyAttachmentsToOutput(outputDir) {
  const destImagesDir = join(outputDir, "images");
  try {
    await fs.mkdir(destImagesDir, { recursive: true });
    // Copy all contents from attachments folder to output images folder
    await cp("attachments", destImagesDir, { recursive: true });
    console.log("Copied attachments to output directory");
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

const generateIndex = async (notes, htmlDir, siteName) => {
  const $ = cheerio.load(
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );

  $("head").append(`
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <title>${siteName}</title>
  `);

  $("body").append(`
    <h1>${siteName}</h1>
    <ul class="notes-list">
      ${notes
        .sort((a, b) => new Date(b.created) - new Date(a.created))
        .map((note) => {
          const fileName = note.name.replace(/[^a-z0-9]/gi, "_");
          const date = new Date(note.created).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return `
            <li>
              <div class="note-link">
                <a href="${fileName}.html">${note.name}</a>
                <span class="note-date">${date}</span>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `);

  const indexPath = join(htmlDir, "index.html");
  await fs.writeFile(indexPath, $.html());
  console.log(`Index page generated at ${indexPath}`);
};

async function generateSite(outputDir, folderName) {
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

    // Copy stylesheet and attachments
    await copyStylesheet(htmlDir);
    await copyAttachmentsToOutput(htmlDir);

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
    await generateIndex(notes, htmlDir, folderName);

    db.close();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.length < 4) {
    console.error("Error: Missing required arguments");
    console.log("Usage: generate <notesFolder> <outputDir>");
    process.exit(1);
  }

  const notesFolder = process.argv[2];
  const outputDir = process.argv[3];

  // First sync notes to database
  await syncNotes(notesFolder);

  // Then generate the static site
  await generateSite(outputDir, notesFolder);
}

main();
