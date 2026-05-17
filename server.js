const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// TRENDING CONTENT CACHE
// Uses Wikipedia Pageviews API (free, no key needed) + Gemini
// Cache is refreshed every 6 hours to stay well within rate limits
// ============================================================
let trendingCache = null;
let cacheTimestamp = null;
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// Pages to always exclude from trending results
const EXCLUDED_PAGES = [
    'Main_Page', 'Special:', 'Wikipedia:', 'Portal:', 'Help:',
    'File:', 'Template:', 'User:', 'Talk:', 'Category:',
    'Undefined', 'Deaths_in_', '-'
];

function isExcluded(title) {
    return EXCLUDED_PAGES.some(ex => title.includes(ex));
}

async function buildTrendingContent() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Fetch yesterday's top Wikipedia pageviews
    // (today's data is often not yet available)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');

    const wikiUrl = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${day}`;

    const wikiRes = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'WikiSearch/2.0 (educational project; contact@wikisearch.app)' }
    });

    if (!wikiRes.ok) {
        throw new Error(`Wikipedia API failed: ${wikiRes.status}`);
    }

    const wikiData = await wikiRes.json();
    const allArticles = wikiData.items[0].articles;

    // Filter and take top 8 real article titles
    const topTopics = allArticles
        .filter(a => !isExcluded(a.article))
        .slice(0, 8)
        .map(a => a.article.replace(/_/g, ' '));

    if (!GEMINI_API_KEY) {
        // Return basic data without AI enrichment
        return {
            topics: topTopics.slice(0, 6).map(title => ({
                title,
                category: 'Trending',
                description: `${title} is currently one of the most-read topics on Wikipedia worldwide.`,
                book: { title: 'The Library of Babel', author: 'Jorge Luis Borges', reason: 'A timeless exploration of infinite knowledge.' }
            })),
            scholarlyAnalysis: 'Explore the world\'s most trending topics right now.',
            generatedAt: new Date().toISOString()
        };
    }

    // Use Gemini once to enrich all topics in a single API call
    const geminiPrompt = `You are a scholarly AI curator. Here are today's 8 most-read Wikipedia topics worldwide:
${topTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For each topic, provide:
1. A 2-sentence engaging description (no fluff, be informative and interesting)
2. The best category from: Technology, Science, Culture, Geopolitics, History, Arts, Sports, Entertainment, Nature, Business
3. One real book recommendation with a one-sentence reason

Also write a 2-sentence scholarly synthesis of what these trending topics reveal about global attention today.

IMPORTANT: Return ONLY a raw JSON object. No markdown, no backticks, no extra text. Use this exact structure:
{
  "topics": [
    {
      "title": "exact topic name",
      "category": "category",
      "description": "2-sentence description",
      "book": {
        "title": "Real Book Title",
        "author": "Real Author Name",
        "reason": "one sentence why"
      }
    }
  ],
  "scholarlyAnalysis": "2-sentence synthesis"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] })
    });

    const geminiData = await geminiRes.json();

    if (geminiData.error) {
        throw new Error(`Gemini error: ${geminiData.error.message}`);
    }

    const rawText = geminiData.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    parsed.generatedAt = new Date().toISOString();

    return parsed;
}

async function getTrendingContent() {
    const now = Date.now();
    // Return cached result if still fresh
    if (trendingCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION_MS) {
        console.log('[Trending] Serving from cache');
        return trendingCache;
    }

    console.log('[Trending] Refreshing cache...');
    try {
        trendingCache = await buildTrendingContent();
        cacheTimestamp = now;
        console.log('[Trending] Cache refreshed successfully at', new Date().toISOString());
    } catch (err) {
        console.error('[Trending] Cache refresh failed:', err.message);
        // If refresh fails and we have old data, keep serving it
        if (!trendingCache) {
            // Absolute fallback
            trendingCache = {
                topics: [
                    { title: 'Quantum Computing', category: 'Technology', description: 'Quantum computers harness quantum mechanics to solve problems exponentially faster than classical computers. They promise to revolutionize fields from cryptography to drug discovery.', book: { title: 'Quantum Computing: An Applied Approach', author: 'Jack Hidary', reason: 'The definitive practical guide to understanding and building quantum systems.' } },
                    { title: 'Climate Change', category: 'Science', description: 'Earth\'s climate is warming faster than at any point in recorded history due to human greenhouse gas emissions. The consequences span from rising seas to extreme weather events globally.', book: { title: 'The Uninhabitable Earth', author: 'David Wallace-Wells', reason: 'A visceral, scientifically grounded portrait of our climate future.' } },
                    { title: 'Artificial Intelligence', category: 'Technology', description: 'AI systems are now matching and surpassing human performance across a growing range of cognitive tasks. The technology is reshaping industries, labor markets, and the nature of creativity itself.', book: { title: 'Life 3.0', author: 'Max Tegmark', reason: 'Explores what it means to be human in the age of artificial intelligence.' } },
                    { title: 'Space Exploration', category: 'Science', description: 'Humanity is entering a new golden age of space exploration, with missions to the Moon, Mars, and beyond being planned by both governments and private companies. The commercialization of space is transforming what is possible.', book: { title: 'An Astronaut\'s Guide to Life on Earth', author: 'Chris Hadfield', reason: 'Life lessons from the cosmos, told by a legendary space explorer.' } },
                    { title: 'Global Economics', category: 'Business', description: 'The world economy is navigating unprecedented challenges including inflation, supply chain disruptions, and geopolitical tensions. New financial technologies are simultaneously reshaping how value is created and distributed.', book: { title: 'The Wealth of Nations', author: 'Adam Smith', reason: 'The foundational text for understanding how economies function.' } },
                    { title: 'Cultural Heritage', category: 'Culture', description: 'As globalization accelerates, communities worldwide are grappling with how to preserve their unique cultural identities and historical legacies. Museums and institutions are redefining who owns history.', book: { title: 'The Buried Giant', author: 'Kazuo Ishiguro', reason: 'A profound meditation on memory, identity, and what societies choose to forget.' } }
                ],
                scholarlyAnalysis: 'Today\'s most-read topics reflect humanity\'s dual fascination with technological possibility and cultural identity. The global mind simultaneously reaches outward toward the cosmos and inward toward the question of what it means to be human.',
                generatedAt: new Date().toISOString()
            };
            cacheTimestamp = now;
        }
    }

    return trendingCache;
}

