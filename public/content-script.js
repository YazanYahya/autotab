/** A CSS class for the floating ghost suggestion */
const GHOST_CLASS = "autotab-ghost-overlay";

/** Stores text area states */
const textAreaData = new Map();

/** Debounce timers to prevent excessive API calls */
const debounceTimers = new Map();

/** Configuration */
const DEBOUNCE_DELAY = 1500;
const MIN_TEXT_LENGTH = 10;

/** Initialize AutoTab on page load */
function initializeAutoTab() {
    console.log("[AutoTab] Initializing extension...");

    // Attach AutoTab to all existing textareas
    attachAutoTabToExistingTextareas();

    // Observe dynamic textareas added to the DOM
    observeDynamicTextareas();
}

/** Finds all existing textareas on the page and attaches AutoTab */
function attachAutoTabToExistingTextareas() {
    console.log("[AutoTab] Attaching to existing textareas...");
    document.querySelectorAll("textarea").forEach(attachAutoTab);
}

/** Observes dynamically added textareas and attaches AutoTab */
function observeDynamicTextareas() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === "TEXTAREA") {
                    console.log("[AutoTab] New textarea detected:", node);
                    attachAutoTab(node);
                }
            });
        });
    });

    observer.observe(document.body, {childList: true, subtree: true});
    console.log("[AutoTab] Now observing dynamic textareas...");
}

/** Attaches AutoTab functionality to a given textarea */
function attachAutoTab(textarea) {
    if (textAreaData.has(textarea)) return; // Prevent duplicate listeners

    console.log("[AutoTab] Attaching AutoTab to:", textarea);

    // Initialize storage
    textAreaData.set(textarea, {
        userText: textarea.value || "",
        suggestion: "",
        originalText: "",
        cachedResponse: null,
    });

    // Attach event listeners
    attachTextareaListeners(textarea);
}

/** Attaches all event listeners to a textarea */
function attachTextareaListeners(textarea) {
    textarea.addEventListener("input", () => handleUserInput(textarea));
    textarea.addEventListener("keydown", (e) => handleKeydown(e, textarea));
    textarea.addEventListener("scroll", () => updateGhostOverlayPosition(textarea));
    new ResizeObserver(() => updateGhostOverlayPosition(textarea)).observe(textarea);
}

/** Handles user input, debouncing AI requests */
function handleUserInput(textarea) {
    const userText = textarea.value.trim();
    console.log("[AutoTab] User typed:", userText);

    textAreaData.get(textarea).userText = userText;

    if (!isValidInput(userText)) {
        console.log("[AutoTab] Invalid input, skipping AI request.");
        removeGhostOverlay(textarea);
        textAreaData.get(textarea).suggestion = "";
        return;
    }

    // Debounce AI request
    clearTimeout(debounceTimers.get(textarea));
    debounceTimers.set(textarea, setTimeout(() => {
        requestAISuggestion(textarea, userText);
    }, DEBOUNCE_DELAY));
}

/** Handles key events: Tab (accept suggestion), Ctrl+Z (undo) */
function handleKeydown(event, textarea) {
    if (event.key === "Tab") {
        event.preventDefault();
        acceptSuggestion(textarea);
    }

    if (event.ctrlKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undoSuggestion(textarea);
    }
}

/** Requests AI suggestion for a textarea */
function requestAISuggestion(textarea, userText) {
    if (!userText) {
        removeGhostOverlay(textarea);
        textAreaData.get(textarea).suggestion = "";
        return;
    }

    console.log("[AutoTab] Checking cache for:", userText);

    if (textAreaData.get(textarea).cachedResponse === userText) {
        console.log("[AutoTab] Using cached AI suggestion.");
        showGhostOverlay(textarea, textAreaData.get(textarea).suggestion);
        return;
    }

    console.log("[AutoTab] Requesting AI suggestion for:", userText);

    try {
        chrome.runtime.sendMessage(
            {action: "generate_suggestion", text: userText},
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[AutoTab] Chrome runtime error:", chrome.runtime.lastError.message);
                    return;
                }

                if (response && response.suggestion) {
                    console.log("[AutoTab] AI suggestion received:", response.suggestion);
                    textAreaData.get(textarea).suggestion = response.suggestion;
                    textAreaData.get(textarea).cachedResponse = userText;
                    showGhostOverlay(textarea, response.suggestion);
                } else {
                    console.warn("[AutoTab] No suggestion received.");
                    textAreaData.get(textarea).suggestion = "";
                    removeGhostOverlay(textarea);
                }
            }
        );
    } catch (error) {
        console.error("[AutoTab] Failed to send message:", error);
    }
}

