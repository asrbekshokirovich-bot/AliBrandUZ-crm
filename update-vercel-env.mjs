import { execSync } from 'child_process';

const KEY_NAME = 'OPENAI_API_KEY';
const KEY_VALUE = process.env.NEW_OPENAI_KEY;

if (!KEY_VALUE) {
  console.error("Please run this script with NEW_OPENAI_KEY=sk-... node update-vercel-env.mjs");
  process.exit(1);
}

const envs = ['production', 'preview', 'development'];

for (const env of envs) {
  console.log(`Removing ${KEY_NAME} from ${env}...`);
  try {
    execSync(`npx vercel env rm ${KEY_NAME} ${env} -y`, { stdio: 'inherit' });
  } catch (e) {
    console.log(`(Failed to remove, might not exist)`);
  }

  console.log(`Adding ${KEY_NAME} to ${env}...`);
  try {
    execSync(`npx vercel env add ${KEY_NAME} ${env}`, { 
      stdio: 'pipe',
      input: KEY_VALUE
    });
    console.log('Successfully added!');
  } catch (e) {
    console.error(`Failed to add: ${e.message}`);
  }
}
