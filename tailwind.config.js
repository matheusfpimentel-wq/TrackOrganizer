/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(240 4% 20%)",
        background: "hsl(240 6% 10%)",
        foreground: "hsl(0 0% 98%)",
        muted: "hsl(240 4% 16%)",
        "muted-foreground": "hsl(240 5% 65%)",
        primary: "hsl(160 84% 39%)",
        "primary-foreground": "hsl(0 0% 100%)",
        accent: "hsl(240 4% 22%)",
        dirty: "hsl(38 92% 50%)",
        suggested: "hsl(199 89% 48%)",
        danger: "hsl(0 72% 51%)",
      },
    },
  },
  plugins: [],
};
