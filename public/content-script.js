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
            paddingTop: styles.paddingTop,
            paddingRight: styles.paddingRight,
            paddingBottom: styles.paddingBottom,
            paddingLeft: styles.paddingLeft,
            border: 'none',
            position: 'absolute',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            color: 'rgb(169, 169, 169)',
            backgroundColor: 'red',
            zIndex: '1000',
            boxSizing: 'border-box',
            wordBreak: 'break-word',
            direction: styles.direction,
            textAlign: styles.textAlign
        });
    }

    updatePosition(element) {

        console.log("[GhostOverlayManager] Updating position for:", element);
        const overlay = this.overlays.get(element);
        if (!overlay) return;

        // Get the position of the cursor
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // Position overlay after cursor
        Object.assign(overlay.style, {
            top: `${rect.top + scrollTop}px`,
            left: `${rect.left + scrollLeft}px`,
            height: `${rect.height}px`,
            width: 'auto'
        });
    }

    updateContent(element, suggestion) {
        const overlay = this.overlays.get(element);
        if (!overlay) return;

        overlay.textContent = suggestion;
        this.syncScroll(element, overlay);
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
        opacity: 0.6;
        user-select: none;
    }
`;
document.head.appendChild(style);

// Initialize
AutoTab.init();
