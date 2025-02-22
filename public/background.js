console.log("[AutoTab Gemini] Background service worker initialized.");

const GEMINI_API_KEY = "<<GEMINI_API_KEY>>";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const ASSISTANT_PROMPT = `
You are an AI-powered inline typing assistant embedded in a real-time text editor.
Your role is to autocomplete and suggest fluent, contextually relevant continuations of the user’s text.
You must act as if you are naturally predicting the next words a human would type.

STRICT INSTRUCTIONS:
1. Continue the user's text in a way that is natural, concise, and coherent.
2. Do NOT include explanations, greetings, or disclaimers.
3. Do NOT generate standalone responses—only append to the given text.
4. Do NOT introduce new topics unrelated to the given input.
5. Do NOT modify or remove the last word of the user's input. Always start from that word.
6. If the input is cut off mid-word, complete it seamlessly without adding extra spaces or duplicating letters.
7. If the last word in the user's input is **fully typed**, prepend exactly one space before starting a new word.
8. If the last word in the user's input is **incomplete**, do NOT add a space—just complete the word naturally.
9. If your next word starts with a space but is identical to the user’s last word, remove the space to avoid duplication.
10. Preserve proper sentence structure and natural spacing, ensuring a smooth transition between words.

Your purpose is to enhance the user’s writing experience by making their typing faster and more efficient.
`;

/**
 * Makes a POST request to the Gemini 1.5 Pro endpoint with an assistant + user prompt.
 */
async function getGeminiResponse(assistantPrompt, userPrompt) {
    try {
        // Construct the request body based on your snippet
        const requestBody = {
            contents: [
                {
                    role: "assistant",
                    parts: [{text: assistantPrompt}],
                },
                {
                    role: "user",
                    parts: [{text: userPrompt}],
                },
            ],
        };

        console.log("[AutoTab Gemini] Sending request to Gemini API...", requestBody);

        // Make the fetch call
        const response = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        // Check HTTP status
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Parse JSON response
        const data = await response.json();
        let completion =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "No response from Gemini";
        console.log("[AutoTab Gemini] Raw AI completion:", completion);

        completion = cleanCompletion(userPrompt, completion);

        console.log("[AutoTab Gemini] Final AI completion:", completion);
        return completion;
    } catch (error) {
        console.error("[AutoTab Gemini] Error fetching Gemini response:", error);
        return "Error fetching response " + error;
    }
}

function cleanCompletion(userText, completion) {
    if (!completion) return "";

    // Remove all newlines
    completion = completion.replace(/\n/g, "").trim();

    return completion;
}

/**
 * Listen for messages from content scripts: { action: "generate_suggestion", text: "<userText>" }
 */
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "generate_suggestion") {
        const userText = req.text || "";
        console.log("[AutoTab Gemini] generate_suggestion request:", userText);

        // Call the Gemini API asynchronously
        getGeminiResponse(ASSISTANT_PROMPT, userText)
            .then((aiCompletion) => {
                // Send completion back to content script
                sendResponse({suggestion: aiCompletion});
            })
            .catch((err) => {
                console.error("[AutoTab Gemini] Gemini API call error:", err);
                sendResponse({suggestion: ""});
            });

        // Must return true to indicate we will call sendResponse asynchronously
        return true;
    }
});
