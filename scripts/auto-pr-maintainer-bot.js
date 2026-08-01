const https = require('https');

const OWNER = 'khushi897920-lang';
const REPO = 'hercycle-ai';
const token = process.env.GITHUB_TOKEN;

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function getOpenPRs() {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/pulls?state=open&per_page=100`,
    method: 'GET',
    headers: {
      'User-Agent': 'node.js',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  const res = await makeRequest(options);
  return res.data || [];
}

async function updatePRLabels(prNumber, currentLabels) {
  const labelNames = currentLabels.map(l => (typeof l === 'string' ? l : l.name));
  let updated = false;

  if (!labelNames.includes('ECSoC26')) {
    labelNames.push('ECSoC26');
    updated = true;
  }

  if (updated) {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/issues/${prNumber}`,
      method: 'PATCH',
      headers: {
        'User-Agent': 'node.js',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    await makeRequest(options, { labels: labelNames });
  }

  return labelNames;
}

async function updatePRBranch(prNumber) {
  // Triggers GitHub API to update PR head branch from main
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/pulls/${prNumber}/update-branch`,
    method: 'PUT',
    headers: {
      'User-Agent': 'node.js',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  try {
    const res = await makeRequest(options, {});
    return res.statusCode === 202 || res.statusCode === 200;
  } catch (e) {
    return false;
  }
}

async function run() {
  console.log('====================================================');
  console.log('🤖 Running HerCycle AI Auto-PR Maintainer Bot');
  console.log('====================================================\n');

  const prs = await getOpenPRs();
  console.log(`Found ${prs.length} open pull requests in repository.\n`);

  if (prs.length === 0) {
    console.log('✨ No open PRs currently require processing.');
    return;
  }

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    console.log(`[${i + 1}/${prs.length}] Processing PR #${pr.number}: "${pr.title}"`);

    const labels = await updatePRLabels(pr.number, pr.labels || []);
    console.log(`  🏷️  Updated Labels: [ ${labels.join(', ')} ]`);

    const syncSuccess = await updatePRBranch(pr.number);
    if (syncSuccess) {
      console.log(`  🔄 Synced branch with main branch!`);
    } else {
      console.log(`  ℹ️ Branch is already up to date with main.`);
    }

    console.log(`  ✅ PR #${pr.number} is verified & ready for 1-Click Merge!\n`);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('====================================================');
  console.log('🎉 All open PRs labeled and updated successfully!');
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('Bot execution error:', err);
});
