/* eslint-disable no-param-reassign */
import { setTimeout } from 'node:timers/promises';

import { Actor, log } from 'apify';
import { gotScraping } from 'crawlee';

async function parallelLimit(tasks, limit) {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean, clean);
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

await Actor.init();

Actor.on('aborting', async () => {
    log.warning('Actor is aborting! Making sure state is handled.');
    await setTimeout(1000);
    await Actor.exit();
});

try {
    const input = (await Actor.getInput()) || {};
    const {
        subreddit = 'javascript',
        maxPosts = 50,
        searchKeyword,
        scrapeComments = false,
        proxyConfiguration: proxyInput,
    } = input;

    if (!subreddit) {
        throw new Error('Input parameter "subreddit" is required.');
    }

    // Proxy setup
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
    let proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;

    if (proxyUrl) {
        log.info('Using Apify proxy configuration.');
    }

    let url;
    if (searchKeyword && searchKeyword.trim().length > 0) {
        log.info(`Searching for "${searchKeyword}" in Reddit r/${subreddit} (max ${maxPosts} posts)`);
        const query = encodeURIComponent(searchKeyword.trim());
        url = `https://www.reddit.com/r/${subreddit}/search.json?q=${query}&restrict_sr=1&limit=${maxPosts}`;
    } else {
        log.info(`Fetching top ${maxPosts} posts from Reddit r/${subreddit}`);
        url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${maxPosts}`;
    }

    // Attempt request with retry and proxy rotation logic
    let res;
    let cookieHeader = '';
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Retrieve a fresh proxy URL on each attempt (if configured)
            proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
            if (proxyUrl && attempt > 1) {
                log.info(`Attempt ${attempt}: Rotated to a new proxy IP.`);
            }

            // 1. Session cookie warm-up
            cookieHeader = '';
            const mainUrl = `https://www.reddit.com/r/${subreddit}`;
            log.info(`Warming up session cookies from ${mainUrl} (Attempt ${attempt}/${maxRetries})...`);
            const warmUpRes = await gotScraping({
                url: mainUrl,
                proxyUrl,
                throwHttpErrors: false,
                timeout: { request: 10000 },
            });

            if (warmUpRes.statusCode !== 200) {
                log.warning(`Session warm up returned status ${warmUpRes.statusCode} on attempt ${attempt}.`);
                if (attempt < maxRetries) {
                    await setTimeout(1500);
                    continue;
                }
            } else {
                const cookies = warmUpRes.headers['set-cookie'] || [];
                cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
                log.info(`Session warmed up successfully. Acquired ${cookies.length} cookies.`);
            }

            // 2. Fetch posts
            res = await gotScraping({
                url,
                proxyUrl,
                headers: cookieHeader ? { cookie: cookieHeader } : {},
                responseType: 'json',
                throwHttpErrors: false,
                timeout: { request: 10000 },
            });

            if (res.statusCode === 200) {
                break; // Successful request
            } else {
                log.warning(`Reddit API responded with ${res.statusCode} on attempt ${attempt}.`);
                if (attempt < maxRetries) {
                    await setTimeout(1500);
                    continue;
                }
            }
        } catch (err) {
            log.warning(`Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            if (attempt < maxRetries) {
                await setTimeout(1500);
                continue;
            }
            throw err;
        }
    }

    if (!res || res.statusCode !== 200) {
        const status = res ? res.statusCode : 'no response';
        log.error(`Reddit API failed after ${maxRetries} attempts with status ${status}`);
        if (res && res.body) {
            const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
            log.debug(text);
        }
        throw new Error(`HTTP error: ${status}`);
    }

    const json = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    if (!json || !json.data || !json.data.children) {
        throw new Error('Invalid response from Reddit API');
    }

    const posts = json.data.children.map(({ data: p }) => ({
        title: p.title,
        author: p.author,
        upvotes: p.score,
        commentCount: p.num_comments,
        url: `https://reddit.com${p.permalink}`,
        text: p.selftext || '',
        subreddit: p.subreddit,
        created: new Date(p.created_utc * 1000).toISOString(),
    }));

    log.info(`Extracted ${posts.length} posts.`);

    if (scrapeComments) {
        log.info('Extracting top comments for each post...');

        const scrapePostComments = async (post) => {
            const maxCommentRetries = 3;
            for (let attempt = 1; attempt <= maxCommentRetries; attempt++) {
                try {
                    const currentProxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
                    const commentsUrl = `${post.url.replace(/\/$/, '')}.json?limit=10`;
                    log.info(`Fetching comments for: ${post.title} (Attempt ${attempt}/${maxCommentRetries})`);
                    const cRes = await gotScraping({
                        url: commentsUrl,
                        proxyUrl: currentProxyUrl,
                        headers: cookieHeader ? { cookie: cookieHeader } : {},
                        responseType: 'json',
                        throwHttpErrors: false,
                        timeout: { request: 8000 },
                    });

                    if (cRes.statusCode === 200) {
                        const cJson = typeof cRes.body === 'string' ? JSON.parse(cRes.body) : cRes.body;
                        const commentsData = cJson[1]?.data?.children || [];

                        post.comments = commentsData
                            .filter((c) => c.kind === 't1' && c.data && c.data.body)
                            .map((c) => ({
                                author: c.data.author,
                                upvotes: c.data.score,
                                body: c.data.body,
                                created: new Date(c.data.created_utc * 1000).toISOString(),
                            }));
                        return; // Success!
                    }
                    log.warning(
                        `Failed to load comments for ${post.url} (Status: ${cRes.statusCode}) on attempt ${attempt}`,
                    );
                } catch (err) {
                    log.warning(`Error extracting comments for ${post.title} on attempt ${attempt}: ${err.message}`);
                }

                if (attempt < maxCommentRetries) {
                    await setTimeout(500);
                }
            }
            post.comments = [];
        };

        const tasks = posts.map((post) => () => scrapePostComments(post));
        await parallelLimit(tasks, 10);
    }

    await Actor.pushData(posts);
    log.info('Successfully saved data.');
} catch (error) {
    log.exception(error, 'Actor execution failed');
} finally {
    await Actor.exit();
}
