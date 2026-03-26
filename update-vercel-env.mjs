import { execSync } from 'child_process';

const KEY_NAME = 'OPENAI_API_KEY';
const KEY_VALUE = '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';

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
