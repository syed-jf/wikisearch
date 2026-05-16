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

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
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

app.post('/api/recommendations', async (req, res) => {
    const history = req.body.history || [];
    if (history.length === 0) {
        return res.json({ 
            analysis: "Your diary is currently a blank canvas. Start searching to let the philosopher's mind begin its analysis.", 
            books: [
                { title: 'The Library of Babel', author: 'Jorge Luis Borges', desc: 'A short story about an infinite library exploring the universe of knowledge.' },
                { title: 'The Alchemist', author: 'Paulo Coelho', desc: 'A fable about following your dream and reading the omens of the world.' }
            ] 
        });
    }

    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            return res.json({ 
                analysis: "The Scholar is resting. Please add your Gemini API Key in the Render dashboard to unlock dynamic analysis.", 
                books: [] 
            });
        }

        const historyStr = history.slice(0, 10).join(', '); // Use top 10 recent searches

        const prompt = `You are a wise, scholarly AI named "The Scholar" analyzing a user's recent search history: [${historyStr}]. 
Provide a short, poetic 2-sentence analysis of what their curiosity says about their mind or current journey.
Then, recommend 4 real, fascinating books that align perfectly with their interests.
Return ONLY a raw JSON object (no markdown formatting, no backticks) with this exact structure:
{
  "analysis": "Your 2 sentence poetic analysis...",
  "books": [
    { "title": "Book Name", "author": "Author Name", "desc": "1 brief sentence description" }
  ]
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await geminiRes.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const rawText = data.candidates[0].content.parts[0].text;
            // Clean up any potential markdown formatting the AI might add by mistake
            const cleanJsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJsonStr);
            return res.json(parsed);
        } else {
            throw new Error("Invalid Gemini response format");
        }
        
    } catch (err) {
        console.error("Diary Gemini error:", err);
        return res.json({ 
            analysis: "The archives are misty today. Keep exploring, and I will analyze your path soon.", 
            books: [] 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WikiSearch backend running on port ${PORT}`);
});
