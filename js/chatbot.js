/**
 * AI Study Chatbot — floating widget powered by Gemini.
 * Include after firebase-config.js (needed for getGeminiApiKey).
 */
(function () {
  var HISTORY_LIMIT = 12; // keep last 12 messages for context
  var chatHistory = [];
  var isOpen = false;
  var isLoading = false;

  /** Build a system prompt with page context. */
  function getSystemContext() {
    var name = sessionStorage.getItem("studentName") || "";
    var category = sessionStorage.getItem("category") || "";
    var payload = null;
    try {
      var raw = sessionStorage.getItem("testPayload");
      if (raw) payload = JSON.parse(raw);
    } catch (e) {}

    var ctx =
      "You are a concise, friendly AI tutor for Interview Lab — a test platform for " +
      "web development (HTML, CSS, JavaScript) and aptitude preparation. " +
      "Give clear, focused answers. Use short examples when helpful. Avoid unnecessary padding.";
    if (name) ctx += " The student's name is " + name + ".";
    if (category && !payload) ctx += " They are currently studying " + category + ".";
    if (payload) {
      ctx +=
        " They just completed a " +
        payload.category +
        " test and scored " +
        payload.score +
        " out of " +
        payload.total +
        ".";
    }
    return ctx;
  }

  /** Inject the widget HTML into the page. */
  function buildWidget() {
    var btn = document.createElement("button");
    btn.id = "chatbot-toggle";
    btn.className = "chatbot-toggle";
    btn.setAttribute("aria-label", "Open AI Tutor");
    btn.innerHTML =
      '<span class="chatbot-toggle__icon">✦</span>' +
      '<span class="chatbot-toggle__label">AI Tutor</span>';

    var panel = document.createElement("div");
    panel.id = "chatbot-panel";
    panel.className = "chatbot-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI Tutor Chat");
    panel.innerHTML =
      '<div class="chatbot-header">' +
        '<div class="chatbot-header__info">' +
          '<span class="chatbot-header__icon">✦</span>' +
          '<div>' +
            '<div class="chatbot-header__title">AI Tutor</div>' +
            '<div class="chatbot-header__sub">Powered by Google Gemini</div>' +
          '</div>' +
        '</div>' +
        '<button class="chatbot-close" id="chatbot-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="chatbot-messages" id="chatbot-messages">' +
        '<div class="chatbot-msg chatbot-msg--bot">' +
          '<div class="chatbot-msg__text">' +
            'Hi! I\'m your AI tutor. Ask me anything about HTML, CSS, JavaScript, or aptitude — ' +
            'I\'ll give you clear explanations and examples. 🎓' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="chatbot-footer">' +
        '<input type="text" id="chatbot-input" class="chatbot-input" ' +
          'placeholder="Ask a question…" autocomplete="off" />' +
        '<button id="chatbot-send" class="chatbot-send" aria-label="Send message">➤</button>' +
      '</div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.addEventListener("click", toggleChat);
    document.getElementById("chatbot-close").addEventListener("click", closeChat);
    document.getElementById("chatbot-send").addEventListener("click", handleSend);
    document.getElementById("chatbot-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  function toggleChat() {
    if (isOpen) closeChat();
    else openChat();
  }

  function openChat() {
    isOpen = true;
    var panel = document.getElementById("chatbot-panel");
    var btn = document.getElementById("chatbot-toggle");
    if (panel) panel.classList.add("chatbot-panel--open");
    if (btn) btn.classList.add("chatbot-toggle--active");
    setTimeout(function () {
      var input = document.getElementById("chatbot-input");
      if (input) input.focus();
    }, 80);
  }

  function closeChat() {
    isOpen = false;
    var panel = document.getElementById("chatbot-panel");
    var btn = document.getElementById("chatbot-toggle");
    if (panel) panel.classList.remove("chatbot-panel--open");
    if (btn) btn.classList.remove("chatbot-toggle--active");
  }

  function addMessage(text, isBot) {
    var messages = document.getElementById("chatbot-messages");
    if (!messages) return null;
    var msg = document.createElement("div");
    msg.className = "chatbot-msg " + (isBot ? "chatbot-msg--bot" : "chatbot-msg--user");
    var inner = document.createElement("div");
    inner.className = "chatbot-msg__text";
    inner.textContent = text;
    msg.appendChild(inner);
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addLoadingBubble() {
    var messages = document.getElementById("chatbot-messages");
    if (!messages) return null;
    var msg = document.createElement("div");
    msg.className = "chatbot-msg chatbot-msg--bot chatbot-msg--typing";
    msg.innerHTML =
      '<div class="chatbot-msg__text">' +
        '<span class="chatbot-dots">' +
          '<span></span><span></span><span></span>' +
        '</span>' +
      '</div>';
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function handleSend() {
    if (isLoading) return;
    var input = document.getElementById("chatbot-input");
    if (!input) return;
    var text = (input.value || "").trim();
    if (!text) return;
    input.value = "";

    addMessage(text, false);
    chatHistory.push({ role: "user", text: text });
    if (chatHistory.length > HISTORY_LIMIT) chatHistory.shift();

    var apiKey = typeof getGeminiApiKey === "function" ? getGeminiApiKey() : "";
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
      addMessage(
        "To enable AI responses, add your Gemini API key on the Results page. " +
          "Get a free key at aistudio.google.com/apikey 🔑",
        true
      );
      return;
    }

    isLoading = true;
    var sendBtn = document.getElementById("chatbot-send");
    if (sendBtn) sendBtn.disabled = true;
    var loadingBubble = addLoadingBubble();

    fetchReply(text, apiKey)
      .then(function (reply) {
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        addMessage(reply, true);
        chatHistory.push({ role: "bot", text: reply });
        if (chatHistory.length > HISTORY_LIMIT) chatHistory.shift();
      })
      .catch(function (err) {
        if (loadingBubble && loadingBubble.parentNode) loadingBubble.remove();
        addMessage(
          "Sorry, I couldn't get a response right now. Please try again. (" +
            (err.message || "error") + ")",
          true
        );
      })
      .finally(function () {
        isLoading = false;
        if (sendBtn) sendBtn.disabled = false;
        var inp = document.getElementById("chatbot-input");
        if (inp) inp.focus();
      });
  }

  async function fetchReply(userMessage, apiKey) {
    var systemCtx = getSystemContext();

    // Include recent conversation turns for context
    var historyLines = chatHistory
      .slice(-6)
      .map(function (m) {
        return (m.role === "user" ? "Student: " : "Tutor: ") + m.text;
      })
      .join("\n");

    var prompt =
      systemCtx +
      "\n\n" +
      (historyLines ? "Recent conversation:\n" + historyLines + "\n\n" : "") +
      "Student: " +
      userMessage +
      "\nTutor:";

    var url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey);

    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error("Gemini " + res.status + ": " + errText.slice(0, 200));
    }

    var data = await res.json();
    return (
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) ||
      "I couldn't generate a response. Please try again."
    ).trim();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
