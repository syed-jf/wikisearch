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
        
        // Add a clean save action bar at bottom of card
        const actionBar = document.createElement('div');
        actionBar.classList.add('flex', 'justify-end', 'mt-3', 'pt-2', 'border-t', 'border-zinc-200/20', 'dark:border-zinc-800/20');
        
        const saveBtn = document.createElement('button');
        saveBtn.classList.add('text-[11px]', 'font-mono', 'text-primary', 'dark:text-primary-fixed-dim', 'hover:opacity-85', 'transition-opacity', 'flex', 'items-center', 'gap-1', 'focus:outline-none');
        saveBtn.innerHTML = `<span class="material-symbols-outlined text-xs">bookmark_add</span> Save to Workspace`;
        
        saveBtn.addEventListener('click', () => {
            if (typeof saveToNotebook === 'function') {
                saveToNotebook(text);
            }
            saveBtn.innerHTML = `<span class="material-symbols-outlined text-xs">bookmark_added</span> Saved`;
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-60');
        });
        
        actionBar.appendChild(saveBtn);
        msgDiv.appendChild(actionBar);
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
            if (typeof incrementDailyGoal === 'function') {
                incrementDailyGoal(); // Increment curiosity target counter!
            }
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
    if (typeof updateProfileDashboard === 'function') {
        updateProfileDashboard(); // Keep stats completely synced!
    }
    if (chatSessions.length === 0) {
        historyContent.innerHTML = '<p class="text-on-surface-variant dark:text-zinc-500 italic text-center py-4">No sessions yet. Start exploring!</p>';
        return;
    }

    historyContent.innerHTML = chatSessions.map(session =>
        `<div id="history-row-${session.id}" class="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group flex items-center justify-between gap-3" onclick="loadSession(${session.id})">
            <div class="flex items-center min-w-0">
                <span class="material-symbols-outlined text-base mr-2 text-primary dark:text-primary-fixed-dim">chat_bubble</span>
                <span class="truncate text-sm text-on-surface dark:text-zinc-200 font-medium">${session.title}</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="deleteHistorySession(event, ${session.id})" class="text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 p-1 rounded-full hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors flex items-center justify-center">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
                <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 text-secondary dark:text-primary-fixed-dim transition-opacity duration-200">arrow_forward</span>
            </div>
        </div>`
    ).join('');
}

function deleteHistorySession(event, sessionId) {
    event.stopPropagation(); // Avoid loading the session
    const row = document.getElementById(`history-row-${sessionId}`);
    if (!row) return;

    // Trigger smooth fade and height collapse transition
    row.classList.add('collapse-fade-out');

    setTimeout(() => {
        chatSessions = chatSessions.filter(s => s.id !== sessionId);
        saveSessions();
        updateHistoryUI();
        
        // If the active session is deleted, go back to hero mode
        if (currentSessionId === sessionId) {
            resetToHeroMode();
        }
    }, 450);
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
        localStorage.setItem('wiki_convergence_viewed', 'true'); // Mark convergence as viewed!
        if (typeof updateProfileDashboard === 'function') {
            updateProfileDashboard(); // Instantly light up achievements badge!
        }
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

// ─── USER PROFILE & STATS DASHBOARD ENGINE ───
const profileDrawer = document.getElementById('profileDrawer');
const profileBackdrop = document.getElementById('profileBackdrop');
const profileAvatarBtn = document.getElementById('profileAvatarBtn');
const closeProfileBtn = document.getElementById('closeProfileBtn');

// Identity Edit Form Selectors
const editProfileBtn = document.getElementById('editProfileBtn');
const cancelIdentityBtn = document.getElementById('cancelIdentityBtn');
const saveIdentityBtn = document.getElementById('saveIdentityBtn');
const profileSetupForm = document.getElementById('profileSetupForm');
const profileNameInput = document.getElementById('profileNameInput');
const profileSpecialtyInput = document.getElementById('profileSpecialtyInput');
const drawerEmblemIcon = document.getElementById('drawerEmblemIcon');
const profileNameDisplay = document.getElementById('profileNameDisplay');
const profileSpecialtyDisplay = document.getElementById('profileSpecialtyDisplay');

function openProfileDrawer() {
    if (profileDrawer) {
        updateProfileDashboard(); // Sync up stats dynamically before slide-in!
        profileDrawer.classList.add('drawer-open');
    }
    if (profileBackdrop) {
        profileBackdrop.classList.remove('hidden');
    }
}

function closeProfileDrawer() {
    if (profileDrawer) {
        profileDrawer.classList.remove('drawer-open');
    }
    if (profileBackdrop) {
        profileBackdrop.classList.add('hidden');
    }
    if (profileSetupForm) {
        profileSetupForm.classList.remove('form-open');
    }
}

if (profileAvatarBtn) profileAvatarBtn.addEventListener('click', openProfileDrawer);
if (closeProfileBtn) closeProfileBtn.addEventListener('click', closeProfileDrawer);
if (profileBackdrop) profileBackdrop.addEventListener('click', closeProfileDrawer);

// Form Event Listeners
if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
        if (profileSetupForm) {
            const isOpen = profileSetupForm.classList.contains('form-open');
            if (isOpen) {
                profileSetupForm.classList.remove('form-open');
            } else {
                // Populate current values
                const profile = JSON.parse(localStorage.getItem('wiki_user_profile')) || { name: 'Guest Inquirer', specialty: 'General Scholar', emblem: 'school' };
                if (profileNameInput) profileNameInput.value = profile.name === 'Guest Inquirer' ? '' : profile.name;
                if (profileSpecialtyInput) profileSpecialtyInput.value = profile.specialty === 'General Scholar' ? '' : profile.specialty;
                
                // Select active radio button
                const radios = document.getElementsByName('emblemRadio');
                radios.forEach(r => {
                    if (r.value === profile.emblem) r.checked = true;
                });

                profileSetupForm.classList.add('form-open');
            }
        }
    });
}

