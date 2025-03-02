import { promises as fs } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

export const generatePhotosIndex = async (notes, htmlDir, siteName) => {
  const $ = cheerio.load(
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );

  $("head").append(`
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <title>${siteName}</title>
    <style>
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .photo-item {
        display: flex;
        flex-direction: column;
        text-align: center;
      }
      .photo-container {
        aspect-ratio: 1 / 1;
        overflow: hidden;
        margin-bottom: 8px;
        border-radius: 4px;
      }
      .photo-container img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }
      .photo-item:hover img {
        transform: scale(1.05);
      }
      .photo-title {
        margin-top: 8px;
        font-size: 14px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .photo-date {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
      }
      @media (max-width: 768px) {
        .photo-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (max-width: 480px) {
        .photo-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `);

  $("body").append(`
    <h1>${siteName}</h1>
    <div class="photo-grid">
    </div>
  `);

  // Sort notes by creation date (newest first)
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.created) - new Date(a.created),
  );

  // Add each note with its first image to the grid
  for (const note of sortedNotes) {
    try {
      let firstImagePath = "";

      // Try to get the first image from the note
      if (note.images && note.images.trim()) {
        const noteImages = JSON.parse(note.images);
        if (noteImages.length > 0) {
          // Get the first image path
          firstImagePath = noteImages[0].path;
        }
      }

      const fileName = note.name.replace(/[^a-z0-9]/gi, "_");
      const date = new Date(note.created).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Create a grid item with the image and title
      const gridItem = $(`
        <a href="${fileName}.html" class="photo-item">
          <div class="photo-container">
            ${
              firstImagePath
                ? `<img src="images/${firstImagePath}" alt="${note.name}">`
                : '<div style="background-color: #f0f0f0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">No image</div>'
            }
          </div>
          <div class="photo-title">${note.name}</div>
          <div class="photo-date">${date}</div>
        </a>
      `);

      $(".photo-grid").append(gridItem);
    } catch (error) {
      console.error(
        `Error processing note "${note.name}" for index page:`,
        error,
      );
    }
  }

  const indexPath = join(htmlDir, "index.html");
  await fs.writeFile(indexPath, $.html());
  console.log(`Instagram-style index page generated at ${indexPath}`);
};
