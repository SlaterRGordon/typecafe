import { type Config } from "tailwindcss";
const { fontFamily } = require('tailwindcss/defaultTheme')

export default {
  mode: 'jit',
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      mono: ['Roboto Mono', ...fontFamily.mono],
    },
    extend: {
      colors: {
        'retro': `hsl(var(--retro))`,
        'valentine': `hsl(var(--valentine))`,
        'cyberpunk': `hsl(var(--cyberpunk))`,
        'dracula': `hsl(var(--dracula))`,
        'aqua': `hsl(var(--aqua))`,
        'pastel': `hsl(var(--pastel))`,
      },
    },
  },
  plugins: [
    require("daisyui"),
    require("@tailwindcss/typography"),
  ],
  daisyui: {
    themes: ["light", "dark", "cyberpunk", "valentine", "acid",
      {
        dark: {
          ...require('daisyui/src/colors/themes')['[data-theme=dark]'],
          "--retro": "45 47% 64%",
          "--valentine": "318.46 46.429% 80.118%",
          "--cyberpunk": "56 100% 45%",
          "--dracula": "231.43 14.894% 30.588%",
          "--aqua": "218.61 52.511% 38.647%",
          "--pastel": "216 12.195% 83.922%",
        }
      }
    ],
  },
} satisfies Config;
