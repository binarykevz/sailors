import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ["var(--font-cinzel)", "serif"],
        fell: ["var(--font-fell)", "Georgia", "serif"],
        uncial: ["var(--font-uncial)", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
