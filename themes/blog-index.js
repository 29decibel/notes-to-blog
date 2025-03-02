import { promises as fs } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

export const generateBlogIndex = async (notes, htmlDir, siteName) => {
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
