// A CSS class for the floating ghost suggestion
const GHOST_CLASS = "autotab-ghost-overlay";

// Map each textarea to its stored data: { userText, suggestion, originalText, cachedResponse }
const textAreaData = new Map();

// API request debouncing
const debounceTimers = new Map();
const DEBOUNCE_DELAY = 1500;

// Minimum text length required for AI suggestions
const MIN_TEXT_LENGTH = 10;

console.log("[AutoTab] Content script started.");

// 1. Select all existing textareas (no dynamic detection)
const textareas = document.querySelectorAll("textarea");
console.log(`[AutoTab] Found ${textareas.length} <textarea> elements.`);

// 2. Attach AI autocomplete logic to each textarea
textareas.forEach((textarea, index) => {
    console.log(`[AutoTab] Attaching to textarea #${index + 1}.`);

    // Initialize data structure
    textAreaData.set(textarea, {
        userText: textarea.value || "",
        suggestion: "",
        originalText: "", // for undo (Ctrl+Z)
    });

    // Listen for user input with debouncing
    textarea.addEventListener("input", () => {
        const userText = textarea.value;
        console.log("[AutoTab] User typed:", userText);

        // Update the map
        textAreaData.get(textarea).userText = userText;

        // Apply input validation before requesting suggestions
        if (!isValidInput(userText)) {
            console.log("[AutoTab] Skipping AI request (invalid input).");
            removeGhostOverlay(textarea);
            textAreaData.get(textarea).suggestion = "";
            return;
        }

        // Debounce API calls
        clearTimeout(debounceTimers.get(textarea));
        // Set new timer
        const timer = setTimeout(() => {
            requestAISuggestion(textarea, userText);
        }, DEBOUNCE_DELAY);
        debounceTimers.set(textarea, timer);
    });

    // Listen for keydown to handle Tab acceptance & Ctrl+Z revert
    textarea.addEventListener("keydown", (e) => {
        // Tab => accept suggestion if valid
        if (e.key === "Tab") {
            const {suggestion, userText} = textAreaData.get(textarea);

            // Must have a suggestion that extends userText
            if (suggestion) {
                console.log("[AutoTab] Tab pressed, accepting suggestion:", suggestion);
                e.preventDefault();

                // Store the user's original text before we fill
                textAreaData.get(textarea).originalText = userText;

                // Fill in the suggestion
                textarea.value = userText + suggestion;

                // Remove overlay
                removeGhostOverlay(textarea);
            }
        }

        // Ctrl+Z => revert to originalText
        if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
            const {originalText} = textAreaData.get(textarea);
            if (originalText) {
                console.log("[AutoTab] Ctrl+Z pressed, reverting to:", originalText);
                e.preventDefault();

                // Restore the user's text
                textarea.value = originalText;
                textAreaData.get(textarea).originalText = ""; // clear once used
                // Remove any overlay
                removeGhostOverlay(textarea);
            }
        }
    });

    // Optionally request an initial suggestion if there's existing text
    if (textarea.value) {
        requestAISuggestion(textarea, textarea.value);
    }
});

/**
 * requestAISuggestion
 * Sends user text to the background script to get an AI-generated completion.
 * Uses caching to avoid redundant requests.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} userText
 */
function requestAISuggestion(textarea, userText) {
    if (!userText) {
        removeGhostOverlay(textarea);
        textAreaData.get(textarea).suggestion = "";
        return;
    }

    console.log("[AutoTab] Requesting AI suggestion for text:", userText);

    // Check if we already have a cached response for this text
    if (textAreaData.get(textarea).cachedResponse === userText) {
        console.log("[AutoTab] Using cached AI suggestion.");
        const cachedSuggestion = textAreaData.get(textarea).suggestion;
        showGhostOverlay(textarea, cachedSuggestion);
        return;
    }

    chrome.runtime.sendMessage(
        {action: "generate_suggestion", text: userText},
        (response) => {
            if (response && response.suggestion) {
                console.log("[AutoTab] AI suggestion received:", response.suggestion);
                // Store the suggestion
                textAreaData.get(textarea).suggestion = response.suggestion;
                textAreaData.get(textarea).cachedResponse = userText;

                // Display the ghost overlay
                showGhostOverlay(textarea, response.suggestion);
            } else {
                console.warn("[AutoTab] No suggestion or AI error encountered.");
                // Clear any existing suggestion
                textAreaData.get(textarea).suggestion = "";
                removeGhostOverlay(textarea);
            }
        }
    );
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

    const style = window.getComputedStyle(textarea);
    overlay.style.position = "absolute";
    overlay.style.zIndex = "9999";
    overlay.style.top = rect.top + window.scrollY + "px";
    overlay.style.left = rect.left + window.scrollX + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";

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
    console.log("[AutoTab] Ghost overlay displayed for text:", userText);
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