if (cancelIdentityBtn) {
    cancelIdentityBtn.addEventListener('click', () => {
        if (profileSetupForm) profileSetupForm.classList.remove('form-open');
    });
}

if (saveIdentityBtn) {
    saveIdentityBtn.addEventListener('click', () => {
        const name = (profileNameInput && profileNameInput.value.trim()) || 'Guest Inquirer';
        const specialty = (profileSpecialtyInput && profileSpecialtyInput.value.trim()) || 'General Scholar';
        
        let emblem = 'school';
        const radios = document.getElementsByName('emblemRadio');
        radios.forEach(r => {
            if (r.checked) emblem = r.value;
        });

        const profileData = { name, specialty, emblem };
        localStorage.setItem('wiki_user_profile', JSON.stringify(profileData));

        if (profileSetupForm) profileSetupForm.classList.remove('form-open');
        updateProfileDashboard();
    });
}

// --- Stats Management, Ranks, Interests, Goals, and Notebook ---
function incrementDailyGoal() {
    const today = new Date().toISOString().split('T')[0];
    let goalData = JSON.parse(localStorage.getItem('wiki_daily_queries')) || { count: 0, date: today };
    
    if (goalData.date !== today) {
        goalData = { count: 0, date: today };
    }
    
    goalData.count += 1;
    localStorage.setItem('wiki_daily_queries', JSON.stringify(goalData));
    updateProfileDashboard();
}

