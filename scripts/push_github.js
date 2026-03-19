import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  console.log("Installing isomorphic-git locally to automate push...");
  execSync('npm install isomorphic-git', { cwd: __dirname });
} catch (e) {
  console.log("Already installed or error.", e);
}

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.js';

async function pushCode() {
  const dir = path.resolve(__dirname, '..');
  
  try {
    console.log(`Setting up git in directory: ${dir}`);
    
    // Remote qo'shish (agar bo'lmasa) yoki yangilash
    await git.addRemote({
      fs,
      dir,
      remote: 'origin',
      url: 'https://github.com/Barhayotjon/Ali-brand.git'
    });
    
    console.log("Pulling any remote changes just in case...");
    try {
      await git.pull({
        fs,
        http,
        dir,
        ref: 'main',
        author: { name: 'AliCargo Admin', email: 'admin@alicargo.uz' }
      });
    } catch(pullErr) {
       console.log("Remote is empty or pull failed (which is fine for first push).");
    }

    console.log("Pushing to GitHub remote...");
    const pushResult = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'main',
      force: true
    });
    
    console.log("Push was successful!", pushResult);
  } catch (error) {
    console.error("Failed to push via isomorphic-git:", error);
  }
}

pushCode();
