#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cctype>
#include <iomanip>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#endif

namespace {

std::string trim(const std::string& str) {
    const auto start = str.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) {
        return "";
    }
    const auto end = str.find_last_not_of(" \t\r\n");
    return str.substr(start, end - start + 1);
}

std::string urlEncode(const std::string& value) {
    std::ostringstream escaped;
    escaped.fill('0');
    escaped << std::hex;
    for (char c : value) {
        if (isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_' || c == '.' || c == '~') {
            escaped << c;
        } else if (c == ' ') {
            escaped << "%20";
        } else {
            escaped << std::uppercase << '%' << std::setw(2) << static_cast<int>(static_cast<unsigned char>(c)) << std::nouppercase;
        }
    }
    return escaped.str();
}

std::string toLowerCase(const std::string& str) {
    std::string lowerStr = str;
    std::transform(lowerStr.begin(), lowerStr.end(), lowerStr.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return lowerStr;
}

std::string removePunctuation(std::string s) {
    s.erase(std::remove_if(s.begin(), s.end(),
                           [](unsigned char c) { return std::ispunct(c) != 0; }),
            s.end());
    return s;
}

// Strip common question phrasing so "what is phishing?" matches keyword "phishing"
std::string normalizeQuestion(std::string s) {
    s = removePunctuation(toLowerCase(trim(s)));

    static const std::vector<std::string> fillers = {
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
        "about ",
    };

    bool changed = true;
    while (changed) {
        changed = false;
        for (const auto& filler : fillers) {
            if (s.rfind(filler, 0) == 0) {
                s = trim(s.substr(filler.size()));
                changed = true;
                break;
            }
        }
    }
    return s;
}

bool containsKeyword(const std::string& haystack, const std::string& keyword) {
    return haystack.find(keyword) != std::string::npos;
}

#ifdef _WIN32
std::string resolveWindowsApp(const std::string& appName) {
    static const std::map<std::string, std::string> aliases = {
        {"notepad", "notepad.exe"},
        {"notes", "notepad.exe"},
        {"calc", "calc.exe"},
        {"calculator", "calc.exe"},
        {"paint", "mspaint.exe"},
        {"explorer", "explorer.exe"},
        {"cmd", "cmd.exe"},
        {"command prompt", "cmd.exe"},
    };

    const std::string key = toLowerCase(trim(appName));
    const auto it = aliases.find(key);
    if (it != aliases.end()) {
        return it->second;
    }
    if (appName.find('.') == std::string::npos) {
        return appName + ".exe";
    }
    return appName;
}

bool launchApplication(const std::string& appName, std::string& statusMessage) {
    const std::string target = resolveWindowsApp(appName);
    const HINSTANCE result =
        ShellExecuteA(nullptr, "open", target.c_str(), nullptr, nullptr, SW_SHOWNORMAL);

    if (reinterpret_cast<INT_PTR>(result) > 32) {
        statusMessage = "[Agent Action]: Launched -> " + target;
        return true;
    }

    statusMessage =
        "[Agent Action]: Could not launch '" + appName +
        "'. Try a built-in name: notepad, calculator, paint, explorer, cmd.";
    return false;
}
#else
bool launchApplication(const std::string& appName, std::string& statusMessage) {
    statusMessage =
        "[Agent Action]: Simulated launch (Windows-only) -> " + appName +
        "\nInstall on Windows or extend this stub for your OS.";
    (void)appName;
    return true;
}
#endif

}  // namespace

class Agent {
private:
    std::vector<std::pair<std::string, std::string>> knowledgeEntries;
    std::string configPath;

    void sortByKeywordLength() {
        std::sort(knowledgeEntries.begin(), knowledgeEntries.end(),
                  [](const auto& a, const auto& b) { return a.first.size() > b.first.size(); });
    }

