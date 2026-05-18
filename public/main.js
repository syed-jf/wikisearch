const heroScreen = document.getElementById('heroScreen');
const chatScreen = document.getElementById('chatScreen');
const chatContainer = document.getElementById('chatContainer');
const heroInput = document.getElementById('heroInput');
const heroSendBtn = document.getElementById('heroSendBtn');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatInputBg = document.getElementById('chatInputBg');
const newInquiryBtn = document.getElementById('newInquiryBtn');
const homeBtn = document.getElementById('homeBtn');

let isChatMode = false;

function switchToChatMode() {
    if (isChatMode) return;
    isChatMode = true;

    // Hide hero, show chat
    heroScreen.classList.add('opacity-0');
    setTimeout(() => {
        heroScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        chatInput.focus();

        // Add initial system greeting if empty
        if (chatContainer.children.length === 0) {
            addMessage("Hi there! 👋 I'm WikiSearch. How can I help you today?", 'agent');
        }
    }, 300);
}

function resetToHeroMode() {
    isChatMode = false;
    isThinking = false; // Always unlock when going home — safety reset
    currentSessionId = null;
    chatScreen.classList.add('hidden');
    heroScreen.classList.remove('hidden');
    heroScreen.classList.remove('opacity-0');
    heroInput.value = '';
    chatContainer.innerHTML = '';
    // Remove any stale thinking state from inputs
    chatInput.disabled = false;
    heroInput.disabled = false;
    chatSendBtn.disabled = false;
    heroSendBtn.disabled = false;
    chatInput.placeholder = 'Ask a follow-up question...';
    chatInput.classList.remove('opacity-60', 'cursor-not-allowed', 'chat-input-thinking');
    if (chatInputBg) chatInputBg.classList.remove('chat-input-bg-thinking');
}

const mobileHomeBtn = document.getElementById('mobileHomeBtn');

newInquiryBtn.addEventListener('click', resetToHeroMode);
if (homeBtn) homeBtn.addEventListener('click', resetToHeroMode);
if (mobileHomeBtn) mobileHomeBtn.addEventListener('click', resetToHeroMode);

// Back button in chat screen — wire up here after DOM is ready
const backBtn = document.getElementById('backBtn');
if (backBtn) backBtn.addEventListener('click', resetToHeroMode);

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', sender);
    msgDiv.classList.add('font-body-md', 'text-body-md');

    if (sender === 'agent' && typeof marked !== 'undefined') {
        // Use marked.js for AI responses to handle markdown (bold, lists, etc.) properly
        msgDiv.innerHTML = marked.parse(text);
    } else {
        // Simple formatting for user messages
        msgDiv.innerHTML = text.replace(/\n/g, '<br>');
    }

    chatContainer.appendChild(msgDiv);

    // Smoothly scroll the container to align the user's question at the top 
    // when the agent responds, keeping the context fully visible.
    if (sender === 'user') {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else if (sender === 'agent') {
        const userMessages = chatContainer.querySelectorAll('.chat-message.user');
        if (userMessages.length > 0) {
            const lastUserMsg = userMessages[userMessages.length - 1];
            // Small timeout to let marked.js finish rendering and styling the DOM element
            setTimeout(() => {
                // Scroll container directly to align the user's message 20px below the top of the container
                // Using offsetTop is completely stable and independent of layout rendering shifts.
                chatContainer.scrollTo({
                    top: lastUserMsg.offsetTop - 20,
                    behavior: 'smooth'
                });
            }, 100);
        } else {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
}

// Rotating thinking phrases — makes WikiSearch feel alive and intelligent
const THINKING_PHRASES = [
    'WikiSearch is synthesizing…',
    'WikiSearch is thinking…',
    'Consulting the knowledge lattice…',
    'Connecting the dots…',
    'WikiSearch is pondering…',
    'Searching the archives…',
    'Distilling the answer…',
    'WikiSearch is reflecting…',
    'Processing your inquiry…',
    'Weaving the knowledge together…'
];

function getRandomPhrase() {
    return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
}

function showTypingIndicator() {
    const phrase = getRandomPhrase();
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', 'agent', 'thinking-bubble');
    msgDiv.id = 'typingIndicator';
    msgDiv.innerHTML = `
        <div class="thinking-bubble-inner">
            <div class="thinking-dots">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
            <span class="thinking-phrase" id="thinkingPhrase">${phrase}</span>
        </div>
    `;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Rotate the phrase every 3 seconds while thinking
    const rotateInterval = setInterval(() => {
        const el = document.getElementById('thinkingPhrase');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                if (el) {
                    el.textContent = getRandomPhrase();
                    el.style.opacity = '1';
                }
            }, 300);
        } else {
            clearInterval(rotateInterval);
        }
    }, 3000);

    // Store interval on the element so removeTypingIndicator can clear it
    msgDiv._rotateInterval = rotateInterval;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        if (indicator._rotateInterval) clearInterval(indicator._rotateInterval);
        indicator.remove();
    }
}

