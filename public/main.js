const heroScreen = document.getElementById('heroScreen');
const chatScreen = document.getElementById('chatScreen');
const chatContainer = document.getElementById('chatContainer');
const heroInput = document.getElementById('heroInput');
const heroSendBtn = document.getElementById('heroSendBtn');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
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
    
    // Simple formatting for newlines
    const formattedText = text.replace(/\n/g, '<br>');
    msgDiv.innerHTML = formattedText;
    
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
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

async function handleSend(text) {
    if (!text) return;
    
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
    } catch (error) {
        removeTypingIndicator();
        addMessage("Error: Could not connect to the agent backend.", 'system');
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
        darkModeBtn.innerHTML = isDark 
            ? '<span class="material-symbols-outlined text-[24px]">light_mode</span>' 
            : '<span class="material-symbols-outlined text-[24px]">dark_mode</span>';
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

async function updateDiary() {
    diaryAnalysis.innerHTML = "<em>The Scholar is analyzing your journey...</em>";
    suggestedBooksGrid.innerHTML = '<div class="col-span-full text-center py-xl text-on-surface-variant"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><br><span class="text-caption font-label-caps uppercase tracking-widest mt-2 block">Consulting the Archives</span></div>';
    
    try {
        const response = await fetch('/api/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: chatSessions.map(s => s.title) })
        });
        const data = await response.json();
        
        diaryAnalysis.innerHTML = `"${data.analysis}"`;
        
        suggestedBooksGrid.innerHTML = data.books.map(book => `
            <div class="p-md bg-surface-container-low rounded-xl border border-outline-variant flex gap-md hover:bg-surface-container transition-all group">
                <div class="w-16 h-24 bg-primary/10 rounded flex-shrink-0 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <span class="material-symbols-outlined text-primary">book</span>
                </div>
                <div class="flex flex-col justify-center">
                    <h4 class="font-bold text-on-surface">${book.title}</h4>
                    <p class="text-caption text-secondary font-label-caps">${book.author}</p>
                    <p class="text-caption text-on-surface-variant line-clamp-2 mt-1">${book.desc}</p>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Diary update error:", err);
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

// Initialize History UI on load
document.addEventListener('DOMContentLoaded', () => {
    updateHistoryUI();
});
