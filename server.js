const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));



const aliases = {
    'notepad': 'notepad.exe',
    'notes': 'notepad.exe',
    'calc': 'calc.exe',
    'calculator': 'calc.exe',
    'paint': 'mspaint.exe',
    'explorer': 'explorer.exe',
    'cmd': 'cmd.exe',
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
    "can you tell me about ",
    "tell me about ",
    "i want to know about ",
    "what are ",
    "what is ",
    "whats ",
    "explain ",
    "define ",
    "describe ",
    "how does ",
    "about "
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

app.post('/api/chat', async (req, res) => {
    const userInput = req.body.message || "";
    const lowerInput = userInput.toLowerCase().trim();
    const normalizedInput = normalizeQuestion(userInput);

    if (lowerInput === 'help' || lowerInput === '?') {
        let help = "=== WikiSearch Help ===\n";
        help += "Commands:\n  open app <name>\n  whatsapp <phone> <msg>\n\nJust ask me any general question, and I will search Wikipedia for you!";
        return res.json({ response: help });
    }

    if (lowerInput.startsWith('open app ')) {
        const appName = userInput.substring(9).trim();
        if (!appName) return res.json({ response: "[WikiSearch Action]: Please specify an app name." });
        
        const target = resolveWindowsApp(appName);
        exec(`start "" "${target}"`, (error) => {
            if (error) {
                console.error(`exec error: ${error}`);
            }
        });
        return res.json({ response: `[WikiSearch Action]: Opening app -> ${target}` });
    }

    if (lowerInput.startsWith('whatsapp ')) {
        const args = userInput.substring(9).trim();
        const spacePos = args.indexOf(' ');
        if (spacePos === -1) {
            return res.json({ response: "[WikiSearch Action]: Please specify phone number and message. Example: whatsapp +1234567890 Hello" });
        }
        const phone = args.substring(0, spacePos).trim();
        const msg = args.substring(spacePos + 1).trim();
        
        const uri = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}`;
        exec(`start "" "${uri}"`, (error) => {
             if (error) {
                 console.error(`exec error: ${error}`);
             }
        });
        return res.json({ response: `[WikiSearch Action]: Opened WhatsApp to send message to ${phone}` });
    }


    if (lowerInput.includes('trending') || lowerInput.includes('hot topics')) {
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            
            const feedUrl = `https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`;
            const feedRes = await fetch(feedUrl, {
                headers: { 'User-Agent': 'WikiSearchBot/1.0 (https://localhost)' }
            });
            const feedData = await feedRes.json();
            
            if (feedData.mostread && feedData.mostread.articles) {
                let response = "🔥 **Trending on Wikipedia Today:**\n\n";
                const top5 = feedData.mostread.articles.slice(0, 5);
                top5.forEach((art, index) => {
                    response += `${index + 1}. **${art.displaytitle}**: ${art.extract.substring(0, 150)}...\n\n`;
                });
                response += "Type the name of any topic to learn more!";
                return res.json({ response });
            }
        } catch (err) {
            console.error("Trending API error:", err);
            // Fallback if trending fails
        }
    }

    if (!userInput) {
        return res.json({ response: "I'm not sure what you're asking. Try asking a question or typing 'help'." });
    }

    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        if (!GEMINI_API_KEY) {
            return res.json({ response: "⚠️ **API Key Missing!**\n\nWikiSearch has been upgraded to use the Gemini AI brain, but it needs your API key to function.\n\nPlease go to your Render Dashboard -> Environment Variables -> Add `GEMINI_API_KEY` and paste your key." });
        }

        const geminiPrompt = `You are WikiSearch, an incredibly intelligent, scholarly AI assistant with access to vast human knowledge. 
A user is asking you: "${userInput}"
Please provide a helpful, fascinating, and accurate response. Format it nicely with markdown if appropriate (use bolding, bullet points, etc). Keep it concise but deeply informative.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: geminiPrompt }] }]
            })
        });
        
        const data = await geminiRes.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const answer = data.candidates[0].content.parts[0].text;
            return res.json({ response: answer });
        } else {
            console.error("Gemini unexpected response:", data);
            return res.json({ response: "I'm sorry, my neural pathways are a bit tangled right now. Please try asking again!" });
        }
        
    } catch (error) {
        console.error("Gemini API error:", error);
        return res.json({ response: "Oops, I'm having trouble connecting to my Gemini brain right now. Please try again later." });
    }
});

