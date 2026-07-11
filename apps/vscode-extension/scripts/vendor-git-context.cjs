const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../../packages/git-context/dist');
const destination = path.resolve(__dirname, '../dist/vendor/git-context');

if (!fs.existsSync(path.join(source, 'index.js'))) {
  throw new Error(
    'Git context runtime has not been built. Run the @reviewlume/git-context build first.',
  );
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });

console.log(`Vendored Git context runtime: ${destination}`);
