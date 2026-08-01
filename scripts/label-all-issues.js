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

async function fetchAllIssues() {
  let allIssues = [];
  let page = 1;

  while (true) {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/issues?state=all&per_page=100&page=${page}`,
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

    // Filter out Pull Requests (they have a pull_request property)
    const issuesOnly = res.data.filter(item => !item.pull_request);
    allIssues = allIssues.concat(issuesOnly);

    if (res.data.length < 100) {
      break;
    }

    page++;
  }

  return allIssues;
}

async function addLabelToIssue(issue) {
  const currentLabelNames = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  
  if (currentLabelNames.includes('ECSoC26')) {
    return { status: 'skipped', number: issue.number, title: issue.title };
  }

  const updatedLabels = [...currentLabelNames, 'ECSoC26'];

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/issues/${issue.number}`,
    method: 'PATCH',
    headers: {
      'User-Agent': 'node.js',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  try {
    const res = await makeRequest(options, { labels: updatedLabels });
    if (res.statusCode === 200) {
      return { status: 'updated', number: issue.number, title: issue.title, labels: updatedLabels };
    } else {
      return { status: 'failed', number: issue.number, title: issue.title, statusCode: res.statusCode };
    }
  } catch (err) {
    return { status: 'error', number: issue.number, title: issue.title, error: err.message };
  }
}

async function run() {
  console.log('====================================================');
  console.log(`🏷️ Labeling All GitHub Issues in ${OWNER}/${REPO} with ECSoC26`);
  console.log('====================================================\n');

  console.log('Fetching issue inventory from GitHub API...');
  const issues = await fetchAllIssues();
  console.log(`Found ${issues.length} total issues in repository.\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const res = await addLabelToIssue(issue);

    if (res.status === 'updated') {
      updatedCount++;
      console.log(`[${i + 1}/${issues.length}] \x1b[32mUpdated:\x1b[0m Issue #${issue.number} "${issue.title}" -> Added ECSoC26 label`);
    } else if (res.status === 'skipped') {
      skippedCount++;
      console.log(`[${i + 1}/${issues.length}] \x1b[33mAlready Labeled:\x1b[0m Issue #${issue.number} "${issue.title}"`);
    } else {
      failedCount++;
      console.error(`[${i + 1}/${issues.length}] \x1b[31mFailed:\x1b[0m Issue #${issue.number} "${issue.title}"`);
    }

    // Small delay to prevent rate limit throttling
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log('\n====================================================');
  console.log('📊 Issue Labeling Completion Report');
  console.log('====================================================');
  console.log(`• Total Issues Processed : ${issues.length}`);
  console.log(`• Newly Labeled ECSoC26  : ${updatedCount}`);
  console.log(`• Already Labeled        : ${skippedCount}`);
  console.log(`• Failed Updates         : ${failedCount}`);
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('Fatal labeling script error:', err);
  process.exit(1);
});
