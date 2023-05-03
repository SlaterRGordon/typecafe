import { type Config } from "tailwindcss";

// this function handles the opacity of color
function withOpacityValue(variable: string) {
  return ({ opacityValue }: any) => {
    if (opacityValue === undefined) {
      return `hsl(var(${variable}))`
    }
    return `hsl(var(${variable}) / ${opacityValue})`
  }
}

export default {
  mode: 'jit',
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'retro': withOpacityValue('--retro'),
        'valentine': withOpacityValue('--valentine'),
        'cyberpunk': withOpacityValue('--cyberpunk'),
      },
    },
  },
  plugins: [
    require("daisyui"),
    require("@tailwindcss/typography"),
  ],
  daisyui: {
    themes: ["light", "dark", "cyberpunk", "valentine", "acid",
      {dark: {
        ...require('daisyui/src/colors/themes')['[data-theme=dark]'],
        "--retro": "45 47% 64%",
        "--valentine": "318.46 46.429% 80.118%",
        "--cyberpunk": "56 100% 45%",
        "--rounded-btn": "1.9rem",
      }}
    ],
  },
} satisfies Config;
