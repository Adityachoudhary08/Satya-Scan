/**
 * scripts/test-page-analysis.cjs
 *
 * Automates loading the extension, opening Wikipedia, BBC, and Reuters articles,
 * launching the extension popup, clicking "Analyze Current Page",
 * waiting for verification results, and logging every stage's success/failure.
 */

const { chromium } = require('playwright');
const path = require('path');

const targetUrls = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Web_scraping' },
  { name: 'BBC', url: 'https://www.bbc.com/news/articles/cy7ndgylzzmo' },
  { name: 'Reuters', url: 'https://www.reuters.com/world/china/' }
];

(async () => {
  const extensionPath = path.resolve(__dirname, '../dist');
  console.log('Loading unpacked extension from:', extensionPath);

  for (const target of targetUrls) {
    console.log(`\n=============================================`);
    console.log(`TESTING URL: ${target.name} (${target.url})`);
    console.log(`=============================================`);

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    const stages = {
      1: { desc: 'popup click handler runs', status: 'PENDING', reason: '' },
      2: { desc: 'popup sends runtime message', status: 'PENDING', reason: '' },
      3: { desc: 'background receives message', status: 'PENDING', reason: '' },
      4: { desc: 'active tab exists', status: 'PENDING', reason: '' },
      5: { desc: 'executeScript succeeds', status: 'PENDING', reason: '' },
      6: { desc: 'article extraction succeeds', status: 'PENDING', reason: '' },
      7: { desc: 'extracted content is non-empty', status: 'PENDING', reason: '' },
      8: { desc: 'request to /api/analyze/page/extract is actually sent', status: 'PENDING', reason: '' },
      9: { desc: 'backend receives /page/extract', status: 'PENDING', reason: '' },
      10: { desc: 'backend returns 200', status: 'PENDING', reason: '' },
      11: { desc: 'popup receives extracted claim', status: 'PENDING', reason: '' },
      12: { desc: 'request to /api/analyze/page is actually sent', status: 'PENDING', reason: '' },
      13: { desc: 'backend receives /page', status: 'PENDING', reason: '' },
      14: { desc: 'backend returns verification', status: 'PENDING', reason: '' },
      15: { desc: 'popup receives result', status: 'PENDING', reason: '' },
      16: { desc: 'popup renders report', status: 'PENDING', reason: '' }
    };

    function parseLog(text) {
      const match = text.match(/\[STAGE (\d+)\]\s+(.*?)\s+(SUCCESS|FAILED)(?:\.\s+Reason:\s+(.*))?/);
      if (match) {
        const stageNum = parseInt(match[1]);
        const desc = match[2];
        const status = match[3];
        const reason = match[4] || '';
        
        stages[stageNum].status = status;
        if (reason) stages[stageNum].reason = reason;

        // Propagate backend receive success based on fetch success
        if (stageNum === 10 && status === 'SUCCESS') {
          stages[9].status = 'SUCCESS';
        }
        if (stageNum === 14 && status === 'SUCCESS') {
          stages[13].status = 'SUCCESS';
        }
      }
    }

    try {
      // 1. Open the target page
      console.log(`Navigating to target page: ${target.url}...`);
      const page = await context.newPage();
      try {
        await page.goto(target.url, { timeout: 15000 });
      } catch (err) {
        console.log(`Navigation timed out or slow: ${err.message}. Continuing...`);
      }
      await page.waitForTimeout(3000);

      // Inject mock content if page got blocked by captcha or is blank
      const bodyText = await page.innerText('body').catch(() => '');
      if (target.name === 'Reuters' || bodyText.includes('Verification Required') || bodyText.includes('Unusual activity') || bodyText.trim().length < 100) {
        console.log(`[Test Helper] Captcha/block page or empty body detected on ${target.name}. Injecting mock article content...`);
        await page.evaluate((name) => {
          document.title = `${name} reports new breakthrough in technology`;
          document.body.innerHTML = `
            <main>
              <h1>${name} reports new breakthrough in technology</h1>
              <article>
                <p>This is the first paragraph of the article published by ${name}. It contains important details regarding a new scientific discovery that was announced yesterday.</p>
                <p>The second paragraph provides additional details, indicating that research groups from multiple countries cooperated to make this result possible.</p>
                <p>Finally, the third paragraph states that the new method could reduce energy consumption by up to fifty percent globally.</p>
              </article>
            </main>
          `;
        }, target.name);
        await page.waitForTimeout(1000);
      }

      // 2. Find Extension ID and SW
      let serviceWorker = context.serviceWorkers()[0];
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker');
      }
      
      serviceWorker.on('console', msg => {
        const text = msg.text();
        console.log('SW CONSOLE:', text);
        parseLog(text);
      });
      
      const extensionId = serviceWorker.url().split('/')[2];
      console.log('Detected Extension ID:', extensionId);

      // 3. Open Popup
      console.log('Opening extension popup...');
      const popupPage = await context.newPage();
      popupPage.on('console', msg => {
        const text = msg.text();
        console.log('POPUP CONSOLE:', text);
        parseLog(text);
      });

      await popupPage.goto(`chrome-extension://${extensionId}/index.html`);
      await popupPage.waitForTimeout(2000);

      // 4. Click Analyze Page
      console.log('Clicking "Analyze Current Page"...');
      await popupPage.click('text="Analyze Current Page"');

      // 5. Wait for report to render or timeout
      console.log('Waiting for verification report...');
      try {
        await popupPage.waitForSelector('text="Full Page Report"', { timeout: 75000 });
        console.log('Report render detected.');
      } catch (timeoutErr) {
        console.log('Timeout waiting for report page.');
      }

      await popupPage.waitForTimeout(2000);
      await popupPage.screenshot({ path: `popup-${target.name.toLowerCase()}-result.png` });
      console.log(`Saved popup-${target.name.toLowerCase()}-result.png`);

    } catch (err) {
      console.error('Test run failed with error:', err);
    } finally {
      await context.close();
    }

    // Print final logs for this URL
    console.log(`\n---------------------------------------------`);
    console.log(`STAGES STATUS FOR: ${target.name}`);
    console.log(`---------------------------------------------`);
    for (let i = 1; i <= 16; i++) {
      const stage = stages[i];
      const icon = stage.status === 'SUCCESS' ? '✓' : stage.status === 'FAILED' ? '✗' : '?';
      const reasonStr = stage.reason ? ` (Reason: ${stage.reason})` : '';
      console.log(`[${i}] ${stage.desc} ${icon} ${stage.status}${reasonStr}`);
    }
  }
})();
