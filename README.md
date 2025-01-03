## Turn Apple notes folder to a website

Apple Notes folder:
![apple-notes](./apple-notes.png)

Generated website:
![generated-website](./generated-website.png)

This is a simple script that turns a folder of your Apple notes into a website.

### Installation (MacOS only)

1. Download the binary:
```bash
curl -L https://github.com/29decibel/notes-to-blog/releases/download/v0.1.4/notes-to-blog-mac.tar.gz -o notes-to-blog.tar.gz
```

2. Extract the archive:
```bash
tar -xzf notes-to-blog.tar.gz
```

4. Make it executable:
```bash
sudo chmod +x notes-to-blog
```

### Usage

```bash
notes-to-blog <apple-notes-folder-name> <output-directory>
```

Example:
```bash
notes-to-blog Writing ~/Sites/blog
```


### Development
Making sure you have [bun](https://bun.sh/) installed.

```bash
curl -fsSL https://bun.sh/install | bash

# install dependencies
bun install

# build binary
bun run build
```


### Free Github Pages

Once you have the static files, you can easily deploy to Github Pages.
This folder has a simple `publish` script that will help you deploy to Github Pages.

1. Create a new repository `your-name/a-blog-from-apple-notes` on Github
2. Clone the repository to your local machine (example: `~/writings/a-blog-from-apple-notes`)
3. Running `./publish` will deploy the static files to Github Pages

```bash
# publish git repository to Github Pages
./publish ~/writings/a-blog-from-apple-notes
```

### Example site

Here is an example site generated from Apple notes using Github pages (using custom domain):

https://writing.dongbin.li/

### What's next

- [x] Single binary to simplify installation
- [ ] Generate RSS feeds
- [ ] Allow passing to custom CSS
- [ ] Allow more metadata control on each notes


### FAQ

#### Will this send data anywhere?

No. Everything is done locally by running some AppleScript. It then process the exported JSON, then generate the static files.

#### Why using `bun` instead of NodeJS?

Exported Apple notes HTML uses base64 encoded images. Which could be huge if the image is big (such as `dng` raw format).
For macOS less than 8GB RAM, it crashed a lot. `bun` seems to handle this much better. And a lot faster too.