let isThinking = false;

async function handleSend(text) {
    if (!text || isThinking) return;
    isThinking = true;

    // Disable inputs & buttons to prevent double-send — thinking state shown in chat bubble
    heroInput.disabled = true;
    chatInput.disabled = true;
    heroSendBtn.disabled = true;
    chatSendBtn.disabled = true;
    chatInput.classList.add('opacity-50', 'cursor-not-allowed');

    // Handle Session Creation
    if (!currentSessionId) {
        currentSessionId = Date.now();
        chatSessions.unshift({
            id: currentSessionId,
            title: text.length > 30 ? text.substring(0, 30) + "..." : text,
            messages: []
        });
        updateHistoryUI();
    }

    const session = chatSessions.find(s => s.id === currentSessionId);
    if (session) {
        session.messages.push({ text: text, sender: 'user' });
    }

    switchToChatMode();
    addMessage(text, 'user');
    showTypingIndicator();

    const cleanupCooldown = () => {
        // 1.5-second pacing cooldown after response to prevent rapid-fire spam
        setTimeout(() => {
            isThinking = false;
            heroInput.disabled = false;
            chatInput.disabled = false;
            heroSendBtn.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.classList.remove('opacity-50', 'cursor-not-allowed');
            chatInput.focus();
        }, 1500);
    };

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();
        removeTypingIndicator();
        addMessage(data.response, 'agent');

        // Save to current session
        const session = chatSessions.find(s => s.id === currentSessionId);
        if (session) {
            session.messages.push({ text: data.response, sender: 'agent' });
            saveSessions();
        }
        cleanupCooldown();
    } catch (error) {
        removeTypingIndicator();
        addMessage("Error: Could not connect to the agent backend.", 'system');
        cleanupCooldown();
    }
}

heroSendBtn.addEventListener('click', () => {
    const text = heroInput.value.trim();
    heroInput.value = '';
    chatInput.value = '';
    handleSend(text);
});

heroInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = heroInput.value.trim();
        heroInput.value = '';
        chatInput.value = '';
        handleSend(text);
    }
});

chatSendBtn.addEventListener('click', () => {
    const text = chatInput.value.trim();
    chatInput.value = '';
    handleSend(text);
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        chatInput.value = '';
        handleSend(text);
    }
});

// Settings and Dark Mode Logic
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const darkModeBtn = document.getElementById('darkModeBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    if (darkModeToggle) darkModeToggle.checked = isDark;

    if (darkModeBtn) {
        darkModeBtn.textContent = isDark ? 'light_mode' : 'dark_mode';
    }
}

if (darkModeBtn) darkModeBtn.addEventListener('click', toggleDarkMode);
if (darkModeToggle) darkModeToggle.addEventListener('change', toggleDarkMode);

const openSettings = () => settingsModal.classList.remove('hidden');
if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (mobileSettingsBtn) mobileSettingsBtn.addEventListener('click', openSettings);

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
}

if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });
}

// Persistence: Load chat sessions from LocalStorage
let chatSessions = JSON.parse(localStorage.getItem('wiki_sessions')) || [];
let currentSessionId = null;

// Function to save sessions
function saveSessions() {
    localStorage.setItem('wiki_sessions', JSON.stringify(chatSessions));
}

