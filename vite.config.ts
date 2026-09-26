import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    base: "/codexJapaneseLearnWebApp/",

    plugins: [react(), tailwindcss()],

    server: {
        watch: {
            ignored: ["**/.visual-qa-profile*/**", "**/.visual-qa-cdp-profile*/**", "**/.chrome-profile*/**", "**/.playwright*/**"],
        },
    },
});
