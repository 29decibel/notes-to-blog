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

const processHtml = async (html, imageDir) => {
  try {
    await fs.mkdir(imageDir);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  const processedImages = new Map();
  const $ = cheerio.load(html);

  // Add CSS link
  $("head").length ? $("head") : $("html").prepend("<head>");
  $("head").prepend('<link rel="stylesheet" href="style.css">');

  // Wrap content in body if it doesn't exist
  if (!$("body").length) {
    $("*").wrapAll("<body>");
  }

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

const main = async () => {
  try {
    const jsonPath = process.argv[2];
    if (!jsonPath) {
      console.error("Please provide path to JSON file");
      process.exit(1);
    }

    const jsonContent = await fs.readFile(jsonPath, "utf8");
    const data = JSON.parse(jsonContent);

    // Create HTML directory
    const htmlDir = "html";
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
        body: await processHtml(note.body, imageDir),
      })),
    );

    const output = {
      ...data,
      notes: processedNotes,
    };

    const outputPath = jsonPath.replace(".json", "_processed.json");
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`Processed JSON saved to ${outputPath}`);

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
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

main();
