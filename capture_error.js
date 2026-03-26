const { exec } = require('child_process');
const fs = require('fs');
console.log('Running vite build...');
exec('npx vite build', (err, stdout, stderr) => {
  fs.writeFileSync('vite_err.txt', stdout + '\n' + stderr);
  console.log('Done writing vite_err.txt');
});