    void loadBuiltInKnowledge() {
        knowledgeEntries = {
            {"study plan",
             "Study Plan: I recommend the Pomodoro technique (25 minutes of focus, 5 minutes break). Also, prioritize past papers and core technical subjects."},
            {"pomodoro",
             "Study Plan: I recommend the Pomodoro technique (25 minutes of focus, 5 minutes break). Also, prioritize past papers and core technical subjects."},
            {"computer science",
             "Computer Science Basics: Computer Science is the study of hardware and software to solve real-world problems."},
            {"cs basics",
             "Computer Science Basics: Computer Science is the study of hardware and software to solve real-world problems."},
            {"cyber security",
             "Cyber Security: Cyber Security is the practice of protecting computers, servers, networks, and data from malicious attacks."},
            {"firewall", "Firewall: A digital barrier controlling network traffic."},
            {"phishing", "Phishing: Fraudulent emails designed to steal user credentials."},
            {"hec curriculum",
             "HEC Curriculum spans 8 semesters. Type 'semester 1' to 'semester 8' to see specific subjects."},
            {"semester 1",
             "Semester 1: Introduction to Computing (ICT) and Programming Fundamentals (C++)."},
            {"semester 2",
             "Semester 2: Object-Oriented Programming (OOP) concepts like classes and inheritance."},
            {"semester 3", "Semester 3: Data Structures & Algorithms (DSA)."},
            {"semester 4", "Semester 4: Operating Systems and Database Systems."},
            {"semester 5", "Semester 5: Computer Networks and Software Engineering."},
            {"semester 6", "Semester 6: Web Development and Artificial Intelligence."},
            {"semester 7", "Semester 7: Cyber Security and Cloud Computing."},
            {"semester 8",
             "Semester 8: Final Year Project (FYP) and Professional Practices."},
        };
        sortByKeywordLength();
    }

    bool loadKnowledgeFromFile(const std::string& path) {
        std::ifstream file(path);
        if (!file.is_open()) {
            return false;
        }

        knowledgeEntries.clear();
        std::string line;
        while (std::getline(file, line)) {
            line = trim(line);
            if (line.empty() || line[0] == '#') {
                continue;
            }

            const std::size_t sep = line.find('|');
            if (sep == std::string::npos) {
                continue;
            }

            const std::string keyword = toLowerCase(trim(line.substr(0, sep)));
            const std::string answer = trim(line.substr(sep + 1));
            if (!keyword.empty() && !answer.empty()) {
                knowledgeEntries.emplace_back(keyword, answer);
            }
        }

        if (knowledgeEntries.empty()) {
            return false;
        }

        sortByKeywordLength();
        return true;
    }

    static std::string extractArgument(const std::string& input, std::size_t prefixLen) {
        if (input.size() <= prefixLen) {
            return "";
        }
        return trim(input.substr(prefixLen));
    }

    const std::string* findKnowledgeMatch(const std::string& lowerInput,
                                          const std::string& normalizedInput) const {
        // 1) Exact phrase match
        for (const auto& entry : knowledgeEntries) {
            if (lowerInput == entry.first) {
                return &entry.second;
            }
        }

        // 2) Substring on raw lowercased input (longest keywords first)
        for (const auto& entry : knowledgeEntries) {
            if (containsKeyword(lowerInput, entry.first)) {
                return &entry.second;
            }
        }

        // 3) Fuzzy: normalized question text ("what is phishing" -> "phishing")
        for (const auto& entry : knowledgeEntries) {
            if (containsKeyword(normalizedInput, entry.first)) {
                return &entry.second;
            }
        }

        // 4) All words of keyword appear in normalized input
        for (const auto& entry : knowledgeEntries) {
            std::string remaining = normalizedInput;
            bool allWordsFound = true;
            std::string word;
            std::istringstream stream(entry.first);
            while (stream >> word) {
                const auto pos = remaining.find(word);
                if (pos == std::string::npos) {
                    allWordsFound = false;
                    break;
                }
                remaining.erase(pos, word.size());
            }
            if (allWordsFound && !entry.first.empty()) {
                return &entry.second;
            }
        }

        return nullptr;
    }

public:
    explicit Agent(const std::string& knowledgeFilePath = "knowledge.txt")
        : configPath(knowledgeFilePath) {
        if (!loadKnowledgeFromFile(configPath)) {
            std::cout << "Note: Using built-in knowledge ('" << configPath
                      << "' not found or empty).\n\n";
            loadBuiltInKnowledge();
        } else {
            std::cout << "Loaded knowledge from '" << configPath << "'.\n\n";
        }
    }

