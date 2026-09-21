/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
          hover: "var(--card-hover)",
          border: "var(--card-border)",
        },
        pill: {
          DEFAULT: "var(--pill)",
          border: "var(--pill-border)",
        },
        junction: {
          dark: "#090A0F",
          card: "#12141F",
          cardHover: "#1A1D2D",
          border: "#23273D",
          accent: "#6366F1",
          accentHover: "#4F46E5",
          cyan: "#06B6D4",
          emerald: "#10B981",
          rose: "#F43F5E",
          amber: "#F59E0B",
          purple: "#8B5CF6",
        }
      },
      animation: {
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "wave-bar": "wave-bar 1.2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "floatUp": "floatUp 3s ease-out forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 15px rgba(99, 102, 241, 0.2), inset 0 0 10px rgba(99, 102, 241, 0.1)",
          },
          "50%": {
            opacity: "0.8",
            boxShadow: "0 0 8px rgba(99, 102, 241, 0.1)",
          },
        },
        "wave-bar": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "floatUp": {
          "0%": { transform: "translate(-50%, 10px)", opacity: "0" },
          "15%": { transform: "translate(-50%, -10px)", opacity: "1" },
          "100%": { transform: "translate(-50%, -150px)", opacity: "0" },
        }
      }
    },
  },
  plugins: [],
};
