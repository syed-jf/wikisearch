const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const RssParser = require('rss-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// SMART IN-MEMORY QUERY CACHE (Layer 2)
// Normalized user queries mapped to Gemini responses.
// Expired after 24 hours to keep responses fresh.
// ============================================================
const queryCache = new Map();
const QUERY_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================
// GLOBAL GEMINI RATE GUARD
// Enforces minimum 3-second gap between real API calls.
// ============================================================
let lastGeminiCallTime = 0;
const GEMINI_MIN_INTERVAL_MS = 3000; // 3 seconds minimum between calls

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

async function callAI(prompt, systemInstruction = '', isJson = false) {
    const GEMINI_KEYS = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3
    ].filter(Boolean);

    let lastErrorType = null;
    let lastErrorMessage = '';

    // 1. Try Gemini keys sequentially
    if (GEMINI_KEYS.length > 0) {
        for (let keyIdx = 0; keyIdx < GEMINI_KEYS.length; keyIdx++) {
            const currentKey = GEMINI_KEYS[keyIdx];
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    // Respect global pace guard
                    const timeSinceLastCall = Date.now() - lastGeminiCallTime;
                    if (timeSinceLastCall < GEMINI_MIN_INTERVAL_MS) {
                        await new Promise(r => setTimeout(r, GEMINI_MIN_INTERVAL_MS - timeSinceLastCall));
                    }
                    lastGeminiCallTime = Date.now();

                    const modelName = isJson ? "gemini-2.0-flash" : "gemini-2.0-flash";
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;
                    
                    const requestBody = {
                        contents: [{ parts: [{ text: `${systemInstruction}\n\nUser Input: ${prompt}` }] }]
                    };

                    const geminiRes = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });

                    const data = await geminiRes.json();

                    if (data.error) {
                        if (data.error.code === 429) {
                            console.warn(`[Failover] Gemini Key ${keyIdx + 1} Attempt ${attempt} hit 429 (Rate Limit)`);
                            lastErrorType = '429';
                            lastErrorMessage = data.error.message;
                            if (attempt < 2) {
                                await new Promise(r => setTimeout(r, 1500));
                                continue;
                            }
                            break; // Move to next key
                        }
                        if (data.error.code === 503 || data.error.status === 'UNAVAILABLE') {
                            console.warn(`[Failover] Gemini Key ${keyIdx + 1} Attempt ${attempt} hit 503 (Unavailable)`);
                            lastErrorType = '503';
                            lastErrorMessage = data.error.message;
                            if (attempt < 2) {
                                await new Promise(r => setTimeout(r, 1500));
                                continue;
                            }
                            break; // Move to next key
                        }
                        throw new Error(`Gemini Error: ${data.error.message}`);
                    }

                    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
                        console.log(`[Failover] Success! Answered via Gemini Key ${keyIdx + 1}`);
                        return data.candidates[0].content.parts[0].text;
                    } else {
                        throw new Error('Unexpected empty response structure from Gemini');
                    }

                } catch (err) {
                    console.error(`[Failover] Gemini Key ${keyIdx + 1} Attempt ${attempt} error:`, err.message);
                    lastErrorType = 'other';
                    lastErrorMessage = err.message;
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                }
            }
        }
    }

    // 2. If all Gemini keys failed or no keys were provided, try Groq
    if (process.env.GROQ_API_KEY) {
        console.log('[Failover] Initiating failover to Groq API...');
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: systemInstruction || "You are WikiSearch, an incredibly intelligent, scholarly AI assistant." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.7
                    })
                });

                const groqData = await groqRes.json();
                if (groqRes.ok && groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
                    console.log('[Failover] Success! Answered via Groq!');
                    return groqData.choices[0].message.content;
                } else {
                    const errMsg = (groqData.error && groqData.error.message) || JSON.stringify(groqData);
                    console.warn(`[Failover] Groq Attempt ${attempt} failed: ${errMsg}`);
                    lastErrorType = 'groq_failed';
                    lastErrorMessage = errMsg;
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                }
            } catch (groqErr) {
                console.error(`[Failover] Groq Attempt ${attempt} exception:`, groqErr.message);
                lastErrorType = 'groq_failed';
                lastErrorMessage = groqErr.message;
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
            }
        }
    }

    // 3. Exhausted all providers
    const finalErr = new Error(`All AI providers failed. Last status: ${lastErrorType} (${lastErrorMessage})`);
    finalErr.statusType = lastErrorType;
    throw finalErr;
}