// History and About Logic
const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyContent = document.getElementById('historyContent');

const aboutBtn = document.getElementById('aboutBtn');
const mobileAboutBtn = document.getElementById('mobileAboutBtn');
const aboutModal = document.getElementById('aboutModal');
const closeAboutBtn = document.getElementById('closeAboutBtn');

function updateHistoryUI() {
    saveSessions();
    if (chatSessions.length === 0) {
        historyContent.innerHTML = '<p class="text-on-surface-variant italic">No sessions yet. Start exploring!</p>';
        return;
    }

    historyContent.innerHTML = chatSessions.map(session =>
        `<div class="p-xs bg-surface-container-low rounded-md border border-outline-variant hover:bg-surface-container transition-colors cursor-pointer group flex items-center justify-between" onclick="loadSession(${session.id})">
            <div class="flex items-center">
                <span class="material-symbols-outlined text-[16px] mr-2 text-on-surface-variant">chat_bubble</span>
                <span class="truncate max-w-[200px]">${session.title}</span>
            </div>
            <span class="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 text-secondary">arrow_forward</span>
        </div>`
    ).join('');
}

function loadSession(id) {
    const session = chatSessions.find(s => s.id === id);
    if (!session) return;

    currentSessionId = id;
    chatContainer.innerHTML = ''; // Clear current chat
    switchToChatMode();

    session.messages.forEach(msg => {
        addMessage(msg.text, msg.sender);
    });

    if (historyModal) historyModal.classList.add('hidden');
}

const mobileHistoryBtn = document.getElementById('mobileHistoryBtn');

const openHistory = () => historyModal.classList.remove('hidden');
if (historyBtn) historyBtn.addEventListener('click', openHistory);
if (mobileHistoryBtn) mobileHistoryBtn.addEventListener('click', openHistory);
if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
if (historyModal) historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.classList.add('hidden');
});

const clearHistoryBtn = document.getElementById('clearHistoryBtn');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all of your search history? This cannot be undone.")) {
            chatSessions = [];
            saveSessions();
            updateHistoryUI();
            resetToHeroMode();
            if (historyModal) historyModal.classList.add('hidden');
        }
    });
}

const openAbout = () => aboutModal.classList.remove('hidden');
if (aboutBtn) aboutBtn.addEventListener('click', openAbout);
if (mobileAboutBtn) mobileAboutBtn.addEventListener('click', openAbout);
if (closeAboutBtn) closeAboutBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));
if (aboutModal) aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.classList.add('hidden');
});

// Philosopher's Diary Logic
const diaryBtn = document.getElementById('diaryBtn');
const diaryModal = document.getElementById('diaryModal');
const closeDiaryBtn = document.getElementById('closeDiaryBtn');
const diaryAnalysis = document.getElementById('diaryAnalysis');
const suggestedBooksGrid = document.getElementById('suggestedBooksGrid');

// Shared trending data — fetched once, used by both the cards and the diary
let cachedTrendingData = null;

