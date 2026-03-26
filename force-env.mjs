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
