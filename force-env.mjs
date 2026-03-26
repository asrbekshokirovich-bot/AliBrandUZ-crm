import { spawn } from 'child_process';

const KEY_VALUE = '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';

function addEnv(env) {
  return new Promise((resolve) => {
    console.log(`Adding to ${env}...`);
    // Remove old just in case (we ignore errors)
    const rm = spawn('npx.cmd', ['vercel', 'env', 'rm', 'OPENAI_API_KEY', env, '-y'], { shell: true });
    rm.on('close', () => {
      const add = spawn('npx.cmd', ['vercel', 'env', 'add', 'OPENAI_API_KEY', env], { shell: true });
      
      add.stdout.on('data', d => process.stdout.write(d.toString()));
      add.stderr.on('data', d => process.stderr.write(d.toString()));
      
      // Write the key to stdin and critically close the stream!
      add.stdin.write(KEY_VALUE);
      add.stdin.end();

      add.on('close', (code) => {
        console.log(`Add to ${env} exited with ${code}`);
        resolve();
      });
    });
  });
}

async function run() {
  await addEnv('production');
  await addEnv('preview');
  await addEnv('development');
  console.log('SUCCESS DONE!');
}

run();
