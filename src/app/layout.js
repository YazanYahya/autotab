import "./globals.css";

export const metadata = {
    title: "AutoTab Chrome Extension",
    description: "AI Autocomplete powered by Gemini 2.0 Flash",
};

export default function RootLayout({children}) {
    return (
        <html lang="en">
        <body>
        {children}
        </body>
        </html>
    );
}