async function buildTrendingContent() {
    const GEMINI_KEYS = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3
    ].filter(Boolean);

    // Fetch yesterday's top Wikipedia pageviews
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

    if (GEMINI_KEYS.length === 0 && !process.env.GROQ_API_KEY) {
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

    try {
        const rawText = await callAI(geminiPrompt, "You are a scholarly AI curator. Return ONLY a raw JSON object.", true);
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        parsed.generatedAt = new Date().toISOString();
        return parsed;
    } catch (err) {
        console.error('[Trending] Failed to enrich topics via AI. Serving basic un-enriched data:', err.message);
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
}

// Pre-populated fallback — served INSTANTLY on boot, zero Gemini API calls.
// This ensures every deploy, restart, or cold-boot costs $0 in rate limit.
const FALLBACK_TRENDING = {
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

// Boot with fallback data immediately — zero API calls on startup
trendingCache = FALLBACK_TRENDING;
cacheTimestamp = 0; // Mark as "stale" so it refreshes on first real user request (after cooldown)

const SERVER_BOOT_TIME = Date.now();
const STARTUP_COOLDOWN_MS = 90 * 1000; // Wait 90 seconds after boot before attempting any Gemini call

async function getTrendingContent() {
    const now = Date.now();
    
    // 1. Serve from in-memory cache if fresh (less than 6 hours old)
    if (trendingCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION_MS) {
        console.log('[Trending] Serving from memory cache');
        return trendingCache;
    }

    // 2. If server just booted, serve fallback — don't touch Gemini yet
    if ((now - SERVER_BOOT_TIME) < STARTUP_COOLDOWN_MS) {
        console.log('[Trending] Within startup cooldown — serving fallback (no Gemini call)');
        return trendingCache; // Return pre-populated fallback
    }

    // 3. Cache is stale and cooldown has passed — try refreshing from Gemini
    console.log('[Trending] Refreshing cache from Gemini...');
    try {
        trendingCache = await buildTrendingContent();
        cacheTimestamp = now;
        console.log('[Trending] Cache refreshed successfully at', new Date().toISOString());
    } catch (err) {
        console.error('[Trending] Cache refresh failed:', err.message);
        // Keep serving whatever we have (fallback or last good data)
        // Don't update cacheTimestamp so it retries next request (after cooldown)
        console.log('[Trending] Continuing with existing cached data');
    }

    return trendingCache;
}

// NO warm-up call. Server boots instantly with zero Gemini API usage.
console.log('[Trending] Server booted with pre-loaded fallback data. Gemini will be called lazily after 90s cooldown.');

// ============================================================
// HELPER FUNCTIONS
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

// ============================================================
// IDEOLOGY OF THE DAY — Curated hardcoded library, zero API calls
// Rotates daily based on day-of-year
// ============================================================
const IDEOLOGIES = [
    { name: 'Marxism', era: 'mid-19th century', thinkers: ['Karl Marx', 'Friedrich Engels'], description: 'Marxism is a socioeconomic and philosophical framework that interprets human history as a series of struggles between economic classes. At its core, it holds that the material conditions of a society — chiefly who owns the means of production — determine its social relations, culture, and politics. Marx argued that capitalism, while historically necessary, contains inherent contradictions: the exploitation of the working class (proletariat) by the owning class (bourgeoisie) generates wealth for a few and poverty for many. This tension, he believed, would eventually lead to a revolutionary overthrow of capitalism and the emergence of a classless, stateless communist society. Marxism has shaped revolutions, labor movements, and intellectual life across the globe for over 150 years.', book: 'The Communist Manifesto — Karl Marx & Friedrich Engels' },
    { name: 'Existentialism', era: 'early-to-mid 20th century', thinkers: ['Jean-Paul Sartre', 'Simone de Beauvoir', 'Albert Camus'], description: 'Existentialism places the individual at the center of philosophical inquiry, asserting that existence precedes essence — that humans first exist, and then define themselves through their choices and actions. There is no predetermined human nature or divine blueprint; we are "condemned to be free," as Sartre famously put it. This radical freedom comes with radical responsibility: each choice we make defines not just ourselves but reflects what we believe all humans should do. Existentialism grapples with anxiety, absurdity, authenticity, and death. Camus explored the absurd — the collision between our hunger for meaning and the universe\'s silence — and proposed that we must imagine Sisyphus happy, embracing life despite its meaninglessness.', book: 'Being and Nothingness — Jean-Paul Sartre' },
    { name: 'Stoicism', era: '3rd century BCE', thinkers: ['Marcus Aurelius', 'Epictetus', 'Seneca'], description: 'Stoicism is one of antiquity\'s most enduring and practical philosophies, founded in Athens by Zeno of Citium. The Stoics believed that virtue — wisdom, justice, courage, and temperance — is the only true good, and that external things like wealth, fame, and pleasure are neither good nor bad in themselves. What matters is not what happens to us, but how we respond. The Stoics drew a sharp line between what is "up to us" (our thoughts, judgments, desires) and what is not (our body, reputation, the actions of others). By focusing entirely on the former and accepting the latter with equanimity, one achieves tranquility. Used by Roman emperors and enslaved men alike, Stoicism speaks to the universal human need for resilience.', book: 'Meditations — Marcus Aurelius' },
    { name: 'Utilitarianism', era: 'late 18th–19th century', thinkers: ['Jeremy Bentham', 'John Stuart Mill'], description: 'Utilitarianism holds that the morally right action is the one that produces the greatest good for the greatest number of people. It is a consequentialist theory — actions are judged solely by their outcomes, not by adherence to rules or the character of the agent. Jeremy Bentham formalized this "felicific calculus," measuring pleasure and pain to determine what acts we ought to pursue. John Stuart Mill refined the theory by distinguishing between higher and lower pleasures, arguing that intellectual and moral satisfactions outweigh mere physical gratification. Utilitarianism has profoundly shaped liberal political thought, public policy, and bioethics, though critics challenge it for potentially justifying harm to minorities for the benefit of majorities.', book: 'Utilitarianism — John Stuart Mill' },
    { name: 'Nihilism', era: '19th century', thinkers: ['Friedrich Nietzsche', 'Ivan Turgenev'], description: 'Nihilism, from the Latin nihil (nothing), is the philosophical position that life lacks inherent meaning, purpose, or intrinsic value. In its most radical form, it denies the existence of objective truth, morality, or knowledge. Nietzsche diagnosed nihilism as the defining crisis of modernity: the "death of God" — the collapse of religious and metaphysical frameworks that once provided meaning — left European culture in a spiritual vacuum. But Nietzsche was not himself a nihilist; he saw nihilism as something to be overcome. His answer was the creation of new values through the will to power and the figure of the Übermensch. Nihilism appears in literature, punk culture, and internet philosophy, often misunderstood as mere cynicism rather than a serious philosophical problem.', book: 'Thus Spoke Zarathustra — Friedrich Nietzsche' },
    { name: 'Feminism', era: '18th century–present', thinkers: ['Mary Wollstonecraft', 'Simone de Beauvoir', 'bell hooks'], description: 'Feminism is both a political movement and a body of theory dedicated to defining, establishing, and defending equal social, economic, and political rights for women. Its first wave sought basic legal rights such as suffrage; its second wave in the 1960s–70s expanded into workplace equality, reproductive rights, and domestic life. Third-wave feminism embraced intersectionality — recognizing that gender is inseparable from race, class, sexuality, and other axes of identity. Simone de Beauvoir\'s insight that "one is not born, but rather becomes, a woman" challenged the naturalization of gender roles. Contemporary feminism interrogates power, language, and institutions, asking not just for inclusion in existing structures, but a fundamental reimagining of those structures themselves.', book: 'The Second Sex — Simone de Beauvoir' },
    { name: 'Pragmatism', era: 'late 19th–early 20th century', thinkers: ['William James', 'John Dewey', 'Charles Peirce'], description: 'Pragmatism is an American philosophical tradition holding that the truth of an idea is measured by its practical consequences — by whether it works. Rather than seeking abstract, unchanging truths, pragmatists evaluate beliefs by their usefulness in solving real problems. William James argued that ideas become true insofar as they help us get into satisfactory relations with experience. John Dewey extended this into education and democracy, arguing that learning is most effective when grounded in experience and that democracy is not just a form of government but a way of associated living. Pragmatism rejects dogmatic certainty and embraces fallibilism — the humble acknowledgment that our current beliefs may need revision in light of new experience.', book: 'Pragmatism — William James' },
    { name: 'Postmodernism', era: 'mid-20th century', thinkers: ['Michel Foucault', 'Jacques Derrida', 'Jean-François Lyotard'], description: 'Postmodernism is a broad intellectual movement characterized by deep skepticism toward grand narratives, objective truth, and universal values. It arose as a reaction against Enlightenment modernism\'s confidence in reason, progress, and science. Postmodern thinkers argue that knowledge is always situated — shaped by power, language, and culture rather than neutral observation. Foucault showed how institutions like prisons, hospitals, and schools exercise and produce power. Derrida\'s deconstruction revealed the instabilities and contradictions within texts and philosophical traditions. Lyotard defined postmodernism as "incredulity toward meta-narratives." Celebrated for expanding whose voices count in knowledge-making, postmodernism is also criticized for relativism that undermines the possibility of critique itself.', book: 'The Postmodern Condition — Jean-François Lyotard' },
    { name: 'Anarchism', era: '19th century', thinkers: ['Pierre-Joseph Proudhon', 'Mikhail Bakunin', 'Emma Goldman'], description: 'Anarchism envisions a society organized without coercive hierarchies — no state, no capitalism, no domination. The term, from the Greek anarchia (without rulers), was first embraced positively by Pierre-Joseph Proudhon, who declared "property is theft." Anarchists hold that the state is not a neutral arbiter but an instrument of class domination and oppression. In its place, they propose voluntary associations, mutual aid, and self-governance. Emma Goldman wrote and lectured passionately on the links between political authority, economic exploitation, and the subjugation of women. Anarchism has inspired labor movements, anti-fascist resistance, and contemporary horizontal organizing. It remains a living tradition of thought and practice, not merely an abstract utopia.', book: 'Anarchism and Other Essays — Emma Goldman' },
    { name: 'Liberalism', era: '17th century–present', thinkers: ['John Locke', 'John Stuart Mill', 'John Rawls'], description: 'Classical liberalism holds that individual freedom is the supreme political value, and that legitimate government exists to protect the natural rights of life, liberty, and property. Locke\'s social contract theory argued that governments derive their authority from the consent of the governed, and that tyranny justifies revolution. Mill\'s harm principle holds that the only justification for limiting individual freedom is preventing harm to others. In the 20th century, John Rawls\'s "veil of ignorance" thought experiment sought to derive principles of justice that rational people would choose without knowing their place in society — yielding his difference principle, which permits inequality only when it benefits the least advantaged. Liberalism is the dominant ideology of modern democratic states, though its boundaries remain hotly contested.', book: 'A Theory of Justice — John Rawls' },
    { name: 'Confucianism', era: '6th–5th century BCE', thinkers: ['Confucius', 'Mencius'], description: 'Confucianism, one of the most influential ethical and political philosophies in human history, emerged from the teachings of Kong Qiu (Confucius) in ancient China. It centers on the cultivation of virtue and the maintenance of proper relationships — between ruler and subject, parent and child, husband and wife, elder and younger sibling, friend and friend. Through these five relationships, social harmony is achieved. The concept of ren (benevolence or humaneness) is the highest virtue: to treat others with empathy and respect. Confucius believed that good governance begins with moral self-cultivation of leaders, not force. For millennia, Confucian thought shaped Chinese law, family structure, education, and political philosophy, and continues to influence East Asian societies profoundly today.', book: 'The Analects — Confucius' },
    { name: 'Romanticism', era: 'late 18th–early 19th century', thinkers: ['Jean-Jacques Rousseau', 'William Wordsworth', 'Friedrich Schlegel'], description: 'Romanticism was a sweeping intellectual and artistic movement that arose in reaction to Enlightenment rationalism and the Industrial Revolution\'s mechanization of life. Romantics elevated emotion, imagination, nature, and individual experience over cold reason and urban industrialism. They believed that the natural world was not merely a resource but a source of spiritual truth and sublime beauty. Rousseau\'s "noble savage" challenged the assumption that civilization represents progress; he argued that humans are corrupted by society. Romantic poets like Wordsworth and Keats sought the transcendent in nature. In philosophy, the Romantics influenced German Idealism and the notion that reality is not a fixed external world but something co-created by the human mind and spirit.', book: 'Confessions — Jean-Jacques Rousseau' },
    { name: 'Structuralism', era: 'mid-20th century', thinkers: ['Ferdinand de Saussure', 'Claude Lévi-Strauss', 'Roland Barthes'], description: 'Structuralism holds that human culture, language, and society can only be understood in terms of their underlying structures — the relational systems that give elements their meaning. Saussure revolutionized linguistics by arguing that signs (like words) are arbitrary: the meaning of "tree" is not inherent but produced by its difference from other signs within the linguistic system. Lévi-Strauss applied this to anthropology, finding deep binary structures (raw/cooked, nature/culture) underlying myths across civilizations. Barthes extended it to literature and popular culture, "reading" everything from wrestling to advertisements as structured sign systems. Structuralism transformed the humanities by shifting attention from authors and intentions to impersonal systems of meaning — paving the way for poststructuralism\'s critique of those very structures.', book: 'Mythologies — Roland Barthes' },
    { name: 'Absurdism', era: 'mid-20th century', thinkers: ['Albert Camus'], description: 'Absurdism is the philosophical response to what Albert Camus called the "absurd": the fundamental conflict between the human desire for meaning, clarity, and purpose, and the universe\'s total silence on these matters. The universe offers no inherent meaning, yet we cannot stop searching for it. Camus argued that there are three responses to this condition: physical suicide (rejecting life), philosophical suicide (adopting religion or ideology to manufacture meaning), or revolt — fully acknowledging the absurd while continuing to live passionately in defiance of it. "One must imagine Sisyphus happy," he wrote. Absurdism differs from nihilism in that it does not conclude life is meaningless and therefore not worth living; rather, it finds a heroic dignity in living without appeal or illusion.', book: 'The Myth of Sisyphus — Albert Camus' },
    { name: 'Empiricism', era: '17th–18th century', thinkers: ['John Locke', 'David Hume', 'George Berkeley'], description: 'Empiricism holds that all knowledge ultimately derives from sensory experience. Contra rationalists who believed the mind contains innate ideas, Locke argued the mind begins as a blank slate (tabula rasa), shaped entirely by experience. Hume pushed empiricism to its radical conclusions: since we can never directly observe causation — only the regular succession of events — our belief in cause and effect is a habit of the mind, not a logical necessity. Berkeley went further, arguing that to exist is to be perceived: matter itself has no existence independent of minds. Empiricism became the philosophical foundation of modern science and shaped Anglo-American philosophy\'s tradition of careful analysis, skepticism toward metaphysical speculation, and respect for observable evidence.', book: 'An Enquiry Concerning Human Understanding — David Hume' },
    { name: 'Humanism', era: '14th century–present', thinkers: ['Pico della Mirandola', 'Erasmus', 'Albert Camus'], description: 'Humanism places humanity at the center of intellectual and ethical life, celebrating human reason, dignity, and creative capacity. In the Renaissance, it was a cultural movement that revived classical Greek and Roman learning and redirected attention from theological speculation to the study of human affairs — history, rhetoric, poetry, and moral philosophy. In the modern secular sense, humanism holds that ethics and meaning can be grounded in human experience and reason alone, without appeal to supernatural authority. It affirms that humans have the capacity and responsibility to lead good lives and to work together toward a better world. Contemporary humanism encompasses skepticism, scientific naturalism, and a commitment to human flourishing based on empathy and rational inquiry.', book: 'Oration on the Dignity of Man — Pico della Mirandola' },
    { name: 'Idealism', era: '18th–19th century', thinkers: ['Immanuel Kant', 'G.W.F. Hegel', 'Johann Fichte'], description: 'Philosophical Idealism holds that reality, at its most fundamental level, is mental or spiritual in nature. Kant\'s Transcendental Idealism argued that space, time, and causality are not features of reality as it is in itself but are forms imposed by the human mind on sensory experience — we can only know things as they appear to us, never the "thing-in-itself." Hegel developed Absolute Idealism, arguing that reality is the Absolute — a single, self-developing rational Spirit manifesting itself through history, art, religion, and philosophy. History, for Hegel, is not a random sequence of events but a dialectical unfolding of Spirit coming to know itself through contradiction and reconciliation. German Idealism profoundly influenced Marx, existentialism, and 20th century continental philosophy.', book: 'Phenomenology of Spirit — G.W.F. Hegel' },
    { name: 'Taoism', era: '6th–4th century BCE', thinkers: ['Laozi', 'Zhuangzi'], description: 'Taoism (Daoism) is an ancient Chinese philosophy and religion centered on the Tao — the Way — an ineffable principle that underlies and unifies all things. The Tao cannot be grasped through reason or defined in words; the Tao Te Ching opens: "The Tao that can be told is not the eternal Tao." Living in harmony with the Tao requires wu wei — non-action or effortless action — allowing things to unfold naturally rather than forcing outcomes. Zhuangzi extended this into playful, paradoxical stories that question the boundaries between dream and reality, life and death, self and other. Taoism celebrates spontaneity, naturalness, and simplicity, and has deeply influenced Chinese art, medicine, martial arts, and the Zen Buddhist tradition.', book: 'Tao Te Ching — Laozi' },
    { name: 'Deconstructionism', era: 'mid-20th century', thinkers: ['Jacques Derrida'], description: 'Deconstruction, developed by Jacques Derrida, is a mode of critical analysis that exposes the instabilities, contradictions, and hidden hierarchies within texts and philosophical traditions. Derrida argued that Western philosophy has been built on a series of binary oppositions (speech/writing, presence/absence, nature/culture) in which one term is privileged over the other. Deconstruction does not simply reverse these hierarchies but shows how the privileged term secretly depends on and is contaminated by its supposed opposite. The meaning of any text is not fixed but endlessly deferred through chains of other signs — what Derrida called différance. Far from nihilism, deconstruction is an ethical project: by revealing how texts harbor exclusions and violences, it opens space for the voices and ideas that have been marginalized.', book: 'Of Grammatology — Jacques Derrida' },
    { name: 'Utopian Socialism', era: 'early 19th century', thinkers: ['Charles Fourier', 'Robert Owen', 'Henri de Saint-Simon'], description: 'Utopian socialism refers to the early, pre-Marxist tradition of socialist thought that imagined ideal societies and proposed to realize them through moral persuasion, community building, and rational planning rather than class struggle. Robert Owen established experimental communities based on cooperative principles; Charles Fourier imagined "phalansteries" where work would be organized according to human passions rather than against them. Marx and Engels dismissed these as "utopian" — naive about the structural power of capitalism — contrasting them with their own "scientific socialism." Yet the utopian socialists anticipated many later feminist and ecological insights, and their imaginative visions of cooperative, humane life remain a source of inspiration for alternative social movements seeking to demonstrate that another world is possible.', book: 'News from Nowhere — William Morris' },
    { name: 'Epicureanism', era: '4th–3rd century BCE', thinkers: ['Epicurus'], description: 'Epicureanism, founded by Epicurus in Athens around 307 BCE, holds that the purpose of philosophy is to help us achieve happiness — understood as the absence of pain and mental disturbance (ataraxia). Epicurus distinguished between necessary and unnecessary desires, arguing that the highest pleasures are simple: friendship, philosophical conversation, food, and shelter. He was a materialist who followed Democritus in believing the universe is composed of atoms and void, with no divine interference in human affairs. Death, he argued, is simply the dissolution of our atoms — "death is nothing to us, for when we are, death has not come, and when death has come, we are not." Famously misrepresented as hedonism, Epicureanism is actually a disciplined philosophy of moderate pleasure, friendship, and freedom from fear.', book: 'Letter to Menoeceus — Epicurus' },
    { name: 'Magical Realism', era: 'mid-20th century', thinkers: ['Gabriel García Márquez', 'Jorge Luis Borges', 'Isabel Allende'], description: 'Magical Realism is a literary genre in which fantastical or magical elements are blended seamlessly into realistic, mundane environments. Rather than presenting the magical as alarming or out-of-place, characters accept it as a normal facet of daily life. Emerging primarily in Latin America during the mid-20th century, it became a tool to express political realities, histories, and mythologies that exceeded traditional European realist narrative structures. Borges crafted labyrinthine, infinite libraries, while García Márquez detailed generations of a family experiencing levitation and rainstorms lasting years. It challenges our assumptions about what is "real" and expands the boundaries of storytelling.', book: 'One Hundred Years of Solitude — Gabriel García Márquez' },
    { name: 'Surrealism', era: 'early 20th century', thinkers: ['André Breton', 'Salvador Dalí', 'Max Ernst'], description: 'Surrealism was an artistic, literary, and intellectual movement that sought to release the creative potential of the unconscious mind. Heavily influenced by Freudian psychoanalysis, Surrealists believed that the rational mind repressed the deep truths of the human experience. Through techniques like automatic writing, dream analysis, and juxtaposition of bizarre, unrelated concepts, they aimed to resolve the contradictory conditions of dream and reality into an absolute reality, or "surreality." Breton\'s Manifesto of Surrealism championed absolute freedom of imagination, while Dalí captured melting clocks and desert landscapes of the mind. It remains a powerful influence on modern poetry, film, and visual arts.', book: 'Nadja — André Breton' },
    { name: 'Transcendentalism', era: 'mid-19th century', thinkers: ['Ralph Waldo Emerson', 'Henry David Thoreau', 'Margaret Fuller'], description: 'Transcendentalism was an American philosophical and literary movement that arose in New England. It held that individuals have a divinity within themselves and that truth is reached through intuition and inner spiritual reflection rather than empirical science or organized religion. The Transcendentalists believed that the natural world is a direct reflection of the spiritual universe and that by retreating into nature, one could "transcend" the corrupting influences of society and materialism. Thoreau lived in a self-built cabin at Walden Pond to live deliberately, while Emerson championed self-reliance, intellectual independence, and the sacredness of individual conscience.', book: 'Walden — Henry David Thoreau' },
    { name: 'Gothicism', era: 'late 18th–19th century', thinkers: ['Mary Shelley', 'Edgar Allan Poe', 'Bram Stoker'], description: 'Gothicism is a literary genre characterized by elements of horror, mystery, death, romance, and the sublime. It often features dark, desolate settings such as decaying castles, haunted mansions, and wild landscapes, using atmosphere to evoke terror and dread. Gothic literature explores the dark side of human nature, repressed desires, psychological decay, and the boundary between the living and the dead. Shelley combined Gothic elements with early science fiction to create the creature of Frankenstein, while Poe pioneered psychological horror and gothic poetry. Stoker\'s Dracula codified modern vampire mythology, highlighting themes of contagion, sexuality, and ancient dread invading the modern world.', book: 'Frankenstein — Mary Shelley' },
    { name: 'Modernism', era: 'late 19th–mid 20th century', thinkers: ['Virginia Woolf', 'James Joyce', 'T.S. Eliot'], description: 'Modernism was a widespread cultural and literary movement that arose in response to the massive changes of industrialization, urbanization, and the trauma of World War I. Modernists rejected traditional 19th-century Victorian narrative forms, opting for radical experimentation. They employed stream-of-consciousness, fragmented narratives, multiple perspectives, and interior monologues to represent the fractured nature of modern consciousness and the loss of unified social values. Joyce\'s Ulysses mapped a single day in Dublin in labyrinthine linguistic layers, Woolf captured the inner passage of time, and Eliot\'s poetry lamented a spiritual wasteland. Its rallying cry was Ezra Pound\'s famous dictate: "Make it new."', book: 'To the Lighthouse — Virginia Woolf' },
    { name: 'Beat Generation', era: 'mid-20th century', thinkers: ['Jack Kerouac', 'Allen Ginsberg', 'William S. Burroughs'], description: 'The Beat Generation was an American social and literary movement that rejected mainstream post-WWII materialism, conformity, and academic formalism. Celebrating spiritual exploration, Eastern religions, sexual liberation, drug experimentation, and jazz, the Beats pioneered an raw, improvisational style of writing. Ginsberg\'s passionate poem Howl blasted the industrial society crushing creative minds, while Kerouac\'s On the Road was written on a continuous scroll of paper in a breathless, spontaneous prose style designed to capture the rhythm of life on the open road. Burroughs explored hallucination and fragmented language using the "cut-up" technique. They profoundly influenced the counterculture of the 1960s.', book: 'On the Road — Jack Kerouac' },
    { name: 'Realism', era: 'mid-to-late 19th century', thinkers: ['Leo Tolstoy', 'Gustave Flaubert', 'George Eliot'], description: 'Realism was a literary and artistic movement that sought to represent familiar things, people, and social conditions exactly as they are, without romantic idealization or supernatural embellishment. Arising in mid-19th century Europe as a reaction to Romanticism, Realists focused on the daily lives, struggles, and moral choices of middle- and lower-class characters. They emphasized objective narration, detailed character psychology, and the influence of social environment on individual destiny. Flaubert\'s Madame Bovary examined the tragic consequences of romantic illusions, Tolstoy captured the sweeping tapestry of Russian society, and Eliot explored the moral web of English provincial life.', book: 'Middlemarch — George Eliot' },
    { name: 'Naturalism', era: 'late 19th–early 20th century', thinkers: ['Émile Zola', 'Stephen Crane', 'Jack London'], description: 'Naturalism was a literary movement that grew out of realism, heavily influenced by Charles Darwin\'s theories of evolution. Naturalists believed that human behavior is determined not by free will or moral choice, but by heredity, environment, and biological drives. They portrayed characters as "human beasts" fighting for survival in a hostile or indifferent universe. Writing with a cold, almost scientific objectivity, naturalists often focused on characters from the margins of society — the impoverished, the uneducated, and the desperate. Zola pioneered the movement in France with his Rougon-Macquart novels, while London explored the brutal survival of the fittest in the wild Yukon.', book: 'Germinal — Émile Zola' },
    { name: 'Symbolism', era: 'late 19th century', thinkers: ['Charles Baudelaire', 'Arthur Rimbaud', 'Stéphane Mallarmé'], description: 'Symbolism was a French literary movement that rejected realist description in favor of expressing ideas, emotions, and states of mind through indirect, suggestive symbols. Heavily influenced by Edgar Allan Poe, Symbolists sought to evoke rather than state, creating a dense, musical, and dreamlike atmosphere. They believed there was a mystical correspondence between the physical world and a transcendent spiritual reality. Baudelaire\'s The Flowers of Evil pioneered modern poetry by exploring urban decay, melancholy, and sensory synesthesia, while Rimbaud\'s explosive, hallucinatory prose poems pushed language to the edge of sense. It laid the foundation for modern poetry.', book: 'The Flowers of Evil — Charles Baudelaide' },
    { name: 'Dadaism', era: 'early 20th century', thinkers: ['Tristan Tzara', 'Hugo Ball', 'Marcel Duchamp'], description: 'Dadaism was an avant-garde artistic and literary movement born in Zurich during World War I as a protest against the nationalist and bourgeois rationalism that had led to the war. Declaring that "Dada is nothing," its adherents created works that embraced anti-art, nonsense, irrationality, and chaotic collages. They believed that if logic and reason had led to global slaughter, then nonsense and absurdity were the only authentic responses. Tzara wrote instructions for creating poems by cutting out words from a newspaper and drawing them from a hat, while Ball performed sound poetry dressed in cardboard costumes. Dadaism paved the way for Surrealism and conceptual art.', book: 'Seven Dada Manifestos — Tristan Tzara' },
    { name: 'Post-Colonialism', era: 'mid-20th century–present', thinkers: ['Edward Said', 'Frantz Fanon', 'Chinua Achebe'], description: 'Post-Colonialism is a critical, literary, and political framework that analyzes the cultural, economic, and psychological legacies of European imperialism. It interrogates how the "Occident" constructed the "Orient" as a weak, exotic, and backward "Other" to justify domination — a concept Said termed Orientalism. Post-colonial literature seeks to reclaim native histories, rewrite narratives from the perspective of the colonized, and explore the hybrid identities, displacements, and ongoing struggles of post-independence societies. Achebe\'s Things Fall Apart challenged colonial portrayals of Africa, while Fanon examined the psychological violence of racism and colonial occupation.', book: 'Orientalism — Edward Said' },
    { name: 'Classicism', era: '17th–18th century', thinkers: ['Alexander Pope', 'John Dryden', 'Johann Wolfgang von Goethe'], description: 'Classicism in literature is an aesthetic movement that looks to the art and literature of ancient Greece and Rome for its ideals of beauty, form, and order. It values reason, clarity, balance, restraint, and adherence to established formal rules over emotional indulgence and unchecked imagination. Classical writers believed that art should instruct and delight, seeking to capture universal human truths through structured verse and clear prose. Pope championed these values in England, calling for writers to follow the rules of nature and the ancients, while Goethe and Schiller in Germany synthesized classical form with deep philosophical inquiry.', book: 'An Essay on Criticism — Alexander Pope' },
    { name: 'Magicalist Philosophy', era: 'Renaissance', thinkers: ['Marsilio Ficino', 'Giovanni Pico della Mirandola', 'Heinrich Cornelius Agrippa'], description: 'Magicalist Philosophy, or Renaissance Hermeticism, was an intellectual tradition that blended Christian theology, Neoplatonism, Kabbalah, and natural magic. Adherents believed in an interconnected cosmos where everything is bound by "sympathies" and "antipathies." The philosopher\'s task was to understand these occult connections and use them to draw down celestial influences for healing, knowledge, and spiritual ascent. Pico della Mirandola argued that humans have no fixed place in the cosmic hierarchy and can ascend to the level of angels through intellect, while Agrippa wrote the definitive encyclopedia of occult philosophy. It bridged medieval mysticism and early modern science.', book: 'Three Books of Occult Philosophy — Heinrich Cornelius Agrippa' },
    { name: 'Rationalism', era: '17th–18th century', thinkers: ['René Descartes', 'Baruch Spinoza', 'Gottfried Wilhelm Leibniz'], description: 'Rationalism is the philosophical position that reason, rather than sensory experience, is the primary source and test of knowledge. Descartes sought to build an absolute foundation for knowledge by doubting everything, famously concluding "Cogito, ergo sum" (I think, therefore I am) — establishing the mind\'s existence as an indubitable truth. Rationalists believe the mind possesses innate ideas (like mathematics and the concept of infinity) that we can uncover through deduction. Spinoza formulated a radical, pantheistic system where God and Nature are one, while Leibniz conceived of reality as composed of infinite, simple substances called "monads." It stood in sharp contrast to British Empiricism.', book: 'Meditations on First Philosophy — René Descartes' },
    { name: 'Phenomenology', era: 'early 20th century', thinkers: ['Edmund Husserl', 'Martin Heidegger', 'Maurice Merleau-Ponty'], description: 'Phenomenology is the philosophical study of structures of consciousness as experienced from the first-person point of view. Husserl founded the movement with the call "to the things themselves!" — urging philosophers to suspend theoretical assumptions (epoché) and describe the pure appearance of things to the mind. Heidegger shifted phenomenology toward ontology, exploring what it means to exist as a "Dasein" (Being-in-the-world) thrown into time and anxiety, while Merleau-Ponty emphasized the embodied nature of experience, showing how our physical body shapes our perception and relationship with the world. It deeply influenced existentialism and modern psychology.', book: 'Being and Time — Martin Heidegger' },
    { name: 'Hermeneutics', era: '19th–20th century', thinkers: ['Wilhelm Dilthey', 'Hans-Georg Gadamer', 'Paul Ricoeur'], description: 'Hermeneutics is the theory and methodology of interpretation, originally applied to biblical texts but expanded into a philosophy of how humans understand language, history, and existence itself. Gadamer argued that understanding is not an objective scientific method, but a "fusion of horizons" where our current prejudices and historical consciousness encounter the horizon of the text or the other person. Understanding is circular: we comprehend the parts of a text through the whole, and the whole through the parts. Ricoeur integrated hermeneutics with psychoanalysis and structuralism, exploring how narrative constructs our personal identity and how symbols harbor multiple layers of meaning.', book: 'Truth and Method — Hans-Georg Gadamer' },
    { name: 'Critical Theory', era: 'mid-20th century', thinkers: ['Theodor Adorno', 'Max Horkheimer', 'Walter Benjamin'], description: 'Critical Theory, emerging from the Frankfurt School in Germany, is a social philosophy that aims to critique and change society as a whole, rather than merely explaining it. Blending Marxism, psychoanalysis, and cultural critique, Critical Theorists analyzed how modern industrial capitalism and mass media manufacture conformity and alienate individuals. Adorno and Horkheimer coined the term "Culture Industry" to describe how popular culture operates like a factory, producing standardized entertainment that pacifies the public and neutralizes political resistance. Benjamin explored how art\'s unique "aura" is transformed in the age of mechanical reproduction, opening both dangers and political possibilities.', book: 'Dialectic of Enlightenment — Theodor Adorno & Max Horkheimer' },
    { name: 'Existential Humanism', era: 'mid-20th century', thinkers: ['Jean-Paul Sartre', 'Albert Camus'], description: 'Existential Humanism is a branch of existentialism that emphasizes the dignity, agency, and ethical responsibility of the individual in a universe without God. Sartre defended existentialism against critics by declaring "existentialism is a humanism," arguing that because there is no divine creator to define our essence, we must actively create our own values and meanings through ethical action. Because our choices affect others, we bear absolute responsibility for humanity. Camus, while rejecting labels, shared this humanist commitment, arguing that in an absurd world, our moral duty is to fight against suffering, injustice, and tyranny, even if the struggle is endless.', book: 'Existentialism Is a Humanism — Jean-Paul Sartre' },
    { name: 'Deism', era: '17th–18th century', thinkers: ['Voltaire', 'Thomas Paine', 'Thomas Jefferson'], description: 'Deism is a theological and philosophical belief that reason and observation of the natural world, rather than revelation or holy books, are sufficient to determine the existence of a supreme being. Popularized during the Enlightenment, Deists famously compared God to a "divine watchmaker" who created the universe, established rational laws of physics and nature, and then stepped back, allowing it to run without supernatural intervention. They rejected miracles, divine revelation, and religious dogmas, advocating instead for personal morality, tolerance, and intellectual freedom. Paine\'s The Age of Reason represents the peak of deist critique against orthodox organized religion.', book: 'The Age of Reason — Thomas Paine' },
    { name: 'Logical Positivism', era: 'early 20th century', thinkers: ['Ludwig Wittgenstein', 'Rudolf Carnap', 'A.J. Ayer'], description: 'Logical Positivism was a highly influential philosophical movement centered in Vienna that sought to align philosophy with modern science. Its core principle was the "verification criterion of meaning": a statement is cognitively meaningful only if it is either logically tautological (like mathematics) or empirically verifiable through sensory observation. Consequently, all metaphysical, ethical, and theological statements were declared literally meaningless pseudoproblems. Ayer popularized the movement in the English-speaking world, while early Wittgenstein\'s Tractatus argued that the limits of language are the limits of our world, and that we must remain silent about what we cannot speak of scientifically.', book: 'Language, Truth and Logic — A.J. Ayer' },
    { name: 'Epic Realism', era: 'mid-20th century', thinkers: ['Bertolt Brecht'], description: 'Epic Realism, or Epic Theatre, was a revolutionary dramatic movement developed by German playwright Bertolt Brecht. It rejected traditional Aristotelian theatre, which sought to make the audience emotionally identify with characters and experience catharsis. Instead, Brecht wanted audiences to remain intellectually alert, critical, and socially conscious. He pioneered the "estrangement effect" (Verfremdungseffekt) — using stage cards, songs, and self-conscious acting to constantly remind the audience they are watching a play. By preventing emotional immersion, Brecht forced viewers to analyze the social, economic, and political structures causing the characters\' suffering, encouraging them to change the real world.', book: 'Mother Courage and Her Children — Bertolt Brecht' },
    { name: 'Structural Linguistics', era: 'early 20th century', thinkers: ['Ferdinand de Saussure', 'Roman Jakobson'], description: 'Structural Linguistics is an approach to language that views it as a self-contained, relational system of signs rather than a collection of individual words with historical roots. Saussure argued that a sign consists of a "sound image" (sound image) and a "signified" (concept), bound by an arbitrary relationship. The meaning of any linguistic sign is determined solely by its differences and relationships with other signs in the language system (langue). Jakobson expanded this, developing phonology and analyzing the poetic function of language. It became the methodological foundation that inspired structuralism in anthropology, literature, and psychoanalysis.', book: 'Course in General Linguistics — Ferdinand de Saussure' },
    { name: 'Gnosticism', era: '2nd–3rd century CE', thinkers: ['Valentinus', 'Basilides'], description: 'Gnosticism was a diverse collection of mystical religious and philosophical movements in the early Christian world. Gnostics believed that the material world was not created by the true supreme God, but by an ignorant, lesser deity called the Demiurge (often identified with the Old Testament God), who trapped sparks of divine light in human bodies. Salvation was achieved not through faith or good works, but through gnosis — an intuitive, experiential secret knowledge of our true divine origins and the cosmos. Long suppressed as heresy, Gnostic texts discovered at Nag Hammadi in 1945 revealed a complex, deeply imaginative cosmology that has inspired modern writers like Carl Jung and Philip K. Dick.', book: 'The Nag Hammadi Scriptures — Edited by Marvin Meyer' },
    { name: 'Ecological Philosophy', era: 'late 20th century–present', thinkers: ['Arne Naess', 'Timothy Morton', 'Donna Haraway'], description: 'Ecological Philosophy, or Ecophilosophy, is a field of thought that re-examines the relationship between humans, non-human beings, and the planet. Arne Naess pioneered "Deep Ecology," which rejects human-centered (anthropocentric) environmentalism, arguing that all living things have an intrinsic value independent of their usefulness to humans. Timothy Morton developed "Dark Ecology" and the concept of "hyperobjects" — things like global warming that are too vast to be fully localized or comprehended. Contemporary ecophilosophers advocate for a fundamental shift from viewing nature as a resource to recognizing our deep, tangled codependency with the biosphere.', book: 'Ecology without Nature — Timothy Morton' },
    { name: 'Transhumanism', era: 'late 20th century–present', thinkers: ['Nick Bostrom', 'Max More', 'Donna Haraway'], description: 'Transhumanism is an intellectual and cultural movement that advocates for using advanced science and technology — such as biotechnology, nanotechnology, and artificial intelligence — to fundamentally enhance human physical, cognitive, and psychological capacities, and to eliminate aging and involuntary death. Transhumanists envision a "posthuman" future where humans have evolved beyond current biological limitations. Bostrom has explored the ethics of superintelligence and existential risks, while Haraway\'s Cyborg Manifesto used the figure of the cyborg to deconstruct traditional boundaries between human/machine and male/female.', book: 'A Cyborg Manifesto — Donna Haraway' },
    { name: 'Absurdist Literature', era: 'mid-20th century', thinkers: ['Samuel Beckett', 'Franz Kafka', 'Eugene Ionesco'], description: 'Absurdist Literature is a literary and theatrical movement that portrays the anxiety, confusion, and meaninglessness of human existence. Arising alongside absurdist philosophy, writers rejected traditional plot structures, logical dialogue, and coherent character motivation to mirror a chaotic, silent universe. Beckett\'s Waiting for Godot presents two characters waiting endlessly for someone who never arrives, turning language into repetitive, comic, and tragic play. Kafka\'s stories capture nightmarish, bureaucratic systems where individuals are punished without ever knowing their crime. It captures the modern existential sense of alienation and displacement.', book: 'Waiting for Godot — Samuel Beckett' },
    { name: 'New Criticism', era: 'mid-20th century', thinkers: ['T.S. Eliot', 'Cleanth Brooks', 'I.A. Richards'], description: 'New Criticism was an influential school of literary criticism in the mid-20th century that advocated for "close reading" as the primary method of literary analysis. New Critics argued that a text should be treated as a self-contained, autonomous aesthetic object. They rejected the relevance of the author\'s biography, historical context, or reader response, calling these the "intentional fallacy" and the "affective fallacy." Instead, critics focused on the text\'s internal structures, analyzing how elements like paradox, irony, tension, and metaphor resolve into a unified, harmonious meaning. It shaped university literature education for decades.', book: 'The Well Wrought Urn — Cleanth Brooks' },
    { name: 'Post-Structuralism', era: 'late 20th century', thinkers: ['Michel Foucault', 'Jacques Derrida', 'Gilles Deleuze'], description: 'Post-Structuralism emerged in France as a critique and expansion of structuralism. While structuralists sought to find stable, universal structures underlying culture and language, post-structuralists argued that these structures are unstable, historically contingent, and fractured by power. They rejected the idea of absolute truth, fixed centers of meaning, or unified subjects. Foucault analyzed how power and knowledge are co-constituted through shifting historical discourses, while Derrida\'s deconstruction showed how language is endlessly unstable. Deleuze celebrated multiplicity and fluid desires, resisting all forms of centralized authority.', book: 'Discipline and Punish — Michel Foucault' },
    { name: 'Neoplatonism', era: '3rd–6th century CE', thinkers: ['Plotinus', 'Porphyry', 'Proclus'], description: 'Neoplatonism was the final grand school of pagan Greek philosophy, developed by Plotinus. Drawing on Plato\'s works, Neoplatonists formulated a majestic, monistic cosmology where all reality emanates from a single, transcendent source called "the One" or "the Good." The One is so infinite it exceeds description. From the One emanates Intellect (Nous), which contains the Forms, which in turn emanates World Soul (Psyche), ultimately yielding the physical world. The human soul\'s purpose is to turn away from material distractions and ascend back to mystical union with the One through contemplation. It profoundly shaped Christian, Islamic, and Renaissance mysticism.', book: 'The Enneads — Plotinus' }
];

// Returns today's ideology based on day of year, synthesized deterministically for infinite daily variety!
app.get('/api/ideology', (req, res) => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    
    // Deterministic pair
    const indexA = dayOfYear % IDEOLOGIES.length;
    // 13 is prime and provides a lovely gap to ensure rich variety
    const indexB = (dayOfYear + 13) % IDEOLOGIES.length;
    
    const idA = IDEOLOGIES[indexA];
    const idB = (indexA === indexB) ? IDEOLOGIES[(indexB + 1) % IDEOLOGIES.length] : IDEOLOGIES[indexB];
    
    // 1. Synthesize Name
    const name = `${idA.name} & ${idB.name} Convergence`;
    
    // 2. Synthesize Era (e.g., "mid-20th century & 3rd century BCE")
    let era = `${idA.era} & ${idB.era}`;
    if (idA.era === idB.era) era = idA.era;
    
    // 3. Synthesize Thinkers (deduplicate and limit to 4)
    const thinkers = Array.from(new Set([...idA.thinkers, ...idB.thinkers])).slice(0, 4);
    
    // 4. Synthesize Book Recommendations
    const getBookTitle = (bookStr) => bookStr.split(' — ')[0] || bookStr;
    const book = `Comparative Study: ${getBookTitle(idA.book)} & ${getBookTitle(idB.book)}`;
    
    // 5. Synthesize Description in a deeply premium, academic voice
    const descASentences = idA.description.split('. ').filter(s => s.trim().length > 0);
    const descBSentences = idB.description.split('. ').filter(s => s.trim().length > 0);
    
    const firstSentenceA = descASentences[0] ? descASentences[0].trim() : '';
    const firstSentenceB = descBSentences[0] ? descBSentences[0].trim() : '';
    
    const intro = `This unique daily synthesis explores the profound intersection between ${idA.name} and ${idB.name}.`;
    
    // Ensure correct punctuation at the end of the clean first sentences
    const cleanSentenceA = firstSentenceA.endsWith('.') ? firstSentenceA.slice(0, -1) : firstSentenceA;
    const cleanSentenceB = firstSentenceB.endsWith('.') ? firstSentenceB.slice(0, -1) : firstSentenceB;
    
    const thesis = `While ${cleanSentenceA.charAt(0).toLowerCase() + cleanSentenceA.slice(1)} (representing ${idA.name}), it is profoundly complemented by the insight that ${cleanSentenceB.charAt(0).toLowerCase() + cleanSentenceB.slice(1)} (representing ${idB.name}).`;
    
    const synthesis = `By juxtaposing these frameworks, scholars can trace how ${idA.name}'s focus on ${idA.thinkers[0]}'s ideals interacts with ${idB.name}'s legacy through ${idB.thinkers[0]}. This convergence invites a new methodology: one that embraces both the analytical rigor of ${idA.name} and the humanistic depth of ${idB.name}.`;
    
    const description = `${intro} ${thesis} ${synthesis}`;
    
    res.json({
        name,
        era: era.toUpperCase(),
        thinkers,
        description,
        book
    });
});

// ============================================================
// TRENDING BOOKS — Open Library API (free, no key)
// Cached for 6 hours
// ============================================================
let booksCache = null;
let booksCacheTime = 0;
const BOOKS_CACHE_MS = 6 * 60 * 60 * 1000;

const BOOKS_FALLBACK = [
    { title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', subject: 'History', reason: 'A sweeping account of how Homo sapiens came to dominate the Earth — from the cognitive revolution to the present age of data.' },
    { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', subject: 'Psychology', reason: 'Nobel laureate Kahneman reveals the two systems of thought that drive our decisions, one fast and intuitive, one slow and deliberate.' },
    { title: 'The Alchemist', author: 'Paulo Coelho', subject: 'Fiction', reason: 'A timeless parable about following your dreams and recognizing the universe\'s coded messages along your personal journey.' },
    { title: 'Atomic Habits', author: 'James Clear', subject: 'Self-development', reason: 'A practical framework for building good habits and breaking bad ones through tiny, 1% improvements compounded over time.' },
    { title: '1984', author: 'George Orwell', subject: 'Dystopia', reason: 'The definitive warning about totalitarianism, surveillance, and the weaponization of language — now more urgent than ever.' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', subject: 'Literature', reason: 'A luminous meditation on the American Dream, its seduction and its hollowness, set in the jazz age\'s gilded excess.' }
];

app.get('/api/books', async (req, res) => {
    const now = Date.now();
    if (booksCache && (now - booksCacheTime) < BOOKS_CACHE_MS) {
        return res.json(booksCache);
    }
    try {
        const response = await fetch('https://openlibrary.org/search.json?q=trending_z_score:[1+TO+*]&sort=trending&limit=6');
        if (!response.ok) throw new Error('Open Library failed');
        const data = await response.json();
        const works = (data.docs || []).slice(0, 6).map(w => ({
            title: w.title || 'Unknown Title',
            author: (w.author_name && w.author_name[0]) || 'Unknown Author',
            subject: (w.subject && w.subject[0]) || 'Literature',
            reason: `Highly sought-after today, trending with active reading log events on Open Library.`,
            coverUrl: w.cover_i ? `https://covers.openlibrary.org/b/id/${w.cover_i}-M.jpg` : null
        }));
        booksCache = works.length >= 3 ? works : BOOKS_FALLBACK;
        booksCacheTime = now;
        res.json(booksCache);
    } catch (err) {
        console.error('[/api/books] Error:', err.message, '— serving fallback');
        res.json(BOOKS_FALLBACK);
    }
});

// ============================================================
// NEWS — RSS feeds from Al Jazeera, BBC World, Reuters
// Cached for 1 hour, no API key needed
// ============================================================
let newsCache = null;
let newsCacheTime = 0;
const NEWS_CACHE_MS = 60 * 60 * 1000; // 1 hour
const rssParser = new RssParser({ timeout: 8000 });

const RSS_FEEDS = [
    { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { source: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { source: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' }
];

const NEWS_FALLBACK = [
    { title: 'Global Leaders Convene for Climate Summit', source: 'World News', summary: 'World leaders gathered to negotiate binding commitments on carbon emissions, with island nations leading urgent calls for faster action before critical tipping points are crossed.', link: '#', published: new Date().toISOString() },
    { title: 'Breakthrough in Quantum Computing Announced', source: 'Science Daily', summary: 'Researchers report achieving quantum advantage on a practical problem for the first time, a landmark that could reshape encryption, drug discovery, and AI within a decade.', link: '#', published: new Date().toISOString() },
    { title: 'Geopolitical Tensions Rise in South China Sea', source: 'Global Affairs', summary: 'Naval movements and diplomatic exchanges have intensified, drawing responses from regional powers and prompting emergency sessions of international security bodies.', link: '#', published: new Date().toISOString() },
];

app.get('/api/news', async (req, res) => {
    const now = Date.now();
    if (newsCache && (now - newsCacheTime) < NEWS_CACHE_MS) {
        return res.json(newsCache);
    }
    try {
        const allItems = [];
        for (const feed of RSS_FEEDS) {
            try {
                const parsed = await rssParser.parseURL(feed.url);
                const items = (parsed.items || []).slice(0, 3).map(item => ({
                    title: item.title || 'Untitled',
                    source: feed.source,
                    summary: (item.contentSnippet || item.content || item.summary || '').replace(/<[^>]*>/g, '').slice(0, 160).trim() + '…',
                    link: item.link || '#',
                    published: item.isoDate || item.pubDate || new Date().toISOString()
                }));
                allItems.push(...items);
            } catch (feedErr) {
                console.warn(`[News] Feed failed (${feed.source}):`, feedErr.message);
            }
        }
        newsCache = allItems.length >= 3 ? allItems : NEWS_FALLBACK;
        newsCacheTime = now;
        res.json(newsCache);
    } catch (err) {
        console.error('[/api/news] Error:', err.message);
        res.json(NEWS_FALLBACK);
    }
});



function isCasualGreeting(text) {
    const clean = text.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const greetings = [
        'hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'good morning', 'good afternoon', 'good evening', 
        'how are you', 'howdy', 'hows it going', 'how are you doing', 'how do you do', 'whats up', 
        'what up', 'hey there', 'hello there', 'hi there', 'who are you', 'what is your name',
        'how are you doing today', 'how are you today', 'how is your day', 'how is your day going'
    ];
    if (greetings.includes(clean) || greetings.some(g => clean.startsWith(g + ' '))) return true;
    
    const words = clean.split(/\s+/);
    if (words.length <= 6) {
        const casualKeywords = [
            'hi', 'hello', 'hey', 'how', 'you', 'doing', 'sup', 'whats', 'up', 'thanks', 'thank', 
            'cool', 'awesome', 'great', 'are', 'is', 'am', 'good', 'fine', 'do', 'does', 'there', 
            'who', 'your', 'name', 'today', 'day', 'going', 'life', 'everything', 'things', 'yo', 
            'hola', 'morning', 'afternoon', 'evening', 'what', 'it'
        ];
        return words.every(w => casualKeywords.includes(w));
    }
    return false;
}

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

    // ============================================================
    // QUERY CACHE CHECK (Layer 2)
    // ============================================================
    const cacheKey = normalizeQuestion(userInput);
    const now = Date.now();
    if (queryCache.has(cacheKey)) {
        const cached = queryCache.get(cacheKey);
        if (now - cached.timestamp < QUERY_CACHE_DURATION_MS) {
            console.log(`[Cache Hit] Serving cached response for normalized key: "${cacheKey}"`);
            return res.json({ response: cached.response });
        } else {
            queryCache.delete(cacheKey); // Evict expired entry
        }
    }

    // ============================================================
    // GLOBAL RATE LIMITER — minimum 3s gap between Gemini API calls
    // ============================================================
    const timeSinceLastCall = now - lastGeminiCallTime;
    if (timeSinceLastCall < GEMINI_MIN_INTERVAL_MS) {
        const waitTime = Math.ceil((GEMINI_MIN_INTERVAL_MS - timeSinceLastCall) / 1000);
        console.log(`[Rate Guard] Throttling — ${waitTime}s remaining before next Gemini call`);
        return res.json({ response: `### ✨ WikiSearch is pacing itself\n\nTo give you the best answers, WikiSearch spaces out its deep thinking. Please wait **${waitTime} seconds** and try again.\n\nGreat minds take their time. ⏳` });
    }

    try {
        const GEMINI_KEYS = [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_2,
            process.env.GEMINI_API_KEY_3
        ].filter(Boolean);

        if (GEMINI_KEYS.length === 0 && !process.env.GROQ_API_KEY) {
            return res.json({ response: "⚠️ **API Key Missing!**\n\nPlease go to your Render Dashboard → Environment Variables → Add `GEMINI_API_KEY` or `GROQ_API_KEY`." });
        }

        // Determine whether this query is conversational chit-chat vs scholarly lookup
        const isCasual = isCasualGreeting(userInput);
        const systemInstruction = isCasual
            ? "You are WikiSearch, a warm, friendly, and highly humanized AI companion. The user is saying hi or making casual conversation. Respond warmly, casually, and briefly (strictly 1 to 2 sentences max). Do not write long essays or scholarly bullet lists for simple greetings!"
            : "You are WikiSearch, an incredibly intelligent, scholarly AI assistant with access to vast human knowledge. Please provide a helpful, fascinating, and accurate response. Format it nicely with markdown if appropriate (use bolding, bullet points, etc). Keep it concise but deeply informative.";

        const answer = await callAI(userInput, systemInstruction);

        // SAVE TO CACHE (only cache successful responses)
        if (cacheKey) {
            queryCache.set(cacheKey, {
                response: answer,
                timestamp: Date.now()
            });
            console.log(`[Cache Write] Cached normalized query: "${cacheKey}"`);
        }

        return res.json({ response: answer });

    } catch (error) {
        console.error("Failover AI pipeline error:", error.message);
        const lastError = error.statusType;

        if (lastError === '429') {
            return res.json({ response: "### ✨ WikiSearch needs a moment to breathe\n\nYou're clearly on a roll! Our knowledge engine needs about **2 minutes** to recharge before diving back in.\n\nGrab a coffee, jot down your next question, and we'll be right back with you. ☕" });
        } else if (lastError === '503') {
            return res.json({ response: "### 🌐 WikiSearch's knowledge source is momentarily busy\n\nThe AI backbone is experiencing high global demand right now. This usually clears up within **30–60 seconds**.\n\nYour question is important — please try again shortly! 🔄" });
        } else {
            return res.json({ response: "### 🔄 WikiSearch couldn't complete that thought\n\nSomething unexpected happened while processing your question. Please try again in a moment — it usually works on the next try!" });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WikiSearch backend running on port ${PORT}`);
});
