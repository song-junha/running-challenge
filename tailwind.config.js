/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        pastel: {
          "color-scheme": "light",
          "base-100": "oklch(98% 0.001 106.423)",
          "base-200": "oklch(97% 0.001 106.424)",
          "base-300": "oklch(92% 0.003 48.717)",
          "base-content": "oklch(21% 0.006 56.043)",
          "primary": "oklch(82% 0.189 84.429)",
          "primary-content": "oklch(27% 0.077 45.635)",
          "secondary": "oklch(71% 0.202 349.761)",
          "secondary-content": "oklch(28% 0.109 3.907)",
          "accent": "oklch(70% 0.01 56.259)",
          "accent-content": "oklch(14% 0.004 49.25)",
          "neutral": "oklch(37% 0.01 67.558)",
          "neutral-content": "oklch(98% 0.001 106.423)",
          "info": "oklch(70% 0.165 254.624)",
          "info-content": "oklch(28% 0.091 267.935)",
          "success": "oklch(77% 0.152 181.912)",
          "success-content": "oklch(27% 0.046 192.524)",
          "warning": "oklch(82% 0.189 84.429)",
          "warning-content": "oklch(27% 0.077 45.635)",
          "error": "oklch(71% 0.194 13.428)",
          "error-content": "oklch(27% 0.105 12.094)",
          "--rounded-box": "0.5rem",
          "--rounded-btn": "1rem",
          "--rounded-badge": "1.9rem",
          "--animation-btn": "0.25s",
          "--animation-input": "0.2s",
          "--btn-focus-scale": "0.95",
          "--border-btn": "1px",
          "--tab-border": "1px",
          "--tab-radius": "0.5rem",
        },
      },
    ],
  },
}
