#!/usr/bin/env node

import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import * as cheerio from "cheerio";

const extractImageInfo = (src) => {
  const cleanSrc = src.replace(/\\"/g, '"');
  const [header, base64Data] = cleanSrc.split(",");

  if (!base64Data) return null;

  const mimeMatch = header.match(/data:image\/([a-zA-Z0-9.-]+(?:;|$))/);
  if (!mimeMatch) return null;

  const mimeType = mimeMatch[1].replace(";", "");

  return {
    mimeType,
    base64Data,
  };
};

const copyStylesheet = async (htmlDir) => {
  try {
    // Read style.css from the same directory as the script
    const css = await fs.readFile("style.css", "utf8");
    // Copy to html directory
    await fs.writeFile(join(htmlDir, "style.css"), css);
    console.log("Copied style.css to html directory");
  } catch (error) {
    console.error("Error copying style.css:", error);
    throw error;
  }
};

const processHtml = async (html, imageDir, publishedDate) => {
  try {
    await fs.mkdir(imageDir);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  const processedImages = new Map();
  const $ = cheerio.load(html);

  // Add CSS link
  $("head").length ? $("head") : $("html").prepend("<head>");
  // $("head").prepend('<link rel="stylesheet" href="style.css">');

  // Add UTF-8 meta tag and CSS link
  $("head").prepend(`
     <meta charset="UTF-8">
     <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
     <link rel="stylesheet" href="style.css">
   `);

  // Wrap content in body if it doesn't exist
  if (!$("body").length) {
    $("*").wrapAll("<body>");
  }

  // find the first h1 as title and append it as <title> element in the head
  const title = $("h1").first().text();
  $("head").append(`<title>${title}</title>`);

  // append published on date to the end of the body
  const formattedDate = new Date(publishedDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  $("body").append(`
    <div class="published-date">Published on ${formattedDate}</div>
  `);

  const promises = $('img[src^="data:image"]')
    .map(async (_, img) => {
      const src = $(img).attr("src");
      if (!src) return;

      const imageInfo = extractImageInfo(src);
      if (!imageInfo) return;

      const { mimeType, base64Data } = imageInfo;

      const hash = createHash("md5").update(base64Data).digest("hex");

      if (processedImages.has(hash)) {
        $(img).attr("src", `images/${processedImages.get(hash)}`);
        return;
      }

      const ext = mimeType.replace("x-adobe-", "");
      const filename = `image_${hash}.${ext}`;
      processedImages.set(hash, filename);

      try {
        const buffer = Buffer.from(base64Data, "base64");
        await fs.writeFile(join(imageDir, filename), buffer);
        $(img).attr("src", `images/${filename}`);
        console.log(`Saved image: ${filename}`);
      } catch (err) {
        console.error(`Failed to save ${filename}:`, err);
      }
    })
    .get();

  await Promise.all(promises);
  return $.html();
};

// Add this new function to generate the index HTML
const generateIndex = async (notes, htmlDir, siteName) => {
  const $ = cheerio.load(
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );

  // Add meta tags and CSS
  $("head").append(`
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <link rel="stylesheet" href="style.css">
    <title>${siteName}</title>
  `);

  // Add header and list of notes
  $("body").append(`
    <h1>${siteName}</h1>
    <ul class="notes-list">
      ${notes
        .sort((a, b) => new Date(b.created) - new Date(a.created)) // Sort by date, newest first
        .map((note) => {
          const fileName = `${note.name.replace(/[^a-z0-9]/gi, "_")}.html`;
          const date = new Date(note.created).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return `
            <li>
              <div class="note-link">
                <a href="${fileName}">${note.name}</a>
                <span class="note-date">${date}</span>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `);

  // Write the index file
  const indexPath = join(htmlDir, "index.html");
  await fs.writeFile(indexPath, $.html());
  console.log(`Index page generated at ${indexPath}`);
};

const main = async () => {
  try {
    const jsonPath = process.argv[2];
    if (!jsonPath) {
      console.error("Please provide path to JSON file");
      process.exit(1);
    }

    // read optional output dir
    const outputDir = process.argv[3];

    const jsonContent = await fs.readFile(jsonPath, "utf8");
    const data = JSON.parse(jsonContent);

    // Create HTML directory
    const htmlDir = outputDir || join(process.cwd(), "html");

    try {
      await fs.mkdir(htmlDir);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }

    // Create images directory inside HTML directory
    const imageDir = join(htmlDir, "images");

    // Copy stylesheet to html directory
    await copyStylesheet(htmlDir);

    const processedNotes = await Promise.all(
      data.notes.map(async (note) => ({
        ...note,
        body: await processHtml(note.body, imageDir, note.created),
      })),
    );

    const output = {
      ...data,
      notes: processedNotes,
    };

    const outputPath = jsonPath.replace(".json", "_processed.json");
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`Processed JSON saved to ${outputPath}`);

    // generate HTML files for each note
    await Promise.all(
      processedNotes.map(async (note) => {
        const htmlPath = join(
          htmlDir,
          `${note.name.replace(/[^a-z0-9]/gi, "_")}.html`,
        );
        await fs.writeFile(htmlPath, note.body);
        console.log(`HTML saved to ${htmlPath}`);
      }),
    );

    // Generate index.html
    await generateIndex(processedNotes, htmlDir, data.name);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

main();