async function loadTrending() {
    const trendingGrid = document.getElementById('trendingGrid');
    const trendingTimestamp = document.getElementById('trendingTimestamp');
    if (!trendingGrid) return;

    try {
        const res = await fetch('/api/trending');
        cachedTrendingData = await res.json();
        const { topics, generatedAt } = cachedTrendingData;

        // Show timestamp
        if (trendingTimestamp && generatedAt) {
            const dt = new Date(generatedAt);
            trendingTimestamp.textContent = `Updated ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · refreshes every 6 hrs`;
        }

        // Render cards
        trendingGrid.innerHTML = topics.map(topic => `
            <div class="trending-card" onclick="handleSend('${topic.title.replace(/'/g, "\\'")}')"> 
                <div class="flex items-start justify-between mb-3">
                    <span class="badge badge-${topic.category.replace(/[^a-zA-Z]/g, '')}">&#35;${topic.category.toUpperCase()}</span>
                    <span class="material-symbols-outlined text-base text-on-surface-variant dark:text-zinc-500" style="font-size:16px">arrow_outward</span>
                </div>
                <h3 class="font-semibold text-on-surface dark:text-zinc-100 mb-2 text-sm leading-snug">${topic.title}</h3>
                <p class="text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed line-clamp-3">${topic.description}</p>
                <div class="mt-3 pt-3 border-t border-outline-variant/30 dark:border-zinc-800 flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary dark:text-primary-fixed-dim" style="font-size:14px">book</span>
                    <span class="text-xs text-primary dark:text-primary-fixed-dim truncate">${topic.book.title}</span>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load trending:', err);
        if (trendingGrid) {
            trendingGrid.innerHTML = '<p class="col-span-full text-center text-tertiary italic text-sm py-8">Could not load trending topics right now. Check back shortly.</p>';
        }
    }
}

// Index-safe function called from diary book cards and tooltips
// Closes the modal, crafts a rich question, fires handleSend exactly once
function exploreFromDiary(idx) {
    // Guard: don't allow if already thinking
    if (isThinking) return;

    const topic = cachedTrendingData && cachedTrendingData.topics && cachedTrendingData.topics[idx];
    if (!topic) return;

    // Close the diary modal first
    if (diaryModal) diaryModal.classList.add('hidden');

    // Craft a beautiful, rich question
    const question = `Tell me everything about "${topic.title}" — why it's trending right now, its key concepts, real-world impact, and how the book "${topic.book.title}" by ${topic.book.author} relates to it.`;

    // Small delay to let the modal close animation finish before switching screens
    setTimeout(() => {
        handleSend(question);
    }, 200);
}

// Diary refresh: force a fresh fetch every 45 minutes regardless of session cache
let diaryLastFetched = null;
const DIARY_REFRESH_MS = 45 * 60 * 1000; // 45 minutes

// ─── Helper: format relative time ───
function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs/24)}d ago`;
}

async function updateDiary() {
    const ideologyEl   = document.getElementById('ideologyContent');
    const booksEl      = document.getElementById('suggestedBooksGrid');
    const newsEl       = document.getElementById('newsList');

    // All 3 fetch in parallel — each section loads independently
    const [ideologyResult, booksResult, newsResult] = await Promise.allSettled([
        fetch('/api/ideology').then(r => r.json()),
        fetch('/api/books').then(r => r.json()),
        fetch('/api/news').then(r => r.json())
    ]);

    // ── Section 1: Ideology ──
    if (ideologyResult.status === 'fulfilled') {
        const id = ideologyResult.value;
        ideologyEl.innerHTML = `
            <div class="ideology-name">${id.name}</div>
            <div class="ideology-meta">
                <span class="ideology-era">${id.era}</span>
                <span class="ideology-thinkers">— ${id.thinkers.join(', ')}</span>
            </div>
            <p class="ideology-description">${id.description}</p>
            <div class="ideology-book">📖 Essential reading: <strong>${id.book}</strong></div>
        `;
    } else {
        ideologyEl.innerHTML = '<p class="text-zinc-500 text-sm italic">The archives are resting. Check back soon.</p>';
    }

    // ── Section 2: Books ──
    if (booksResult.status === 'fulfilled') {
        const books = booksResult.value;
        booksEl.innerHTML = books.map(b => `
            <div class="book-card-new" onclick="handleSend('Tell me about the book \\'${b.title.replace(/'/g,"\\'")}\\' by ${b.author.replace(/'/g,"\\'")} and why it\\'s currently trending worldwide.')">
                <span class="book-subject-badge">${b.subject || 'Literature'}</span>
                <div class="book-title-new">${b.title}</div>
                <div class="book-author-new">${b.author}</div>
                <div class="book-reason-new">${b.reason}</div>
                <div class="book-explore-btn">
                    <span>Ask WikiSearch</span>
                    <span>→</span>
                </div>
            </div>
        `).join('');
        // Close diary when user explores a book
        booksEl.querySelectorAll('.book-card-new').forEach(card => {
            card.addEventListener('click', () => {
                if (diaryModal) diaryModal.classList.add('hidden');
            });
        });
    } else {
        booksEl.innerHTML = '<p class="col-span-full text-zinc-500 text-sm italic">Shelves temporarily unavailable.</p>';
    }

    // ── Section 3: News ──
    if (newsResult.status === 'fulfilled') {
        const news = newsResult.value;
        newsEl.innerHTML = news.map(n => `
            <a href="${n.link}" target="_blank" rel="noopener noreferrer" class="news-card">
                <div class="news-source-row">
                    <span class="news-source-badge">${n.source}</span>
                    <span class="news-time">${timeAgo(n.published)}</span>
                </div>
                <div class="news-title">${n.title}</div>
                <div class="news-summary">${n.summary}</div>
                <div class="news-read-more">Read full story →</div>
            </a>
        `).join('');
    } else {
        newsEl.innerHTML = '<p class="text-zinc-500 text-sm italic">World signals temporarily unavailable.</p>';
    }
}


const mobileDiaryBtn = document.getElementById('mobileDiaryBtn');

const openDiary = () => {
    updateDiary();
    diaryModal.classList.remove('hidden');
};

if (diaryBtn) diaryBtn.addEventListener('click', openDiary);
if (mobileDiaryBtn) mobileDiaryBtn.addEventListener('click', openDiary);
if (closeDiaryBtn) closeDiaryBtn.addEventListener('click', () => diaryModal.classList.add('hidden'));
if (diaryModal) {
    diaryModal.addEventListener('click', (e) => {
        if (e.target === diaryModal) diaryModal.classList.add('hidden');
    });
}

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => {
    updateHistoryUI();
    const isDark = document.documentElement.classList.contains('dark');
    if (darkModeToggle) darkModeToggle.checked = isDark;
    if (darkModeBtn) darkModeBtn.textContent = isDark ? 'light_mode' : 'dark_mode';
});

// --- Voice Search Implementation ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

const heroMicBtn = document.getElementById('heroMicBtn');
const chatMicBtn = document.getElementById('chatMicBtn');

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isRecording = true;
        if (heroScreen.classList.contains('hidden')) {
            if (chatMicBtn) chatMicBtn.classList.add('mic-active');
            if (chatInput) chatInput.placeholder = "Listening...";
        } else {
            if (heroMicBtn) heroMicBtn.classList.add('mic-active');
            if (heroInput) heroInput.placeholder = "Listening...";
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (heroScreen.classList.contains('hidden')) {
            if (chatInput) chatInput.value = transcript;
            handleSend(transcript);
        } else {
            if (heroInput) heroInput.value = transcript;
            handleSend(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        stopRecording();
    };

    recognition.onend = () => {
        stopRecording();
    };
}

function stopRecording() {
    isRecording = false;
    if (heroMicBtn) {
        heroMicBtn.classList.remove('mic-active');
        if (heroInput) heroInput.placeholder = "Ask wikisearch";
    }
    if (chatMicBtn) {
        chatMicBtn.classList.remove('mic-active');
        if (chatInput) chatInput.placeholder = "Ask a follow-up question...";
    }
}

function toggleRecording() {
    if (!recognition) {
        alert("Voice search is not supported in your browser.");
        return;
    }
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

if (heroMicBtn) heroMicBtn.addEventListener('click', toggleRecording);
if (chatMicBtn) chatMicBtn.addEventListener('click', toggleRecording);

// Cinematic Intro Portal Lifecycle Management
(function() {
    const introPortal = document.getElementById('intro-portal');
    if (introPortal) {
        setTimeout(() => {
            introPortal.classList.add('intro-fade-out');
            
            // Trigger cascading glide entrance animations!
            document.querySelectorAll('.reveal-nav, .reveal-title, .reveal-subtext, .reveal-search, .reveal-suggestions').forEach(el => {
                el.classList.add('animate-entrance');
            });

            setTimeout(() => {
                introPortal.remove();
            }, 800);
        }, 2000);
    } else {
        // Fallback: If no intro portal (e.g. settings refresh), ensure all elements are immediately visible
        document.querySelectorAll('.reveal-nav, .reveal-title, .reveal-subtext, .reveal-search, .reveal-suggestions').forEach(el => {
            el.classList.add('animate-entrance');
        });
    }
})();
