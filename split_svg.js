const fs = require('fs');

const svgContent = fs.readFileSync('file.svg', 'utf8');

// Split by <path
const pathTags = svgContent.split('<path').slice(1);
const paths = [];

for (const rawTag of pathTags) {
    // Extract d="..."
    const dMatch = rawTag.match(/d="([^"]+)"/);
    if (!dMatch) continue;

    const d = dMatch[1];

    // Extract fill if present
    const fillMatch = rawTag.match(/fill="([^"]+)"/);
    const fill = fillMatch ? fillMatch[1] : "#000000";

    // Reconstruct a clean path tag
    const fullTag = `<path fill="${fill}" d="${d.replace(/\\s+/g, ' ')}" />`;

    const numberMatches = d.match(/-?\d+\.?\d*/g);
    if (!numberMatches) continue;

    const numbers = numberMatches.map(Number);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < numbers.length; i += 2) {
        const x = numbers[i];
        const y = numbers[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    paths.push({ fullTag, minX, maxX, minY, maxY, centerX, centerY });
}

console.log(`Found ${paths.length} valid paths with coordinate data.`);

if (paths.length === 0) {
    process.exit(0);
}

// Find overall bounding box to determine grid
let globalMinX = Infinity, globalMaxX = -Infinity, globalMinY = Infinity, globalMaxY = -Infinity;
for (const p of paths) {
    if (p.minX < globalMinX) globalMinX = p.minX;
    if (p.maxX > globalMaxX) globalMaxX = p.maxX;
    if (p.minY < globalMinY) globalMinY = p.minY;
    if (p.maxY > globalMaxY) globalMaxY = p.maxY;
}

console.log(`Global Bounds: X[${globalMinX}, ${globalMaxX}] Y[${globalMinY}, ${globalMaxY}]`);

// Detect background box
const bgPaths = paths.filter(p => {
    const w = p.maxX - p.minX;
    const h = p.maxY - p.minY;
    return w > (globalMaxX - globalMinX) * 0.9 && h > (globalMaxY - globalMinY) * 0.9;
});

// Remove background bounding box paths so they don't get clustered into everything
const iconPaths = paths.filter(p => !bgPaths.includes(p));

console.log(`Removed ${bgPaths.length} background paths`);

// Recompute bounds after removing background
globalMinX = Infinity; globalMaxX = -Infinity; globalMinY = Infinity; globalMaxY = -Infinity;
for (const p of iconPaths) {
    if (p.minX < globalMinX) globalMinX = p.minX;
    if (p.maxX > globalMaxX) globalMaxX = p.maxX;
    if (p.minY < globalMinY) globalMinY = p.minY;
    if (p.maxY > globalMaxY) globalMaxY = p.maxY;
}

console.log(`Icon Bounds: X[${globalMinX}, ${globalMaxX}] Y[${globalMinY}, ${globalMaxY}]`);

const gridCols = 4;
const gridRows = 4;
const cellWidth = (globalMaxX - globalMinX) / gridCols;
const cellHeight = (globalMaxY - globalMinY) / gridRows;

const clusteredPaths = {};

for (const p of iconPaths) {
    let col = Math.floor((p.centerX - globalMinX) / cellWidth);
    let row = Math.floor((p.centerY - globalMinY) / cellHeight);

    // Clamp
    if (col >= gridCols) col = gridCols - 1;
    if (col < 0) col = 0;
    if (row >= gridRows) row = gridRows - 1;
    if (row < 0) row = 0;

    const key = `${row}_${col}`;
    if (!clusteredPaths[key]) {
        clusteredPaths[key] = [];
    }
    clusteredPaths[key].push(p);
}

// Ensure output dir exists
if (!fs.existsSync("assets/icons")) {
    fs.mkdirSync("assets/icons", { recursive: true });
}

const names = [
    // Provide general names for a 4x4 grid. We can rename them later.
    "bus", "map", "pin", "search",
    "calendar", "clock", "home", "route",
    "settings", "user", "warning", "filter",
    "star", "walk", "train", "add"
];

let i = 0;
for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
        const key = `${row}_${col}`;
        const cellPaths = clusteredPaths[key] || [];
        const name = names[i] || `icon_${row}_${col}`;
        i++;

        if (cellPaths.length === 0) {
            console.log(`Skipping empty cell ${row},${col}`);
            continue;
        }

        let cellMinX = Infinity, cellMaxX = -Infinity, cellMinY = Infinity, cellMaxY = -Infinity;
        for (const p of cellPaths) {
            if (p.minX < cellMinX) cellMinX = p.minX;
            if (p.maxX > cellMaxX) cellMaxX = p.maxX;
            if (p.minY < cellMinY) cellMinY = p.minY;
            if (p.maxY > cellMaxY) cellMaxY = p.maxY;
        }

        let width = cellMaxX - cellMinX;
        let height = cellMaxY - cellMinY;

        // Ensure square viewBox
        if (width > height) {
            const diff = width - height;
            cellMinY -= diff / 2;
            height = width;
        } else if (height > width) {
            const diff = height - width;
            cellMinX -= diff / 2;
            width = height;
        }

        const pad = width * 0.1;
        const vbMinX = Math.max(0, cellMinX - pad);
        const vbMinY = Math.max(0, cellMinY - pad);
        const vbWidth = width + pad * 2;
        const vbHeight = height + pad * 2;

        let outSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}">\n`;
        for (const p of cellPaths) {
            outSvg += `  ${p.fullTag}\n`;
        }
        outSvg += `</svg>`;

        fs.writeFileSync(`assets/icons/${name}.svg`, outSvg);
        console.log(`Saved assets/icons/${name}.svg with ${cellPaths.length} paths`);
    }
}
