const fs = require('fs');
const path = require('path');
const git = require('./server/node_modules/isomorphic-git');

const dir = path.resolve(__dirname);

async function initRepo() {
  console.log('1. 初始化 Git Repository...');
  await git.init({ fs, dir, defaultBranch: 'main' });
  console.log('✓ Git 倉庫初始化成功！');

  console.log('2. 收集需要提交的專案檔案...');
  // 忽略清單
  const ignoreDirs = ['node_modules', '.git', 'temp_xlsx', 'temp_pptx', '產出檔案'];
  const ignoreFiles = ['.DS_Store', 'Thumbs.db'];

  function getAllFiles(currentDir, relativePath = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) continue;
        files = files.concat(getAllFiles(path.join(currentDir, entry.name), path.join(relativePath, entry.name)));
      } else {
        if (ignoreFiles.includes(entry.name)) continue;
        if (entry.name.endsWith('.log')) continue;
        files.push(path.join(relativePath, entry.name).replace(/\\/g, '/'));
      }
    }
    return files;
  }

  const filesToAdd = getAllFiles(dir);
  console.log(`準備新增 ${filesToAdd.length} 個檔案到 Git:`);

  for (const f of filesToAdd) {
    await git.add({ fs, dir, filepath: f });
  }
  console.log('✓ 檔案加入完成！');

  console.log('3. 執行第一次 Commit...');
  const sha = await git.commit({
    fs,
    dir,
    author: {
      name: '2508026-web',
      email: 'user@example.com'
    },
    message: 'Initial commit: 晶創計畫智慧會議管理與費用核銷系統 (相容 Vercel 與最新桌牌/核銷範本)'
  });
  console.log('✓ Commit 成功！SHA:', sha);

  console.log('4. 設定 Remote Origin...');
  const remoteUrl = 'https://github.com/2508026-web/web-cbi.git';
  try {
    await git.addRemote({
      fs,
      dir,
      remote: 'origin',
      url: remoteUrl,
      force: true
    });
    console.log('✓ Remote 設定成功:', remoteUrl);
  } catch (e) {
    console.log('Remote 已存在或設定完成:', e.message);
  }

  console.log('\n🎉 本地 Git 儲存庫建立完成，隨時準備推送到 GitHub！');
}

initRepo().catch(err => {
  console.error('Git 初始化失敗:', err);
});
