import fs from 'node:fs';
import path from 'node:path';

const loaderPath = path.resolve('node_modules/three/examples/jsm/loaders/FBXLoader.js');
const marker = "const extension = textureNode.FileName.split( '.' ).pop().toLowerCase();";
const replacement = "const extension = typeof textureNode.FileName === 'string' && textureNode.FileName.includes( '.' ) ? textureNode.FileName.split( '.' ).pop().toLowerCase() : '';";

if (!fs.existsSync(loaderPath)) {
  process.exit(0);
}

const source = fs.readFileSync(loaderPath, 'utf8');
if (source.includes(replacement) || !source.includes(marker)) {
  process.exit(0);
}

fs.writeFileSync(loaderPath, source.replace(marker, replacement));
console.log('Patched Three FBXLoader for texture records without filenames.');