function saveToNotebook(text) {
    let notebook = JSON.parse(localStorage.getItem('wiki_notebook')) || [];
    
    // Create elegant 120-char quote summary
    const cleanSnippet = text.substring(0, 120).replace(/[#*`]/g, '') + (text.length > 120 ? '...' : '');
    
    notebook.unshift({
        id: Date.now(),
        snippet: cleanSnippet,
        fullText: text
    });
    
    localStorage.setItem('wiki_notebook', JSON.stringify(notebook));
    updateProfileDashboard();
}

function deleteFromNotebook(event, id) {
    event.stopPropagation(); // Don't trigger full preview modal!
    let notebook = JSON.parse(localStorage.getItem('wiki_notebook')) || [];
    notebook = notebook.filter(item => item.id !== id);
    localStorage.setItem('wiki_notebook', JSON.stringify(notebook));
    updateProfileDashboard();
}

function viewNotebookItem(id) {
    const notebook = JSON.parse(localStorage.getItem('wiki_notebook')) || [];
    const item = notebook.find(i => i.id === id);
    if (!item) return;

    // Create a beautifully responsive temp preview modal
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4";
    modal.innerHTML = `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 border border-surface-container dark:border-zinc-800 rounded-xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 max-h-[80vh] text-on-surface dark:text-zinc-100">
            <div class="flex justify-between items-center border-b border-zinc-200/20 dark:border-zinc-800/80 pb-2">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary dark:text-primary-fixed-dim">bookmark</span>
                    <h2 class="font-headline-md text-lg tracking-tight font-bold">Saved Insight</h2>
                </div>
                <button class="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors close-temp-modal">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="overflow-y-auto flex flex-col gap-2 py-2 text-zinc-700 dark:text-zinc-300 font-body-md text-sm leading-relaxed max-h-[50vh]">
                ${typeof marked !== 'undefined' ? marked.parse(item.fullText) : item.fullText.replace(/\n/g, '<br>')}
            </div>
            <div class="flex justify-end pt-2 border-t border-zinc-200/20 dark:border-zinc-800/80">
                <button class="px-5 py-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary dark:bg-primary-fixed-dim/10 dark:hover:bg-primary-fixed-dim/20 dark:text-primary-fixed-dim rounded-full font-semibold transition-all close-temp-modal">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-temp-modal').forEach(btn => btn.addEventListener('click', closeModal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function updateProfileDashboard() {
    // 0. Load & Render Custom Identity
    const profile = JSON.parse(localStorage.getItem('wiki_user_profile')) || { name: 'Guest Inquirer', specialty: 'General Scholar', emblem: 'school' };
    
    if (profileNameDisplay) profileNameDisplay.textContent = profile.name;
    if (profileSpecialtyDisplay) profileSpecialtyDisplay.textContent = profile.specialty;
    if (drawerEmblemIcon) drawerEmblemIcon.textContent = profile.emblem;
    
    // Sync top-nav Avatar button symbol!
    if (profileAvatarBtn) {
        profileAvatarBtn.innerHTML = `<span class="material-symbols-outlined text-[26px]">${profile.emblem}</span>`;
    }

    // 1. Searches Count
    const totalSearches = chatSessions.length;
    const progressLabel = document.getElementById('rankProgressLabel');
    if (progressLabel) {
        progressLabel.textContent = `${totalSearches} inquiry${totalSearches === 1 ? '' : 'ies'} completed`;
    }

    // 2. Academic Rank Title, Icon & Progress Bar
    const rankTitleEl = document.getElementById('rankTitle');
    const rankIconEl = document.getElementById('rankIcon');
    const rankBarEl = document.getElementById('rankProgressBar');
    const avatarInitial = document.getElementById('avatarInitial');
    
    let rank = "Curious Inquirer";
    let icon = "school";
    let progressPct = 20;
    
    if (totalSearches >= 2 && totalSearches <= 5) {
        rank = "Academic Explorer";
        icon = "explore";
        progressPct = 50;
    } else if (totalSearches >= 6 && totalSearches <= 15) {
        rank = "Philosophical Sage";
        icon = "psychology";
        progressPct = 75;
    } else if (totalSearches > 15) {
        rank = "Grand Archivist";
        icon = "auto_stories";
        progressPct = 100;
    }
    
    if (rankTitleEl) rankTitleEl.textContent = rank;
    if (rankIconEl) rankIconEl.textContent = icon;
    if (rankBarEl) rankBarEl.style.width = `${progressPct}%`;
    
    if (avatarInitial) {
        avatarInitial.textContent = rank.charAt(0);
    }

    // 3. Dynamic Interest Profiling
    const domainEl = document.getElementById('profileDomain');
    const listEl = document.getElementById('profileInterestsList');
    
    let scores = { Philosophy: 0, Literature: 0, "Social Theory": 0, "Art History": 0 };
    
    chatSessions.forEach(s => {
        const title = s.title.toLowerCase();
        if (/philosophy|stoic|existential|nihil|rational|ethics|moral|thinker/i.test(title)) scores.Philosophy++;
        if (/literature|gothic|surreal|realism|book|novel|author|poetry|write/i.test(title)) scores.Literature++;
        if (/marx|femin|anarch|postmodern|colonial|critical|society/i.test(title)) scores["Social Theory"]++;
        if (/art|dada|symbolism|classicism|paint|aesthetic/i.test(title)) scores["Art History"]++;
    });
    
    let dominant = "Broad Intellectual Generalist";
    let maxScore = 0;
    let categoriesList = [];
    
    Object.entries(scores).forEach(([cat, score]) => {
        if (score > 0) {
            categoriesList.push(cat);
            if (score > maxScore) {
                maxScore = score;
                dominant = `${cat} Specialist`;
            }
        }
    });
    
    if (domainEl) domainEl.textContent = dominant;
    
    if (listEl) {
        if (categoriesList.length === 0) {
            listEl.innerHTML = `
                <span class="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-500 rounded-full font-medium">Philosophy</span>
                <span class="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-500 rounded-full font-medium">Literature</span>
            `;
        } else {
            listEl.innerHTML = categoriesList.map(cat => 
                `<span class="text-[10px] px-2 py-0.5 bg-primary/10 dark:bg-primary-fixed-dim/10 border border-primary/20 dark:border-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim rounded-full font-semibold">${cat}</span>`
            ).join('');
        }
    }

    // 4. Daily Goal Circular Progress
    const today = new Date().toISOString().split('T')[0];
    let goalData = JSON.parse(localStorage.getItem('wiki_daily_queries')) || { count: 0, date: today };
    if (goalData.date !== today) {
        goalData = { count: 0, date: today };
    }
    
    const count = goalData.count;
    const progressText = document.getElementById('goalProgressText');
    const circularEl = document.getElementById('goalCircularProgress');
    
    if (progressText) progressText.textContent = `${count}/5`;
    if (circularEl) {
        const circum = 213.6; // 2 * pi * 34
        const offset = Math.max(0, circum - (circum * Math.min(count, 5) / 5));
        circularEl.style.strokeDasharray = circum;
        circularEl.style.strokeDashoffset = offset;
    }

    // 5. Research Notebook
    const notebook = JSON.parse(localStorage.getItem('wiki_notebook')) || [];
    const countEl = document.getElementById('savedCount');
    const emptyPlaceholder = document.getElementById('emptyNotebookPlaceholder');
    const notebookContainer = document.getElementById('savedInsightsContainer');
    
    if (countEl) countEl.textContent = `${notebook.length} item${notebook.length === 1 ? '' : 's'}`;
    
    if (notebook.length === 0) {
        if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
        if (notebookContainer) notebookContainer.classList.add('hidden');
    } else {
        if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');
        if (notebookContainer) {
            notebookContainer.classList.remove('hidden');
            notebookContainer.innerHTML = notebook.map(item => `
                <div class="notebook-item p-3 bg-zinc-100/50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 rounded-lg relative flex flex-col gap-1 cursor-pointer" onclick="viewNotebookItem(${item.id})">
                    <p class="text-xs text-zinc-700 dark:text-zinc-300 leading-snug pr-6 font-medium">${item.snippet}</p>
                    <div class="flex justify-between items-center mt-1">
                        <span class="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">Saved ${timeAgo(item.id)}</span>
                        <button onclick="deleteFromNotebook(event, ${item.id})" class="text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-zinc-200/30 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    // 6. Dynamic Academic Badges Unlocking Checks!
    const badgeCuriosity = document.getElementById('badge-curiosity');
    const badgeSynthesis = document.getElementById('badge-synthesis');
    const badgeNotebook = document.getElementById('badge-notebook');
    const badgeGoal = document.getElementById('badge-goal');

    // Badge 1: Aura of Curiosity - Unlocked if at least 1 search has been made
    if (badgeCuriosity) {
        if (totalSearches >= 1) {
            badgeCuriosity.classList.add('badge-unlocked');
        } else {
            badgeCuriosity.classList.remove('badge-unlocked');
        }
    }

    // Badge 2: The Synthesizer - Unlocked if they read/viewed daily convergence ideologies
    if (badgeSynthesis) {
        const viewed = localStorage.getItem('wiki_convergence_viewed') === 'true';
        if (viewed) {
            badgeSynthesis.classList.add('badge-unlocked');
        } else {
            badgeSynthesis.classList.remove('badge-unlocked');
        }
    }

    // Badge 3: Archival Curator - Unlocked if at least 3 insights are saved in notebook
    if (badgeNotebook) {
        if (notebook.length >= 3) {
            badgeNotebook.classList.add('badge-unlocked');
        } else {
            badgeNotebook.classList.remove('badge-unlocked');
        }
    }

    // Badge 4: Unbroken Flame - Unlocked if they completed their daily query goal of 5/5
    if (badgeGoal) {
        if (count >= 5) {
            badgeGoal.classList.add('badge-unlocked');
        } else {
            badgeGoal.classList.remove('badge-unlocked');
        }
    }
}

// Wire dynamic calculations on boot!
document.addEventListener('DOMContentLoaded', () => {
    updateProfileDashboard();
});
