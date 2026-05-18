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

async function buildTrendingContent() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
    { name: 'Epicureanism', era: '4th–3rd century BCE', thinkers: ['Epicurus'], description: 'Epicureanism, founded by Epicurus in Athens around 307 BCE, holds that the purpose of philosophy is to help us achieve happiness — understood as the absence of pain and mental disturbance (ataraxia). Epicurus distinguished between necessary and unnecessary desires, arguing that the highest pleasures are simple: friendship, philosophical conversation, food, and shelter. He was a materialist who followed Democritus in believing the universe is composed of atoms and void, with no divine interference in human affairs. Death, he argued, is simply the dissolution of our atoms — "death is nothing to us, for when we are, death has not come, and when death has come, we are not." Famously misrepresented as hedonism, Epicureanism is actually a disciplined philosophy of moderate pleasure, friendship, and freedom from fear.', book: 'Letter to Menoeceus — Epicurus' }
];

// Returns today's ideology based on day of year
app.get('/api/ideology', (req, res) => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const ideology = IDEOLOGIES[dayOfYear % IDEOLOGIES.length];
    res.json(ideology);
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
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY) {
            return res.json({ response: "⚠️ **API Key Missing!**\n\nPlease go to your Render Dashboard → Environment Variables → Add `GEMINI_API_KEY`." });
        }

        const geminiPrompt = `You are WikiSearch, an incredibly intelligent, scholarly AI assistant with access to vast human knowledge.
A user is asking you: "${userInput}"
Please provide a helpful, fascinating, and accurate response. Format it nicely with markdown if appropriate (use bolding, bullet points, etc). Keep it concise but deeply informative.`;

        // Using gemini-2.0-flash — much more stable on free tier than 2.5-flash
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
        const requestBody = JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] });

        // Retry logic: up to 3 attempts with exponential backoff
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                lastGeminiCallTime = Date.now(); // Track this call

                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: requestBody
                });

                const data = await geminiRes.json();

                // Handle rate limit (429)
                if (data.error && data.error.code === 429) {
                    console.warn(`[Attempt ${attempt}/3] Gemini Rate Limit Hit (429)`);
                    lastError = '429';
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, attempt * 5000)); // 5s, 10s backoff
                        continue;
                    }
                    break;
                }

                // Handle overload (503)
                if (data.error && (data.error.code === 503 || data.error.status === 'UNAVAILABLE')) {
                    console.warn(`[Attempt ${attempt}/3] Gemini Overloaded (503)`);
                    lastError = '503';
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, attempt * 4000)); // 4s, 8s backoff
                        continue;
                    }
                    break;
                }

                // Handle any other API error
                if (data.error) {
                    console.error(`[Attempt ${attempt}/3] Gemini error:`, data.error);
                    lastError = 'other';
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    break;
                }

                // Success!
                if (data.candidates && data.candidates.length > 0) {
                    const answer = data.candidates[0].content.parts[0].text;
                    
                    // SAVE TO CACHE (only cache successful responses)
                    if (cacheKey) {
                        queryCache.set(cacheKey, {
                            response: answer,
                            timestamp: Date.now()
                        });
                        console.log(`[Cache Write] Cached normalized query: "${cacheKey}"`);
                    }

                    return res.json({ response: answer });
                } else {
                    console.error(`[Attempt ${attempt}/3] Gemini unexpected response:`, data);
                    lastError = 'empty';
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    break;
                }
            } catch (fetchErr) {
                console.error(`[Attempt ${attempt}/3] Fetch error:`, fetchErr.message);
                lastError = 'network';
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                break;
            }
        }

        // All retries exhausted — return user-friendly message based on error type
        if (lastError === '429') {
            return res.json({ response: "### ✨ WikiSearch needs a moment to breathe\n\nYou're clearly on a roll! Our knowledge engine needs about **2 minutes** to recharge before diving back in.\n\nGrab a coffee, jot down your next question, and we'll be right back with you. ☕" });
        } else if (lastError === '503') {
            return res.json({ response: "### 🌐 WikiSearch's knowledge source is momentarily busy\n\nThe AI backbone is experiencing high global demand right now. This usually clears up within **30–60 seconds**.\n\nYour question is important — please try again shortly! 🔄" });
        } else {
            return res.json({ response: "### 🔄 WikiSearch couldn't complete that thought\n\nSomething unexpected happened while processing your question. Please try again in a moment — it usually works on the next try!" });
        }

    } catch (error) {
        console.error("Gemini API critical error:", error);
        return res.json({ response: "### 🔄 Connection interrupted\n\nWikiSearch is having trouble reaching its knowledge source. Please try again in a few seconds." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WikiSearch backend running on port ${PORT}`);
});
