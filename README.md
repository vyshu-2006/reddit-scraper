## What does Reddit Hot Scraper do?

Reddit Hot Scraper is an ultra-fast, premium Apify Actor that extracts the top/hottest posts or searches for specific keywords across any subreddit. It pulls data directly from the Reddit JSON API, minimizing overhead and returning data in milliseconds.

Because it supports **Apify Residential Proxies** and **Deep Comment Extraction**, it stands far above the rest—yielding pure data at scale without getting blocked.

It allows you to extract:

- Post Titles & Authors
- Upvote counts and Comment counts
- Top 10 Comments per post (Optional)
- Search Specific Keywords via Reddit Search
- Clean direct URLs
- The raw text content of the post
- Formatting and creation dates

## Why use Reddit Hot Scraper?

- **Search Enabled**: Tap into historical context or specific conversations by running deep keyword searches inside any community.
- **Deep Comment Extraction**: Not just posts! Enable `scrapeComments` to extract the most upvoted comments from every post automatically, supplying high-quality community sentiment straight to your dataset.
- **Proxy Supported**: Built-in `proxyConfiguration` seamlessly routes requests through Apify infrastructure, rendering your scraper invisible to anti-bot algorithms.
- **Cheap**: Despite the premium features, bypassing bloated headless browsers guarantees fractional costs per run (less than traditional crawlers).

## How to use Reddit Hot Scraper

1. Go to the **Input** tab.
2. Enter the name of the `subreddit` you want to scrape (e.g. `javascript`, `python`, `news`).
3. (Optional) Enter a `searchKeyword` if you want to find specific topics instead of general hot posts.
4. Set the `maxPosts` number.
5. (Optional) Check the `scrapeComments` toggle to extract top comments for every post found.
6. Check your `proxyConfiguration` to ensure you are avoiding rate limits.
7. Click **Start**.

## Input

| Field                  | Type    | Description                                                                                        |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `subreddit` (required) | String  | The exact name of the subreddit without "r/" (e.g., `javascript`)                                  |
| `maxPosts`             | Integer | Maximum number of posts to pull (default `10`).                                                    |
| `searchKeyword`        | String  | A specific keyword or phrase to search within the subreddit.                                       |
| `scrapeComments`       | Boolean | If true, recursively fetches the highest rated comments for each post (slightly slower execution). |
| `proxyConfiguration`   | Object  | Connect to Apify residential/datacenter proxies.                                                   |

## Output

The tool outputs a clean dataset with a structure like this:

```json
{
    "title": "Help! What does this javascript error mean?",
    "author": "devguru99",
    "upvotes": 412,
    "commentCount": 34,
    "url": "https://reddit.com/r/javascript/comments/...",
    "text": "I was working on my node app and saw this...",
    "subreddit": "javascript",
    "created": "2024-03-24T18:32:00.000Z",
    "comments": [
        {
            "author": "helpfulDev",
            "upvotes": 120,
            "body": "You forgot to await a promise!",
            "created": "2024-03-24T18:35:00.000Z"
        }
    ]
}
```

## Pricing / Cost estimation

Since this uses pure HTTP requests via lightweight Axios fetching, running this scraper costs merely fractions of a cent per run. You can comfortably scrape thousands of posts! Even with `scrapeComments` enabled, it uses highly optimized concurrent endpoint requests.

## Disclaimer

Always respect Reddit's API Terms of Service. This tool is built strictly for structural extraction of publicly available top posts.