    std::string getHelpText() const {
        std::string help =
            "=== Agent Help ===\n"
            "Commands:\n"
            "  help, ?              Show this message\n"
            "  open app <name>      Launch an app (Windows: notepad, calculator, paint...)\n"
            "  call <name>          Simulate a phone call\n"
            "  message <name>       Simulate opening a chat\n"
            "  whatsapp <phone> <msg> Send a WhatsApp message\n"
            "  exit, quit           End session\n"
            "\n"
            "Ask naturally, for example:\n"
            "  what is phishing\n"
            "  tell me about semester 3\n"
            "  cyber security\n"
            "\n"
            "Topics in knowledge base:\n";

        std::vector<std::string> keywords;
        keywords.reserve(knowledgeEntries.size());
        for (const auto& entry : knowledgeEntries) {
            keywords.push_back(entry.first);
        }
        std::sort(keywords.begin(), keywords.end());

        for (const auto& keyword : keywords) {
            help += "  - " + keyword + "\n";
        }

        help += "\nEdit '" + configPath + "' to add more Q&A (keyword|answer).";
        return help;
    }

    std::string getResponse(const std::string& userInput) {
        const std::string lowerInput = toLowerCase(userInput);
        const std::string normalizedInput = normalizeQuestion(userInput);

        if (lowerInput == "help" || lowerInput == "?") {
            return getHelpText();
        }

        if (lowerInput.rfind("open app ", 0) == 0) {
            const std::string appName = extractArgument(userInput, 9);
            if (appName.empty()) {
                return "[Agent Action]: Please specify an app name. Example: open app notepad";
            }
            std::string status;
            launchApplication(appName, status);
            return status;
        }
        if (lowerInput.rfind("call ", 0) == 0) {
            const std::string contactName = extractArgument(userInput, 5);
            if (contactName.empty()) {
                return "[Agent Action]: Please specify a contact name. Example: call Ali";
            }
            return "[Agent Action]: Dialing network... Calling -> " + contactName;
        }
        if (lowerInput.rfind("message ", 0) == 0) {
            const std::string contactName = extractArgument(userInput, 8);
            if (contactName.empty()) {
                return "[Agent Action]: Please specify a contact name. Example: message Sara";
            }
            return "[Agent Action]: Opening chat interface... Preparing message for -> " + contactName;
        }
        if (lowerInput.rfind("whatsapp ", 0) == 0) {
            std::string args = extractArgument(userInput, 9);
            size_t spacePos = args.find(' ');
            if (spacePos == std::string::npos) {
                return "[Agent Action]: Please specify a phone number and message. Example: whatsapp +1234567890 Hello there!";
            }
            std::string phone = args.substr(0, spacePos);
            std::string msg = trim(args.substr(spacePos + 1));
            
            std::string status;
#ifdef _WIN32
            std::string uri = "whatsapp://send?phone=" + phone + "&text=" + urlEncode(msg);
            const HINSTANCE result = ShellExecuteA(nullptr, "open", uri.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            if (reinterpret_cast<INT_PTR>(result) > 32) {
                status = "[Agent Action]: Opened WhatsApp to send message to " + phone;
            } else {
                status = "[Agent Action]: Could not open WhatsApp. Make sure it is installed.";
            }
#else
            status = "[Agent Action]: Simulated sending WhatsApp to " + phone + " with message: " + msg;
#endif
            return status;
        }

        if (const std::string* answer = findKnowledgeMatch(lowerInput, normalizedInput)) {
            return *answer;
        }

        return "I'm sorry, I do not have information on that topic, and it is not a recognized command.\n"
               "Type 'help' to see topics and commands.";
    }
};

int main() {
    Agent ai;
    std::string userInput;

    std::cout << "========================================\n";
    std::cout << "   Agentic AI Prototype - Phase 3\n";
    std::cout << "========================================\n";
    std::cout << "Hello! I am your AI Knowledge Base and Action Agent.\n";
    std::cout << "Type 'help' for topics and commands, or 'exit' to quit.\n\n";

    while (true) {
        std::cout << "User: ";
        if (!std::getline(std::cin, userInput)) {
            break;
        }

        userInput = trim(userInput);
        if (userInput.empty()) {
            continue;
        }

        const std::string lowerInput = toLowerCase(userInput);
        if (lowerInput == "exit" || lowerInput == "quit") {
            std::cout << "Agent: Goodbye! Best of luck with your studies!\n";
            break;
        }

        std::cout << "Agent: " << ai.getResponse(userInput) << "\n\n";
    }

    return 0;
}
