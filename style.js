export const styleString = `
  body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
      line-height: 1.5;
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
      color: #1d1d1f;
      background: #ffffff;
  }

  h1 {
      font-size: 1.8rem;
      font-weight: 500;
      margin: 1.5rem 0;
      color: #1d1d1f;
  }

  img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1rem 0;
  }

  div {
      margin: 0.5rem 0;
  }

  /* Light mode styles */
  @media (prefers-color-scheme: light) {
      body {
          color: #1d1d1f;
          background: #ffffff;
      }
  }

  /* Dark mode styles */
  @media (prefers-color-scheme: dark) {
      body {
          color: #f5f5f7;
          background: #1d1d1f;
      }

      h1 {
          color: #f5f5f7;
      }
  }

  /* START- Base code block styling */
  div:has(tt) {
      font-family: Menlo, Monaco, "Courier New", monospace;
      white-space: pre;
      tab-size: 2;
      background-color: #f5f5f5;
  }

  /* tt element styling */
  tt {
      font-family: inherit;
      display: block;
      padding: 0 1em;
      font-size: 0.9em;
  }

  /* First block in a sequence - using adjacent sibling combinator */
  div:has(tt) + div:has(tt) {
      /* This style applies to all blocks EXCEPT the first one */
      border-top-left-radius: 0;
      border-top-right-radius: 0;
      margin-top: 0;
      padding-top: 0;
  }

  /* Default state - assuming every code block could be first */
  div:has(tt) {
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
      padding-top: 0.75em;
      margin: 0px;
  }

  /* Last block in a sequence */
  div:has(tt):not(:has(+ div:has(tt))) {
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
      padding-bottom: 0.75em;
      margin-bottom: 1em;
  }

  /* Handle empty lines within code blocks */
  div:has(tt:empty) {
      min-height: 1em;
  }

  /* Regular headings */
  h1 {
      font-size: 1.8em;
      margin: 0.8em 0;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
      div:has(tt) {
          background-color: #1e1e1e;
          color: #e0e0e0;
      }
  }
  /* END- Base code block styling */

  .published-date {
      color: #666;
      font-style: italic;
      margin-bottom: 2em;
      font-size: 0.9em;
  }

  /* Index page styles */
  .notes-list {
      list-style: none;
      padding: 0;
      max-width: 800px;
      margin: 0 auto;
  }

  .note-link {
      padding: 1em 0;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
  }

  .note-link a {
      text-decoration: none;
      color: #333;
      font-size: 1.1em;
  }

  .note-link a:hover {
      color: #007bff;
  }

  .note-date {
      color: #666;
      font-size: 0.9em;
  }

`;
