/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",               // ← add this
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeInUp: {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: 0.5 },
          "40%": { transform: "scale(1)", opacity: 1 },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        fadeIn: "fadeIn 220ms ease-out",
        fadeInUp: "fadeInUp 220ms ease-out",
        bounceDot: "bounceDot 1.2s infinite ease-in-out",
        shimmer: "shimmer 1.2s linear infinite",
      },
    },
  },
  plugins: [],
};

