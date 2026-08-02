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

async function fetchAllPRs() {
  let allPRs = [];
  let page = 1;

  while (true) {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/pulls?state=all&per_page=100&page=${page}`,
      method: 'GET',
      headers: {
        'User-Agent': 'node.js',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const res = await makeRequest(options);
    if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
      break;
    }

    allPRs = allPRs.concat(res.data);
    if (res.data.length < 100) {
      break;
    }
    page++;
  }

  return allPRs;
}

async function processPR(pr) {
  const currentLabels = (pr.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  let updatedLabels = [...currentLabels];
  let labelsChanged = false;

  // 1. Ensure ECSoC26 label is present
  if (!updatedLabels.includes('ECSoC26')) {
    updatedLabels.push('ECSoC26');
    labelsChanged = true;
  }

  // 2. Add domain-specific labels if missing
  const titleLower = (pr.title || '').toLowerCase();

  if (titleLower.includes('fix') || titleLower.includes('bug')) {
    if (!updatedLabels.includes('bug')) { updatedLabels.push('bug'); labelsChanged = true; }
  }
  if (titleLower.includes('bump') || titleLower.includes('deps') || titleLower.includes('dependencies')) {
    if (!updatedLabels.includes('dependencies')) { updatedLabels.push('dependencies'); labelsChanged = true; }
  }
  if (titleLower.includes('ui') || titleLower.includes('frontend') || titleLower.includes('navbar') || titleLower.includes('css')) {
    if (!updatedLabels.includes('frontend')) { updatedLabels.push('frontend'); labelsChanged = true; }
  }
  if (titleLower.includes('backend') || titleLower.includes('api') || titleLower.includes('db') || titleLower.includes('sql')) {
    if (!updatedLabels.includes('backend')) { updatedLabels.push('backend'); labelsChanged = true; }
  }

  // 3. Ensure [ECSoC26] title prefix
  let newTitle = pr.title;
  let titleChanged = false;

  if (!pr.title.includes('ECSoC26') && !pr.title.includes('ECSoC')) {
    newTitle = `[ECSoC26] ${pr.title}`;
    titleChanged = true;
  }

  if (labelsChanged || titleChanged) {
    const patchBody = {};
    if (labelsChanged) patchBody.labels = updatedLabels;
    if (titleChanged) patchBody.title = newTitle;

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/issues/${pr.number}`,
      method: 'PATCH',
      headers: {
        'User-Agent': 'node.js',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    try {
      const res = await makeRequest(options, patchBody);
      return { status: 'updated', number: pr.number, title: newTitle, labels: updatedLabels, statusCode: res.statusCode };
    } catch (e) {
      return { status: 'error', number: pr.number, error: e.message };
    }
  }

  return { status: 'skipped', number: pr.number, title: pr.title };
}

async function run() {
  console.log('====================================================');
  console.log(`🤖 Batch Processing & Labeling ALL Pull Requests in ${OWNER}/${REPO}`);
  console.log('====================================================\n');

  console.log('Fetching pull requests inventory from GitHub API...');
  const prs = await fetchAllPRs();
  console.log(`Found ${prs.length} total pull requests in repository.\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const res = await processPR(pr);

    if (res.status === 'updated') {
      updatedCount++;
      console.log(`[${i + 1}/${prs.length}] \x1b[32mUpdated PR #${pr.number}:\x1b[0m "${res.title}" -> Added ECSoC26 label & formatted title`);
    } else if (res.status === 'skipped') {
      skippedCount++;
      console.log(`[${i + 1}/${prs.length}] \x1b[33mAlready Verified PR #${pr.number}:\x1b[0m "${pr.title}"`);
    } else {
      failedCount++;
      console.error(`[${i + 1}/${prs.length}] \x1b[31mFailed PR #${pr.number}:\x1b[0m "${pr.title}"`);
    }

    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log('\n====================================================');
  console.log('📊 Pull Request Batch Labeling Summary');
  console.log('====================================================');
  console.log(`• Total PRs Processed    : ${prs.length}`);
  console.log(`• PRs Labeled / Formatted: ${updatedCount}`);
  console.log(`• Already Compliant PRs  : ${skippedCount}`);
  console.log(`• Failed Updates         : ${failedCount}`);
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('Fatal PR labeling script error:', err);
  process.exit(1);
});
