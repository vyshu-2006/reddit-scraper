import { setTimeout } from 'node:timers/promises';

import { Actor, log } from 'apify';
import { gotScraping } from 'crawlee';

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
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;

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

    const res = await gotScraping({
        url,
        proxyUrl,
        responseType: 'json',
        throwHttpErrors: false,
    });

    if (res.statusCode !== 200) {
        log.error(`Reddit API responded with ${res.statusCode}`);
        const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        log.debug(text);
        throw new Error(`HTTP error: ${res.statusCode}`);
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
        url: `https://reddit.com${  p.permalink}`,
        text: p.selftext || '',
        subreddit: p.subreddit,
        created: new Date(p.created_utc * 1000).toISOString(),
    }));

    log.info(`Extracted ${posts.length} posts.`);

    if (scrapeComments) {
        log.info('Extracting top comments for each post...');
        for (const post of posts) {
            try {
                const commentsUrl = `${post.url.replace(/\/$/, '')}.json?limit=10`;
                log.info(`Fetching comments for: ${post.title}`);
                const cRes = await gotScraping({
                    url: commentsUrl,
                    proxyUrl,
                    responseType: 'json',
                    throwHttpErrors: false,
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
                } else {
                    log.warning(`Failed to load comments for ${post.url} (Status: ${cRes.statusCode})`);
                    post.comments = [];
                }

                // Be gentle with the API
                await setTimeout(500);
            } catch (err) {
                log.warning(`Error extracting comments for ${post.title}: ${err.message}`);
                post.comments = [];
            }
        }
    }

    await Actor.pushData(posts);
    log.info('Successfully saved data.');
} catch (error) {
    log.exception(error, 'Actor execution failed');
} finally {
    await Actor.exit();
}
