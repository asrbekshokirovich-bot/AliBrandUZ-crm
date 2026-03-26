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
