/** Constants */
const GHOST_CLASS = "autotab-ghost-overlay";
const DEBOUNCE_DELAY = 1500;
const MIN_TEXT_LENGTH = 10;

/**
 * Enhanced Ghost Overlay Manager with performance optimizations
 */
class GhostOverlayManager {
    constructor() {
        this.overlays = new WeakMap();
    }

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

    syncScroll(element, overlay) {
        overlay.scrollTop = element.scrollTop;
        overlay.scrollLeft = element.scrollLeft;
    }

    remove(element) {
        const overlay = this.overlays.get(element);
        if (overlay) {
            overlay.remove();
            this.overlays.delete(element);
        }
    }
}

/**
 * State management using a WeakMap for automatic garbage collection
 */
class InputStateManager {
    constructor() {
        this.states = new WeakMap();
        this.debounceTimers = new WeakMap();
    }

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

// Create singleton instances
const ghostOverlayManager = new GhostOverlayManager();
const inputStateManager = new InputStateManager();

/**
 * Main AutoTab functionality
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
        // element.addEventListener("blur", () => this.handleBlur(element));
        // element.addEventListener("focus", () => this.handleFocus(element));

        new ResizeObserver(() => ghostOverlayManager.updatePosition(element))
            .observe(element);
    }

    static handleInput(event, element) {
        const userText = element.value.trim();
        const state = inputStateManager.getState(element);
        const lastChar = event.data;

        if (event.inputType === "insertText" && lastChar === "\t") {
            console.log("[AutoTab] Tab character detected, ignoring input.");
            return;
        }

        state.userText = userText;

        if (!this.isValidInput(userText)) {
            ghostOverlayManager.remove(element);
            state.suggestion = "";
            return;
        }

        inputStateManager.clearDebounceTimer(element);

        if (state.suggestion && userText.endsWith(state.suggestion)) {
            console.log("[AutoTab] User text ends with suggestion, adjusting remaining suggestion.");
            const remainingSuggestion = state.suggestion.substring(userText.length - state.originalText.length);
            state.suggestion = remainingSuggestion;
            ghostOverlayManager.createOrUpdate(element, remainingSuggestion);
        } else if (state.suggestion && (lastChar === " " || lastChar === "\n")) {
            console.log("[AutoTab] Space or newline detected, queuing overlay update.");
            ghostOverlayManager.updatePosition(element);
        } else {
            console.log("[AutoTab] Setting debounce timer for suggestion request.");
            inputStateManager.setDebounceTimer(element, setTimeout(() => {
                this.requestSuggestion(element, userText);
            }, DEBOUNCE_DELAY));
        }
    }

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

    static async requestSuggestion(element, userText) {
        const state = inputStateManager.getState(element);

        if (!userText) {
            ghostOverlayManager.remove(element);
            state.suggestion = "";
            return;
        }

        if (state.cachedResponse === userText) {
            console.log("[AutoTab] Using cached suggestion");
            return;
        }

        try {
            const suggestion = await this.getAISuggestion(userText);

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

    static async getAISuggestion(text) {
        try {
            const response = await chrome.runtime.sendMessage({action: "generate_suggestion", text});
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

// Add required CSS
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
        color: transparent; /* Make the text invisible but preserve its space */
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

// Initialize
AutoTab.init();
