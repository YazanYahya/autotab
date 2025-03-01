/**
 * AutoTab - Chrome Extension for AI-powered text suggestions
 * 
 * This content script provides real-time text suggestions in input fields and textareas.
 * Features:
 * - Real-time AI suggestions as you type
 * - Tab to accept suggestions
 * - Ctrl+Z to undo accepted suggestions
 * - Automatic positioning and scrolling
 * - Performance optimized with WeakMap and debouncing
 */

/** Configuration Constants */
const GHOST_CLASS = "autotab-ghost-overlay";
const DEBOUNCE_DELAY = 1500;  // Delay before requesting AI suggestions (ms)
const MIN_TEXT_LENGTH = 10;    // Minimum text length to trigger suggestions

/**
 * Manages overlay elements that display text suggestions
 * Uses WeakMap for automatic garbage collection of unused overlays
 */
class GhostOverlayManager {
    constructor() {
        this.overlays = new WeakMap();
    }

    /**
     * Creates or updates an overlay for displaying text suggestions
     */
    createOrUpdate(element, suggestion) {
        let overlay = this.overlays.get(element);

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = GHOST_CLASS;
            document.body.appendChild(overlay);
            this.overlays.set(element, overlay);
            this.setupOverlayStyles(overlay, element);
        }

        this.updatePosition(element);
        this.updateContent(element, suggestion);
    }

    setupOverlayStyles(overlay, element) {
        const styles = window.getComputedStyle(element);
        Object.assign(overlay.style, {
            font: styles.font,
            lineHeight: styles.lineHeight,
            padding: styles.padding,
            border: styles.border,
            position: 'absolute',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            zIndex: '1000',
            boxSizing: 'border-box',
            wordBreak: 'break-word',
            direction: styles.direction,
            textAlign: styles.textAlign,
            borderRadius: styles.borderRadius,
            textTransform: styles.textTransform,
            letterSpacing: styles.letterSpacing,
            wordSpacing: styles.wordSpacing,
            backgroundColor: 'transparent'
        });

        // Create spans for content if they don't exist
        if (!overlay.querySelector('.content-text')) {
            const contentSpan = document.createElement('span');
            contentSpan.className = 'content-text';
            contentSpan.style.color = 'transparent'; // Make text invisible but preserve space
            overlay.appendChild(contentSpan);
        }
        
        if (!overlay.querySelector('.ghost-text')) {
            const ghostSpan = document.createElement('span');
            ghostSpan.className = 'ghost-text';
            ghostSpan.style.color = 'rgb(169, 169, 169)';
            overlay.appendChild(ghostSpan);
        }
    }

    updatePosition(element) {
        const overlay = this.overlays.get(element);
        if (!overlay) return;

        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // Position overlay exactly over the input element
        Object.assign(overlay.style, {
            top: `${rect.top + scrollTop}px`,
            left: `${rect.left + scrollLeft}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });

        this.syncScroll(element, overlay);
    }

    updateContent(element, suggestion) {
        const overlay = this.overlays.get(element);
        if (!overlay) return;

        const cursorPosition = element.selectionEnd;
        const beforeCursor = element.value.substring(0, cursorPosition);

        const contentSpan = overlay.querySelector('.content-text');
        const ghostSpan = overlay.querySelector('.ghost-text');
        
        contentSpan.textContent = beforeCursor;
        ghostSpan.textContent = suggestion;
    }

    /**
     * Synchronizes the overlay's scroll position with its input element
     */
    syncScroll(element, overlay) {
        overlay.scrollTop = element.scrollTop;
        overlay.scrollLeft = element.scrollLeft;
    }

    /**
     * Removes the overlay associated with an input element
     */
    remove(element) {
        const overlay = this.overlays.get(element);
        if (overlay) {
            overlay.remove();
            this.overlays.delete(element);
        }
    }
}

/**
 * Manages input element states and debounce timers
 * Uses WeakMap for automatic cleanup of state data
 */
class InputStateManager {
    constructor() {
        this.states = new WeakMap();
        this.debounceTimers = new WeakMap();
    }

    /**
     * Gets or creates a state object for an input element
     */
    getState(element) {
        if (!this.states.has(element)) {
            this.states.set(element, {
                userText: element.value || "",
                suggestion: "",
                originalText: "",
                cachedResponse: null
            });
        }
        return this.states.get(element);
    }

    setDebounceTimer(element, timer) {
        this.debounceTimers.set(element, timer);
    }

    clearDebounceTimer(element) {
        clearTimeout(this.debounceTimers.get(element));
    }
}

// Initialize singleton managers
const ghostOverlayManager = new GhostOverlayManager();
const inputStateManager = new InputStateManager();

/**
 * Main AutoTab functionality
 * Handles input detection, event management, and AI suggestions
 */
class AutoTab {
    static init() {
        console.log("[AutoTab] Initializing extension...");
        this.attachToExistingElements();
        this.observeDynamicElements();
    }

    static attachToExistingElements() {
        document.querySelectorAll("textarea, input[type='text']")
            .forEach(element => this.attach(element));
    }

    static observeDynamicElements() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (this.isValidInputElement(node)) {
                        this.attach(node);
                    }
                });
            });
        });

        observer.observe(document.body, {childList: true, subtree: true});
    }

    static isValidInputElement(node) {
        return node.nodeType === 1 &&
            (node.tagName === "TEXTAREA" ||
                (node.tagName === "INPUT" && node.type === "text"));
    }

    static attach(element) {
        if (inputStateManager.states.has(element)) return;

        console.log("[AutoTab] Attaching to:", element);
        inputStateManager.getState(element);
        this.attachEventListeners(element);
    }

    static attachEventListeners(element) {
        element.addEventListener("input", (event) => this.handleInput(event, element));
        element.addEventListener("keydown", (event) => this.handleKeydown(event, element));
        element.addEventListener("scroll", () => this.handleScroll(element));
        element.addEventListener("blur", () => this.handleBlur(element));
        element.addEventListener("focus", () => this.handleFocus(element));

        new ResizeObserver(() => ghostOverlayManager.updatePosition(element))
            .observe(element);
    }

    /**
     * Handles user input events and manages suggestion display
     */
    static handleInput(event, element) {
        const userText = element.value.trim();
        const state = inputStateManager.getState(element);
        const newInput = event.data;
        console.log("[AutoTab] User input:", newInput);
        if (newInput === null || newInput === undefined) return;

        state.userText = userText;

        if (!this.isValidInput(userText)) {
            ghostOverlayManager.remove(element);
            state.suggestion = "";
            return;
        }

        inputStateManager.clearDebounceTimer(element);

        // Case 1: Check if typed/pasted text matches beginning of suggestion
        if (state.suggestion && newInput) {
            console.log("[AutoTab] Checking if input matches suggestion:", {
                newInput,
                suggestion: state.suggestion
            });

            if (state.suggestion.startsWith(newInput)) {
                const remainingSuggestion = state.suggestion.substring(newInput.length);
                console.log("[AutoTab] Input matches! Updating suggestion:", {
                    from: state.suggestion,
                    to: remainingSuggestion,
                    matched: newInput
                });
                state.suggestion = remainingSuggestion;
                ghostOverlayManager.createOrUpdate(element, remainingSuggestion);
                return;
            }
        }

        // Case 2: Handle spaces after suggestion
        if (state.suggestion && newInput === " ") {
            console.log("[AutoTab] Space detected, adjusting overlay position");
            const contentSpan = ghostOverlayManager.overlays.get(element)?.querySelector('.content-text');
            if (contentSpan) {
                contentSpan.textContent = element.value;
            }
            ghostOverlayManager.updatePosition(element);
            return;
        }

        // Hide suggestion if input doesn't match
        if (state.suggestion && newInput) {
            console.log("[AutoTab] Input doesn't match suggestion, hiding overlay");
            ghostOverlayManager.remove(element);
            state.suggestion = "";
        }

        // If none of the above cases, request new suggestion
        console.log("[AutoTab] Setting debounce timer for suggestion request.");
        inputStateManager.setDebounceTimer(element, setTimeout(() => {
            this.requestSuggestion(element, userText);
        }, DEBOUNCE_DELAY));
    }

    /**
     * Handles keyboard shortcuts (Tab to accept, Ctrl+Z to undo)
     */
    static handleKeydown(event, element) {
        const state = inputStateManager.getState(element);

        if (event.key === "Tab" && state.suggestion) {
            event.preventDefault();
            this.acceptSuggestion(element);
        } else if (event.ctrlKey && (event.key === "z" || event.key === "Z")) {
            event.preventDefault();
            this.undoSuggestion(element);
        }
    }

    static handleScroll(element) {
        ghostOverlayManager.updatePosition(element);
    }

    static handleBlur(element) {
        ghostOverlayManager.remove(element);
    }

    static handleFocus(element) {
        const state = inputStateManager.getState(element);
        if (state.suggestion) {
            ghostOverlayManager.createOrUpdate(element, state.suggestion);
        }
    }

    static isValidInput(text) {
        return text.length >= MIN_TEXT_LENGTH;
    }

    /**
     * Requests an AI suggestion for the current input text
     */
    static async requestSuggestion(element, userText) {
        const state = inputStateManager.getState(element);

        if (!userText) {
            ghostOverlayManager.remove(element);
            state.suggestion = "";
            return;
        }

        if (state.cachedResponse === userText) {
            console.log("[AutoTab] Using cached suggestion");
            ghostOverlayManager.createOrUpdate(element, state.suggestion);
            return;
        }

        try {
            const suggestion = await this.getAISuggestion(userText, element);
            
            if (suggestion) {
                state.suggestion = suggestion;
                state.cachedResponse = userText;
                ghostOverlayManager.createOrUpdate(element, suggestion);
            } else {
                ghostOverlayManager.remove(element);
                state.suggestion = "";
            }
        } catch (error) {
            console.error("[AutoTab] Suggestion error:", error);
            ghostOverlayManager.remove(element);
            state.suggestion = "";
        }
    }

    static acceptSuggestion(element) {
        const state = inputStateManager.getState(element);
        if (!state.suggestion) return;

        state.originalText = element.value;
        element.value = state.originalText + state.suggestion;
        state.suggestion = "";
        ghostOverlayManager.remove(element);
        element.dispatchEvent(new Event('input', {bubbles: true}));
    }

    static undoSuggestion(element) {
        const state = inputStateManager.getState(element);
        if (!state.originalText) return;

        element.value = state.originalText;
        state.originalText = "";
        state.suggestion = "";
        ghostOverlayManager.remove(element);
        element.dispatchEvent(new Event('input', {bubbles: true}));
    }

    /**
     * Gets contextual information about an input element
     */
    static getElementContext(element) {
        try {
            // Get labels associated with the element
            let labels = [];
            if (element.id) {
                const labelElement = document.querySelector(`label[for="${element.id}"]`);
                if (labelElement) {
                    labels.push(labelElement.textContent.trim());
                }
            }
            
            // Get placeholder
            if (element.placeholder) {
                labels.push(element.placeholder);
            }

            return {
                url: window.location.href,
                title: document.title,
                path: window.location.pathname,
                labels: labels.join(' ')
            };
        } catch (error) {
            console.error("[AutoTab] Error getting context:", error);
            return {
                url: window.location.href,
                title: document.title,
                path: window.location.pathname,
                labels: ''
            };
        }
    }

    static async getAISuggestion(text, element) {
        try {
            const context = this.getElementContext(element);
            const response = await chrome.runtime.sendMessage({
                action: "generate_suggestion", 
                text,
                context
            });
            console.log("[AutoTab] AI suggestion response:", response);
            if (response && response.suggestion) {
                return response.suggestion;
            } else {
                throw new Error("Invalid response format");
            }
        } catch (error) {
            console.error("[AutoTab] Error fetching AI suggestion:", error);
            return "";
        }
    }
}

/** Add required CSS styles */
const style = document.createElement('style');
style.textContent = `
    .${GHOST_CLASS} {
        position: absolute;
        pointer-events: none;
        background: transparent;
        z-index: 1000;
        user-select: none;
        display: inline-block;
    }
    .${GHOST_CLASS} .content-text {
        position: relative;
        display: inline;
        color: transparent;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    .${GHOST_CLASS} .ghost-text {
        position: relative;
        display: inline;
        white-space: pre-wrap;
        word-wrap: break-word;
        opacity: 0.6;
    }
`;
document.head.appendChild(style);

// Initialize AutoTab
AutoTab.init();
