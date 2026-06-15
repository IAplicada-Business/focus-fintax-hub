import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Barlow', 'sans-serif'],
        display: ['"Barlow Condensed"', 'sans-serif'],
        'mono-dm': ['"DM Mono"', 'monospace'],
      },
      colors: {
        navy: '#0a1564',
        'dash-red': '#c8001e',
        'dash-green': '#0f7b4e',
        'dash-amber': '#b45309',
        ink: {
          DEFAULT: '#0f1117',
          60: 'rgba(15,17,23,0.60)',
          35: 'rgba(15,17,23,0.35)',
          12: 'rgba(15,17,23,0.12)',
          '06': 'rgba(15,17,23,0.05)',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "body-text": "hsl(var(--body-text))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          border: "hsl(var(--card-border))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        pill: "9999px",
      },
      fontSize: {
        "fluid-sm":   ["clamp(14px, 0.78vw + 11px, 15px)", { lineHeight: "1.45", letterSpacing: "0" }],
        "fluid-base": ["clamp(16px, 0.94vw + 12px, 18px)", { lineHeight: "1.55", letterSpacing: "-0.005em" }],
        "fluid-lg":   ["clamp(18px, 1.04vw + 14px, 20px)", { lineHeight: "1.4",  letterSpacing: "-0.01em",  fontWeight: "600" }],
        "fluid-xl":   ["clamp(20px, 1.77vw + 14px, 34px)", { lineHeight: "1.1",  letterSpacing: "-0.022em", fontWeight: "500" }],
        "fluid-2xl":  ["clamp(28px, 2.86vw + 18px, 48px)", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "700" }],
        "fluid-3xl":  ["clamp(36px, 6.25vw + 8px, 96px)",  { lineHeight: "1",    letterSpacing: "-0.028em", fontWeight: "700" }],
        "label-eyebrow": ["11px", { lineHeight: "1", letterSpacing: "0.14em", fontWeight: "700" }],
      },
      spacing: {
        "section-xs": "clamp(18px, 1.6vw, 24px)",
        "section-sm": "clamp(24px, 2vw, 32px)",
        "section-md": "clamp(40px, 4vw, 60px)",
        "section-lg": "clamp(60px, 7.8vw, 120px)",
      },
      boxShadow: {
        soft: "0 0 0 1px rgba(10,21,100,0.04), 0 1px 2px rgba(10,21,100,0.04), 0 8px 24px -12px rgba(10,21,100,0.10)",
        "soft-hover": "0 0 0 1px rgba(10,21,100,0.06), 0 4px 12px rgba(10,21,100,0.08), 0 18px 40px -16px rgba(10,21,100,0.14)",
        "soft-inset": "inset 0 0 0 1px hsl(var(--card-border))",
        ring: "0 0 0 3px rgba(200,0,30,0.18)",
      },
      transitionTimingFunction: {
        "out-modern": "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-quart":  "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "150": "150ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