/** Accepts the AI suggestion when the user presses "Tab" */
function acceptSuggestion(textarea) {
    const {suggestion, userText} = textAreaData.get(textarea);
    if (!suggestion) return;

    console.log("[AutoTab] Tab pressed, accepting suggestion:", suggestion);
    textAreaData.get(textarea).originalText = userText;
    textarea.value = userText + suggestion;
    removeGhostOverlay(textarea);
}

/** Reverts text to original when the user presses "Ctrl+Z" */
function undoSuggestion(textarea) {
    const {originalText} = textAreaData.get(textarea);
    if (!originalText) return;

    console.log("[AutoTab] Ctrl+Z pressed, reverting to:", originalText);
    textarea.value = originalText;
    textAreaData.get(textarea).originalText = "";
    removeGhostOverlay(textarea);
}

/**
 * Validates user input before sending an AI request.
 * Ensures input meets a minimum length and is not just numbers or symbols.
 */
function isValidInput(text) {
    if (text.length < MIN_TEXT_LENGTH) {
        console.log("[AutoTab] Input too short, skipping AI request.");
        return false;
    }

    if (/^\d+$/.test(text)) {
        console.log("[AutoTab] Input is numeric-only, skipping AI request.");
        return false;
    }

    if (/^[^a-zA-Z0-9]+$/.test(text)) {
        console.log("[AutoTab] Input contains only special characters, skipping AI request.");
        return false;
    }

    return true;
}

/**
 * Positions a floating overlay on top of the textarea to display ghost text.
 */
function showGhostOverlay(textarea, suggestion) {
    removeGhostOverlay(textarea);

    const data = textAreaData.get(textarea);
    const userText = data.userText || "";

    const rect = textarea.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = GHOST_CLASS;

    overlay.style.position = "absolute";
    overlay.style.zIndex = "9999";
    overlay.style.top = rect.top + window.scrollY + "px";
    overlay.style.left = rect.left + window.scrollX + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";

    const style = window.getComputedStyle(textarea);
    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.boxSizing = style.boxSizing;
    overlay.style.padding = style.padding;
    overlay.style.margin = style.margin;
    overlay.style.border = style.border;
    overlay.style.borderRadius = style.borderRadius;

    overlay.style.color = "rgba(0,0,0,0.3)";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.pointerEvents = "none";
    overlay.style.overflow = "hidden";
    overlay.style.backgroundColor = "transparent";

    overlay.textContent = userText + suggestion;

    document.body.appendChild(overlay);

    // Store a unique ID to tie this overlay to the textarea
    textarea.dataset.overlayId = Math.random().toString(36).slice(2);
    overlay.dataset.refId = textarea.dataset.overlayId;
}

/** Updates overlay position on textarea resize/scroll */
function updateGhostOverlayPosition(textarea) {
    const overlayId = textarea.dataset.overlayId;
    if (!overlayId) return;

    const overlay = document.querySelector(`.${GHOST_CLASS}[data-ref-id="${overlayId}"]`);
    if (!overlay) return;

    const rect = textarea.getBoundingClientRect();
    overlay.style.top = rect.top + window.scrollY + "px";
    overlay.style.left = rect.left + window.scrollX + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
}

/**
 * Removes any existing overlay associated with the given textarea.
 */
function removeGhostOverlay(textarea) {
    const overlayId = textarea.dataset.overlayId || "";
    if (!overlayId) return;

    const allOverlays = document.querySelectorAll(`.${GHOST_CLASS}`);
    allOverlays.forEach((el) => {
        if (el.dataset.refId === overlayId) {
            el.remove();
            console.log("[AutoTab] Removed ghost overlay.");
        }
    });
}

// Start the extension
initializeAutoTab();