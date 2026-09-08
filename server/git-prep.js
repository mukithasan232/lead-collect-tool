const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');

async function main() {
  console.log('📦 Initializing Git repository in:', repoDir);

  // 1. Initialize
  await git.init({ fs, dir: repoDir, defaultBranch: 'main' });
  console.log('✓ Git repo initialized with branch "main"');

  // 2. Walk directory and stage files respecting .gitignore
  const filesToStage = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(repoDir, fullPath).replace(/\\/g, '/');

      // Skip ignored directories and files
      if (
        relPath === '.git' ||
        relPath.startsWith('.git/') ||
        relPath === 'node_modules' ||
        relPath.startsWith('node_modules/') ||
        relPath === 'server/node_modules' ||
        relPath.startsWith('server/node_modules/') ||
        relPath === 'dist' ||
        relPath.startsWith('dist/') ||
        relPath === 'server/dist' ||
        relPath.startsWith('server/dist/') ||
        relPath === '.env' ||
        relPath === 'server/.env' ||
        relPath.endsWith('.tmp') ||
        relPath.endsWith('.log')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        filesToStage.push(relPath);
      }
    }
  }

  walk(repoDir);

  console.log(`Found ${filesToStage.length} files to stage.`);

  for (const file of filesToStage) {
    await git.add({ fs, dir: repoDir, filepath: file });
  }
  console.log('✓ All files added to staging area.');

  // 3. Commit
  const sha = await git.commit({
    fs,
    dir: repoDir,
    author: {
      name: 'mukithasan232',
      email: 'mdmukithasan429@gmail.com',
    },
    message: 'Initial commit: Complete LeadPulse AI B2B platform with TypeScript Express backend, MongoDB Atlas ORM, and email verification engine',
  });
  console.log('✓ Committed successfully with SHA:', sha);

  // 4. Set remote
  const remotes = await git.listRemotes({ fs, dir: repoDir });
  const hasOrigin = remotes.some((r) => r.remote === 'origin');
  if (!hasOrigin) {
    await git.addRemote({
      fs,
      dir: repoDir,
      remote: 'origin',
      url: 'https://github.com/mukithasan232/lead-collect-tool.git',
    });
    console.log('✓ Remote "origin" added: https://github.com/mukithasan232/lead-collect-tool.git');
  } else {
    console.log('✓ Remote "origin" already exists.');
  }

  // 5. Check branch
  const currentBranch = await git.currentBranch({ fs, dir: repoDir, fullname: false });
  console.log('✓ Current branch:', currentBranch);
}

main().catch(console.error);
