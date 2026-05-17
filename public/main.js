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
    currentSessionId = null; // Clear session tracking
    chatScreen.classList.add('hidden');
    heroScreen.classList.remove('hidden');
    heroScreen.classList.remove('opacity-0');
    heroInput.value = '';
    chatContainer.innerHTML = '';
}

const mobileHomeBtn = document.getElementById('mobileHomeBtn');

newInquiryBtn.addEventListener('click', resetToHeroMode);
if (homeBtn) homeBtn.addEventListener('click', resetToHeroMode);
if (mobileHomeBtn) mobileHomeBtn.addEventListener('click', resetToHeroMode);

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

function showTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message', 'agent');
    msgDiv.id = 'typingIndicator';
    msgDiv.innerHTML = '<div class="flex items-center h-5"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

let isThinking = false;

async function handleSend(text) {
    if (!text || isThinking) return;
    isThinking = true;

    // Visual Pacing: Disable inputs & buttons, add thinking indicators
    heroInput.disabled = true;
    chatInput.disabled = true;
    heroSendBtn.disabled = true;
    chatSendBtn.disabled = true;

    const originalChatPlaceholder = chatInput.placeholder;
    chatInput.placeholder = "WikiSearch is synthesizing…";
    chatInput.classList.add('opacity-60', 'cursor-not-allowed', 'chat-input-thinking');
    if (chatInputBg) chatInputBg.classList.add('chat-input-bg-thinking');

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
        // Enforce a 1.5-second pacing cooldown after the response is rendered 
        // to completely protect the free-tier API from rapid-fire spam.
        setTimeout(() => {
            isThinking = false;
            heroInput.disabled = false;
            chatInput.disabled = false;
            heroSendBtn.disabled = false;
            chatSendBtn.disabled = false;

            chatInput.placeholder = originalChatPlaceholder;
            chatInput.classList.remove('opacity-60', 'cursor-not-allowed', 'chat-input-thinking');
            if (chatInputBg) chatInputBg.classList.remove('chat-input-bg-thinking');
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

async function updateDiary() {
    diaryAnalysis.innerHTML = '<em>Consulting the global archives...</em>';
    suggestedBooksGrid.innerHTML = '<div class="col-span-full text-center py-8 text-on-surface-variant"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><br><span class="text-xs font-label-caps uppercase tracking-widest mt-2 block">Consulting the Archives</span></div>';

    try {
        // Use cached data if available, otherwise fetch
        if (!cachedTrendingData) {
            const res = await fetch('/api/trending');
            cachedTrendingData = await res.json();
        }

        const { topics, scholarlyAnalysis } = cachedTrendingData;

        // Scholar's analysis
        diaryAnalysis.innerHTML = `&#8220;${scholarlyAnalysis}&#8221;`;

        // Render books grid
        suggestedBooksGrid.innerHTML = topics.map(topic => `
            <div class="p-4 bg-surface-container dark:bg-zinc-900 rounded-xl border border-outline-variant dark:border-zinc-800 flex gap-4 hover:border-primary/40 transition-all group cursor-pointer" onclick="handleSend('${topic.title.replace(/'/g, "\\'")}')"; >
                <div class="w-14 h-20 bg-primary/10 dark:bg-primary/5 rounded flex-shrink-0 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <span class="material-symbols-outlined text-primary dark:text-primary-fixed-dim">book</span>
                </div>
                <div class="flex flex-col justify-center gap-1 min-w-0">
                    <span class="badge badge-${topic.category.replace(/[^a-zA-Z]/g, '')} w-fit">&#35;${topic.category.toUpperCase()}</span>
                    <h4 class="font-bold text-on-surface dark:text-zinc-100 text-sm leading-snug">${topic.book.title}</h4>
                    <p class="text-xs text-primary dark:text-primary-fixed-dim font-medium">${topic.book.author}</p>
                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mt-0.5">${topic.book.reason}</p>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Diary update error:', err);
        diaryAnalysis.innerHTML = '<em>The archives are misty today. Please try again shortly.</em>';
        suggestedBooksGrid.innerHTML = '';
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
        if (heroInput) heroInput.placeholder = "What are you curious about today?";
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
