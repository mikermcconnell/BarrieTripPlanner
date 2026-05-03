const fs = require('fs');

const svgDir = 'assets/icons';
const files = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg'));

let outJS = `import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

// Custom generated SVG components from the user's sprite sheet
`;

for (const file of files) {
    const name = file.replace('.svg', '');
    const componentName = name.charAt(0).toUpperCase() + name.slice(1);

    const svgContent = fs.readFileSync(`${svgDir}/${file}`, 'utf8');

    const vbMatch = svgContent.match(/viewBox="([^"]+)"/);
    const viewBox = vbMatch ? vbMatch[1] : "0 0 200 200";

    // Extract paths and handle color override
    let pathsContent = '';
    const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g;
    const paths = Array.from(svgContent.matchAll(pathRegex));

    if (paths.length === 0) continue;

    // Check if the icon is largely monotone (all black/white) or complex.
    // If it's a solid icon, we can replace the dominant fill with {color}.
    // If it's multi-colored cartoon, we should probably keep original colors but maybe allow tinting
    let isMonotone = true;
    let mainColor = null;

    for (const pMatch of paths) {
        const fullTag = pMatch[0];
        const fillMatch = fullTag.match(/fill="([^"]+)"/);
        const fill = fillMatch ? fillMatch[1].toUpperCase() : "#000000";

        if (fill !== "#FFFFFF" && fill !== "NONE") {
            if (!mainColor) {
                mainColor = fill;
            } else if (mainColor !== fill && Math.abs(parseInt(mainColor.replace('#', ''), 16) - parseInt(fill.replace('#', ''), 16)) > 50000) {
                isMonotone = false;
            }
        }
    }

    const renderPaths = paths.map(pMatch => {
        const fullTag = pMatch[0];
        const d = pMatch[1];

        let fillMatch = fullTag.match(/fill="([^"]+)"/i);
        let fill = fillMatch ? fillMatch[1] : "#000000";

        // If it's nearly black, we allow overriding with the passed \`color\` prop
        // Otherwise keep original colors for the cartoon vibe
        const fillProp = (fill.toUpperCase() === "#0E0D0F" || fill.toUpperCase() === "#14100D" || fill.toUpperCase() === "#0C140E" || fill === "#000000")
            ? "{color}"
            : `"${fill}"`;

        return `      <Path fill=${fillProp} d="${d}" />`;
    }).join('\n');

    outJS += `
export const ${componentName} = ({ size = 24, color = "black", ...props }) => (
  <Svg width={size} height={size} viewBox="${viewBox}" fill="none" {...props}>
${renderPaths}
  </Svg>
);
`;
}

fs.writeFileSync('src/components/CartoonIcons.js', outJS);
console.log('Created src/components/CartoonIcons.js');