const bookDatabase = {
    'tech': [
        { title: 'Superintelligence', author: 'Nick Bostrom', desc: 'A deep dive into the risks and rewards of AGI.' },
        { title: 'Life 3.0', author: 'Max Tegmark', desc: 'Being human in the age of Artificial Intelligence.' },
        { title: 'The Singularity is Near', author: 'Ray Kurzweil', desc: 'When humans transcend biology.' }
    ],
    'history': [
        { title: 'Sapiens', author: 'Yuval Noah Harari', desc: 'A brief history of humankind.' },
        { title: 'Guns, Germs, and Steel', author: 'Jared Diamond', desc: 'The fates of human societies.' },
        { title: 'The Silk Roads', author: 'Peter Frankopan', desc: 'A new history of the world.' }
    ],
    'science': [
        { title: 'A Brief History of Time', author: 'Stephen Hawking', desc: 'The landmark book on the origin of the universe.' },
        { title: 'Cosmos', author: 'Carl Sagan', desc: 'The story of cosmic evolution and science.' },
        { title: 'The Elegant Universe', author: 'Brian Greene', desc: 'Superstrings and the quest for the ultimate theory.' }
    ],
    'philosophy': [
        { title: 'Meditations', author: 'Marcus Aurelius', desc: 'The timeless journal of a Stoic emperor.' },
        { title: 'The Republic', author: 'Plato', desc: 'A Socratic dialogue concerning justice and order.' },
        { title: 'Man\'s Search for Meaning', author: 'Viktor Frankl', desc: 'Finding hope in the darkest of times.' }
    ],
    'default': [
        { title: 'The Library of Babel', author: 'Jorge Luis Borges', desc: 'A short story about an infinite library.' },
        { title: 'The Alchemist', author: 'Paulo Coelho', desc: 'A fable about following your dream.' },
        { title: 'Fahrenheit 451', author: 'Ray Bradbury', desc: 'The classic dystopian novel about knowledge.' }
    ]
};

app.post('/api/recommendations', (req, res) => {
    const history = req.body.history || [];
    if (history.length === 0) {
        return res.json({ analysis: "Your diary is currently a blank canvas. Start searching to let the philosopher's mind begin its analysis.", books: bookDatabase.default });
    }

    const historyStr = history.join(' ').toLowerCase();
    let category = 'default';

    if (historyStr.match(/\bai\b|artificial intelligence|robot|tech|compute|data|science|physics|quantum|space|astronomy|biology|chemistry/)) {
        if (historyStr.match(/\bai\b|artificial intelligence|robot|tech|compute|data/)) category = 'tech';
        else category = 'science';
    } else if (historyStr.match(/history|war|empire|king|ancient|civilization|culture|archeology/)) {
        category = 'history';
    } else if (historyStr.match(/philosophy|mind|think|exist|truth|logic|soul|wisdom|ethics|stoic/)) {
        category = 'philosophy';
    }

    const analyses = {
        'tech': "Your focus on the frontiers of innovation suggests a mind preoccupied with the future. You are tracking the evolution of human tools into something more.",
        'science': "You seek to understand the fundamental laws of existence. Your curiosity bridges the gap between the infinitely small and the cosmic scale.",
        'history': "You are an observer of the human timeline, tracing the echoes of the past to understand our present story.",
        'philosophy': "You are a seeker of wisdom, peering into the very essence of thought and existence itself.",
        'default': "Your curiosity is vast and varied, touching upon multiple facets of the human experience."
    };

    res.json({ analysis: analyses[category], books: bookDatabase[category] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WikiSearch backend running on port ${PORT}`);
});
