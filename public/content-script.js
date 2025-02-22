// A CSS class for the floating ghost suggestion
const GHOST_CLASS = "autotab-ghost-overlay";

// Map each textarea to its stored data: { userText, suggestion, originalText }
const textAreaData = new Map();

console.log("[AutoTab] Content script started.");

// 1. Select all existing textareas (no dynamic detection)
const textareas = document.querySelectorAll("textarea");
console.log(`[AutoTab] Found ${textareas.length} <textarea> elements.`);

// 2. Attach AI autocomplete logic to each
textareas.forEach((textarea, index) => {
    console.log(`[AutoTab] Attaching to textarea #${index + 1}.`);

    // Initialize data structure
    textAreaData.set(textarea, {
        userText: textarea.value || "",
        suggestion: "",
        originalText: "", // for undo (Ctrl+Z)
    });

    // Listen for user input
    textarea.addEventListener("input", () => {
        const userText = textarea.value;
        console.log("[AutoTab] User typed:", userText);

        // Update the map
        textAreaData.get(textarea).userText = userText;

        // Immediately request a suggestion
        requestAISuggestion(textarea, userText);
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
 * @param {HTMLTextAreaElement} textarea
 * @param {string} userText
 */
function requestAISuggestion(textarea, userText) {
    if (!userText) {
        // If empty, remove ghost overlay & reset suggestion
        removeGhostOverlay(textarea);
        textAreaData.get(textarea).suggestion = "";
        return;
    }

    console.log("[AutoTab] Requesting AI suggestion for text:", userText);

    chrome.runtime.sendMessage(
        {action: "generate_suggestion", text: userText},
        (response) => {
            if (response && response.suggestion) {
                console.log("[AutoTab] AI suggestion received:", response.suggestion);
                // Store the suggestion
                textAreaData.get(textarea).suggestion = response.suggestion;
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
 * showGhostOverlay
 * Positions a floating overlay on top of the textarea to display ghost text.
 * Uses getBoundingClientRect() for accurate alignment.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} suggestion
 */
function showGhostOverlay(textarea, suggestion) {
    // Remove any old overlay
    removeGhostOverlay(textarea);

    const data = textAreaData.get(textarea);
    const userText = data.userText || "";

    // 1. Get bounding rect
    const rect = textarea.getBoundingClientRect();

    // 2. Create an overlay <div>
    const overlay = document.createElement("div");
    overlay.className = GHOST_CLASS;

    // 3. Copy style from textarea
    const style = window.getComputedStyle(textarea);
    overlay.style.position = "absolute";
    overlay.style.zIndex = "9999";
    // Align to the same spot
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
    overlay.style.backgroundColor = "transparent"; // So we can see the real textarea behind

    // 4. Combine userText + ghostPortion
    overlay.textContent = userText + suggestion;

    // 5. Append to body (or a container with `position: relative;`)
    document.body.appendChild(overlay);

    // Store a unique ID to tie this overlay to the textarea
    textarea.dataset.overlayId = Math.random().toString(36).slice(2);
    overlay.dataset.refId = textarea.dataset.overlayId;
    console.log("[AutoTab] Ghost overlay displayed for text:", userText);
}

/**
 * removeGhostOverlay
 * Removes any existing overlay associated with the given textarea.
 * @param {HTMLTextAreaElement} textarea
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