// Warm up the cache when server starts
getTrendingContent().catch(err => console.error('[Trending] Initial warm-up failed:', err.message));

// ============================================================
// API ROUTES
// ============================================================

const aliases = {
    'notepad': 'notepad.exe', 'notes': 'notepad.exe',
    'calc': 'calc.exe', 'calculator': 'calc.exe',
    'paint': 'mspaint.exe', 'explorer': 'explorer.exe', 'cmd': 'cmd.exe',
};

function resolveWindowsApp(appName) {
    const key = appName.trim().toLowerCase();
    if (aliases[key]) return aliases[key];
    if (!appName.includes('.')) return appName + '.exe';
    return appName;
}

function removePunctuation(s) {
    return s.replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
}

const fillers = [
    "can you tell me about ", "tell me about ", "i want to know about ",
    "what are ", "what is ", "whats ", "explain ", "define ", "describe ",
    "how does ", "about "
];

function normalizeQuestion(s) {
    let text = removePunctuation(s.toLowerCase().trim());
    let changed = true;
    while (changed) {
        changed = false;
        for (const filler of fillers) {
            if (text.startsWith(filler)) {
                text = text.substring(filler.length).trim();
                changed = true;
                break;
            }
        }
    }
    return text;
}

// GET /api/trending — returns cached trending topics + book recs
app.get('/api/trending', async (req, res) => {
    try {
        const data = await getTrendingContent();
        res.json(data);
    } catch (err) {
        console.error('[/api/trending] Error:', err);
        res.status(500).json({ error: 'Could not load trending content.' });
    }
});

// POST /api/chat — main Gemini chat endpoint
app.post('/api/chat', async (req, res) => {
    const userInput = req.body.message || "";
    const lowerInput = userInput.toLowerCase().trim();

    if (lowerInput === 'help' || lowerInput === '?') {
        return res.json({ response: "=== WikiSearch Help ===\nJust ask me any question and I will provide a deeply informative, scholarly response!" });
    }

    if (lowerInput.startsWith('open app ')) {
        const appName = userInput.substring(9).trim();
        if (!appName) return res.json({ response: "[WikiSearch Action]: Please specify an app name." });
        const target = resolveWindowsApp(appName);
        exec(`start "" "${target}"`, (error) => { if (error) console.error(`exec error: ${error}`); });
        return res.json({ response: `[WikiSearch Action]: Opening app -> ${target}` });
    }

    if (lowerInput.startsWith('whatsapp ')) {
        const args = userInput.substring(9).trim();
        const spacePos = args.indexOf(' ');
        if (spacePos === -1) return res.json({ response: "[WikiSearch Action]: Please specify phone number and message." });
        const phone = args.substring(0, spacePos).trim();
        const msg = args.substring(spacePos + 1).trim();
        const uri = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}`;
        exec(`start "" "${uri}"`, (error) => { if (error) console.error(`exec error: ${error}`); });
        return res.json({ response: `[WikiSearch Action]: Opened WhatsApp to send message to ${phone}` });
    }

    if (!userInput) {
        return res.json({ response: "I'm not sure what you're asking. Try asking a question!" });
    }

    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY) {
            return res.json({ response: "⚠️ **API Key Missing!**\n\nPlease go to your Render Dashboard → Environment Variables → Add `GEMINI_API_KEY`." });
        }

        const geminiPrompt = `You are WikiSearch, an incredibly intelligent, scholarly AI assistant with access to vast human knowledge.
A user is asking you: "${userInput}"
Please provide a helpful, fascinating, and accurate response. Format it nicely with markdown if appropriate (use bolding, bullet points, etc). Keep it concise but deeply informative.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] })
        });

        const data = await geminiRes.json();

        if (data.error && data.error.code === 429) {
            console.warn("Gemini Rate Limit Hit");
            return res.json({ response: "### 🚦 Whoa, slow down!\n\nThe Gemini API rate limit has been reached. Please wait about 30 seconds and try again." });
        }

        if (data.candidates && data.candidates.length > 0) {
            return res.json({ response: data.candidates[0].content.parts[0].text });
        } else {
            console.error("Gemini unexpected response:", data);
            return res.json({ response: "I'm sorry, my neural pathways are a bit tangled right now. Please try again!" });
        }

    } catch (error) {
        console.error("Gemini API error:", error);
        return res.json({ response: "Oops, I'm having trouble connecting right now. Please try again later." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WikiSearch backend running on port ${PORT}`);
});
