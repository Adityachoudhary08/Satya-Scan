# SatyaScan Extension Icons

Place your PNG icon files here. Required sizes:

| File         | Size     | Usage                              |
|--------------|----------|------------------------------------|
| icon16.png   | 16×16px  | Browser toolbar (small)            |
| icon32.png   | 32×32px  | Windows taskbar / @2x small        |
| icon48.png   | 48×48px  | Chrome Extensions management page  |
| icon128.png  | 128×128px| Chrome Web Store listing           |

## Generating Icons

You can use the provided `icon.svg` as a source and export PNGs at the required sizes using:
- **Inkscape**: `inkscape icon.svg -w 128 -h 128 -o icon128.png`
- **ImageMagick**: `convert -background none icon.svg -resize 128x128 icon128.png`
- **Online tools**: SVGtoPNG.com, CloudConvert, etc.

> Note: Until real PNGs are added, the extension will still load in developer mode. Chrome will show a default puzzle-piece icon.
