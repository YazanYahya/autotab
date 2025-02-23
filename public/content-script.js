/** A CSS class for the floating ghost suggestion */
const GHOST_CLASS = "autotab-ghost-overlay";

/** Stores input and text area states */
const inputData = new Map();

/** Debounce timers to prevent excessive API calls */
const debounceTimers = new Map();

/** Configuration */
const DEBOUNCE_DELAY = 1500;
const MIN_TEXT_LENGTH = 10;

/** Initialize AutoTab on page load */
function initializeAutoTab() {
    console.log("[AutoTab] Initializing extension...");

    // Attach AutoTab to all existing input and textarea elements
    attachAutoTabToExistingElements();

    // Observe dynamic input and textarea elements added to the DOM
    observeDynamicElements();
}

/** Finds all existing input and textarea elements on the page and attaches AutoTab */
function attachAutoTabToExistingElements() {
    console.log("[AutoTab] Attaching to existing inputs and textareas...");
    document.querySelectorAll("textarea, input[type='text']").forEach(attachAutoTab);
}

/** Observes dynamically added input and textarea elements and attaches AutoTab */
function observeDynamicElements() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && (node.tagName === "TEXTAREA" || (node.tagName === "INPUT" && node.type === "text"))) {
                    console.log("[AutoTab] New input/textarea detected:", node);
                    attachAutoTab(node);
                }
            });
        });
    });

    observer.observe(document.body, {childList: true, subtree: true});
    console.log("[AutoTab] Now observing dynamic inputs and textareas...");
}

/** Attaches AutoTab functionality to a given input or textarea */
function attachAutoTab(element) {
    if (inputData.has(element)) return; // Prevent duplicate listeners

    console.log("[AutoTab] Attaching AutoTab to:", element);

    // Initialize storage
    inputData.set(element, {
        userText: element.value || "",
        suggestion: "",
        originalText: "",
        cachedResponse: null,
    });

    // Attach event listeners
    attachElementListeners(element);
}

/** Attaches all event listeners to an input or textarea */
function attachElementListeners(element) {
    element.addEventListener("input", () => handleUserInput(element));
    element.addEventListener("keydown", (e) => handleKeydown(e, element));
    element.addEventListener("scroll", () => updateGhostOverlayPosition(element));
    new ResizeObserver(() => updateGhostOverlayPosition(element)).observe(element);
}

/** Handles user input, debouncing AI requests */
function handleUserInput(element) {
    const userText = element.value.trim();
    console.log("[AutoTab] User typed:", userText);

    inputData.get(element).userText = userText;

    if (!isValidInput(userText)) {
        console.log("[AutoTab] Invalid input, skipping AI request.");
        removeGhostOverlay(element);
        inputData.get(element).suggestion = "";
        return;
    }

    // Debounce AI request
    clearTimeout(debounceTimers.get(element));
    debounceTimers.set(element, setTimeout(() => {
        requestAISuggestion(element, userText);
    }, DEBOUNCE_DELAY));
}

/** Handles key events: Tab (accept suggestion), Ctrl+Z (undo) */
function handleKeydown(event, element) {
    if (event.key === "Tab") {
        event.preventDefault();
        acceptSuggestion(element);
    }

    if (event.ctrlKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undoSuggestion(element);
    }
}

/** Requests AI suggestion for an input */
function requestAISuggestion(element, userText) {
    if (!userText) {
        removeGhostOverlay(element);
        inputData.get(element).suggestion = "";
        return;
    }

    console.log("[AutoTab] Checking cache for:", userText);

    if (inputData.get(element).cachedResponse === userText) {
        console.log("[AutoTab] Using cached AI suggestion.");
        showGhostOverlay(element, inputData.get(element).suggestion);
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
                    inputData.get(element).suggestion = response.suggestion;
                    inputData.get(element).cachedResponse = userText;
                    showGhostOverlay(element, response.suggestion);
                } else {
                    console.warn("[AutoTab] No suggestion received.");
                    inputData.get(element).suggestion = "";
                    removeGhostOverlay(element);
                }
            }
        );
    } catch (error) {
        console.error("[AutoTab] Failed to send message:", error);
    }
}

/** Accepts the AI suggestion when the user presses "Tab" */
function acceptSuggestion(element) {
    const {suggestion, userText} = inputData.get(element);
    if (!suggestion) return;

    console.log("[AutoTab] Tab pressed, accepting suggestion:", suggestion);
    inputData.get(element).originalText = userText;
    element.value = userText + suggestion;
    removeGhostOverlay(element);
}

/** Reverts text to original when the user presses "Ctrl+Z" */
function undoSuggestion(element) {
    const {originalText} = inputData.get(element);
    if (!originalText) return;

    console.log("[AutoTab] Ctrl+Z pressed, reverting to:", originalText);
    element.value = originalText;
    inputData.get(element).originalText = "";
    removeGhostOverlay(element);
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
 * Positions a floating overlay on top of the element to display ghost text.
 */
function showGhostOverlay(element, suggestion) {
    removeGhostOverlay(element);

    const data = inputData.get(element);
    const userText = data.userText || "";

    const overlay = document.createElement("div");
    overlay.className = GHOST_CLASS;

    // Apply text styles from the input field
    const style = window.getComputedStyle(element);
    overlay.style.position = "absolute";
    overlay.style.zIndex = "9999";
    overlay.style.opacity = "0.3";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.pointerEvents = "none";
    overlay.style.overflow = "hidden";
    overlay.style.backgroundColor = "transparent";

    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.boxSizing = style.boxSizing;
    overlay.style.padding = style.padding;
    overlay.style.margin = style.margin;
    overlay.style.border = style.border;
    overlay.style.borderRadius = style.borderRadius;
    overlay.style.color = style.color;
    overlay.textContent = userText + suggestion;

    updateGhostOverlayPosition(element, overlay);

    element.parentNode.appendChild(overlay);

    // Store a unique ID to tie this overlay to the element
    element.dataset.overlayId = Math.random().toString(36).slice(2);
    overlay.dataset.refId = element.dataset.overlayId;
}

/** Updates overlay position on element resize/scroll */
function updateGhostOverlayPosition(element, overlay = null) {
    if (!overlay) {
        const overlayId = element.dataset.overlayId;
        if (!overlayId) return;
        overlay = document.querySelector(`.${GHOST_CLASS}[data-ref-id="${overlayId}"]`);
    }

    const rect = element.getBoundingClientRect();
    const parentRect = element.offsetParent ? element.offsetParent.getBoundingClientRect() : {top: 0, left: 0};

    overlay.style.top = `${rect.top - parentRect.top + element.scrollTop}px`;
    overlay.style.left = `${rect.left - parentRect.left + element.scrollLeft}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
}

/**
 * Removes any existing overlay associated with the given element.
 */
function removeGhostOverlay(element) {
    const overlayId = element.dataset.overlayId || "";
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