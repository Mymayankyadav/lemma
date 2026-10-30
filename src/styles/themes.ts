/* UI-5a: all eight retained Lemma Lab worlds; token values from lemma-lab.html. */
export interface Theme {
 id: string; name: string; mode: 'dark'|'light';
 t: Record<'bg'|'card'|'card2'|'line'|'ink'|'ink2'|'ink3'|'accent'|'on'|'warn'|'bad'|'good'|'track'|'tab',string>;
 radius: number; border: string; shadow: string; blur: string;
 fonts: {ui:string; display:string; num:string}; background: string;
 c: {bg:string;surface:string;accent:string;ink:string;ink3:string};
}
export const themes = [
  {
    "id": "obsidian",
    "name": "Obsidian lamp",
    "mode": "dark",
    "t": {
      "bg": "#0D0C11",
      "card": "rgba(27,26,34,.72)",
      "card2": "rgba(255,255,255,.04)",
      "line": "rgba(255,255,255,.08)",
      "ink": "#F4F0E6",
      "ink2": "#B3AEBB",
      "ink3": "#8C8796",
      "accent": "#F7B538",
      "on": "#1E1405",
      "warn": "#F39A4B",
      "bad": "#F2545B",
      "good": "#4FC88E",
      "track": "rgba(255,255,255,.10)",
      "tab": "rgba(22,21,28,.82)"
    },
    "radius": 18,
    "border": "1px solid rgba(255,255,255,.08)",
    "shadow": "0 18px 40px -24px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.05)",
    "blur": "blur(16px) saturate(140%)",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "num": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    },
    "background": "none",
    "c": {
      "bg": "#0D0C11",
      "surface": "rgba(27,26,34,.72)",
      "accent": "#F7B538",
      "ink": "#F4F0E6",
      "ink3": "#8C8796"
    }
  },
  {
    "id": "graph",
    "name": "Graph paper",
    "mode": "light",
    "t": {
      "bg": "#FAFAF6",
      "card": "#FFFFFF",
      "card2": "rgba(27,42,65,.04)",
      "line": "rgba(27,42,65,.16)",
      "ink": "#1B2A41",
      "ink2": "#44536B",
      "ink3": "#5F6C80",
      "accent": "#C8372D",
      "on": "#FFFFFF",
      "warn": "#B85C00",
      "bad": "#B3261E",
      "good": "#1E7A4C",
      "track": "rgba(27,42,65,.10)",
      "tab": "#FFFFFF"
    },
    "radius": 6,
    "border": "1.5px solid #1B2A41",
    "shadow": "3px 3px 0 #1B2A41",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'Newsreader', Georgia, serif",
      "num": "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    },
    "background": "linear-gradient(rgba(40,90,170,.16) 1px,transparent 1px) 0 0/60px 60px,linear-gradient(90deg,rgba(40,90,170,.16) 1px,transparent 1px) 0 0/60px 60px,linear-gradient(rgba(40,90,170,.07) 1px,transparent 1px) 0 0/12px 12px,linear-gradient(90deg,rgba(40,90,170,.07) 1px,transparent 1px) 0 0/12px 12px",
    "c": {
      "bg": "#FAFAF6",
      "surface": "#FFFFFF",
      "accent": "#C8372D",
      "ink": "#1B2A41",
      "ink3": "#5F6C80"
    }
  },
  {
    "id": "euclid",
    "name": "Euclid",
    "mode": "light",
    "t": {
      "bg": "#F1E7D3",
      "card": "#FAF4E6",
      "card2": "rgba(58,46,34,.05)",
      "line": "rgba(58,46,34,.18)",
      "ink": "#33291E",
      "ink2": "#5A4B39",
      "ink3": "#6E5D47",
      "accent": "#8C2F1E",
      "on": "#FFF8EE",
      "warn": "#A8590E",
      "bad": "#9E2A2A",
      "good": "#3E6B2F",
      "track": "rgba(58,46,34,.12)",
      "tab": "#FAF4E6"
    },
    "radius": 6,
    "border": "1px solid rgba(58,46,34,.28)",
    "shadow": "0 1px 0 rgba(58,46,34,.08)",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'EB Garamond', Garamond, 'Times New Roman', serif",
      "num": "'EB Garamond', Garamond, 'Times New Roman', serif"
    },
    "background": "none",
    "c": {
      "bg": "#F1E7D3",
      "surface": "#FAF4E6",
      "accent": "#8C2F1E",
      "ink": "#33291E",
      "ink3": "#6E5D47"
    }
  },
  {
    "id": "euclid-night",
    "name": "Euclid at night",
    "mode": "dark",
    "t": {
      "bg": "#17130E",
      "card": "#211B14",
      "card2": "rgba(237,227,207,.045)",
      "line": "rgba(237,227,207,.14)",
      "ink": "#EDE3CF",
      "ink2": "#CBBDA2",
      "ink3": "#A69780",
      "accent": "#E8705F",
      "on": "#1A0F0B",
      "warn": "#E9A55B",
      "bad": "#F07A7A",
      "good": "#9CC48A",
      "track": "rgba(237,227,207,.10)",
      "tab": "#1E1812"
    },
    "radius": 6,
    "border": "1px solid rgba(237,227,207,.22)",
    "shadow": "0 1px 0 rgba(0,0,0,.4)",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'EB Garamond', Garamond, 'Times New Roman', serif",
      "num": "'EB Garamond', Garamond, 'Times New Roman', serif"
    },
    "background": "none",
    "c": {
      "bg": "#17130E",
      "surface": "#211B14",
      "accent": "#E8705F",
      "ink": "#EDE3CF",
      "ink3": "#A69780"
    }
  },
  {
    "id": "scriptorium",
    "name": "Scriptorium",
    "mode": "dark",
    "t": {
      "bg": "#14110D",
      "card": "#1C1813",
      "card2": "rgba(207,174,91,.05)",
      "line": "rgba(207,174,91,.18)",
      "ink": "#EFE6D2",
      "ink2": "#CDBFA4",
      "ink3": "#A89A80",
      "accent": "#CFAE5B",
      "on": "#1A1408",
      "warn": "#E5975A",
      "bad": "#EA7A6E",
      "good": "#A8C68A",
      "track": "rgba(239,230,210,.10)",
      "tab": "#1A1612"
    },
    "radius": 2,
    "border": "1px solid rgba(207,174,91,.45)",
    "shadow": "inset 0 0 0 3px #1C1813, inset 0 0 0 4px rgba(207,174,91,.26)",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'EB Garamond', Garamond, 'Times New Roman', serif",
      "num": "'EB Garamond', Garamond, 'Times New Roman', serif"
    },
    "background": "none",
    "c": {
      "bg": "#14110D",
      "surface": "#1C1813",
      "accent": "#CFAE5B",
      "ink": "#EFE6D2",
      "ink3": "#A89A80"
    }
  },
  {
    "id": "astrolabe",
    "name": "Astrolabe",
    "mode": "dark",
    "t": {
      "bg": "#0B0F17",
      "card": "rgba(20,27,40,.66)",
      "card2": "rgba(200,220,255,.05)",
      "line": "rgba(184,148,86,.22)",
      "ink": "#E9E4D8",
      "ink2": "#C1BBAE",
      "ink3": "#9C978C",
      "accent": "#62C2B2",
      "on": "#06161A",
      "warn": "#E8B06A",
      "bad": "#F08080",
      "good": "#8FD49E",
      "track": "rgba(233,228,216,.10)",
      "tab": "rgba(14,19,30,.8)"
    },
    "radius": 14,
    "border": "1px solid rgba(184,148,86,.38)",
    "shadow": "0 18px 40px -26px rgba(0,0,0,.95), inset 0 1px 0 rgba(255,255,255,.05)",
    "blur": "blur(10px) saturate(130%)",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'EB Garamond', Garamond, 'Times New Roman', serif",
      "num": "'EB Garamond', Garamond, 'Times New Roman', serif"
    },
    "background": "none",
    "c": {
      "bg": "#0B0F17",
      "surface": "rgba(20,27,40,.66)",
      "accent": "#62C2B2",
      "ink": "#E9E4D8",
      "ink3": "#9C978C"
    }
  },
  {
    "id": "lamp-compass",
    "name": "Lamp and compass",
    "mode": "dark",
    "t": {
      "bg": "#0D0C11",
      "card": "rgba(27,26,34,.72)",
      "card2": "rgba(255,255,255,.04)",
      "line": "rgba(255,255,255,.08)",
      "ink": "#F4F0E6",
      "ink2": "#B3AEBB",
      "ink3": "#8C8796",
      "accent": "#F7B538",
      "on": "#1E1405",
      "warn": "#F39A4B",
      "bad": "#F2545B",
      "good": "#4FC88E",
      "track": "rgba(255,255,255,.10)",
      "tab": "rgba(22,21,28,.82)"
    },
    "radius": 14,
    "border": "1px solid rgba(255,255,255,.08)",
    "shadow": "0 18px 40px -24px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.05)",
    "blur": "blur(16px) saturate(140%)",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'EB Garamond', Garamond, 'Times New Roman', serif",
      "num": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    },
    "background": "none",
    "c": {
      "bg": "#0D0C11",
      "surface": "rgba(27,26,34,.72)",
      "accent": "#F7B538",
      "ink": "#F4F0E6",
      "ink3": "#8C8796"
    }
  },
  {
    "id": "graph-night",
    "name": "Graph paper at night",
    "mode": "dark",
    "t": {
      "bg": "#13171D",
      "card": "#1B2129",
      "card2": "rgba(200,215,235,.04)",
      "line": "rgba(200,215,235,.16)",
      "ink": "#E6ECF4",
      "ink2": "#B7C2D0",
      "ink3": "#93A0B2",
      "accent": "#FF7B6B",
      "on": "#1B0A07",
      "warn": "#F2B05E",
      "bad": "#FF8A8A",
      "good": "#86D39C",
      "track": "rgba(230,236,244,.10)",
      "tab": "#1B2129"
    },
    "radius": 6,
    "border": "1.5px solid #C9D3E0",
    "shadow": "3px 3px 0 #05070A",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'Newsreader', Georgia, serif",
      "num": "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    },
    "background": "linear-gradient(rgba(120,160,220,.15) 1px,transparent 1px) 0 0/60px 60px,linear-gradient(90deg,rgba(120,160,220,.15) 1px,transparent 1px) 0 0/60px 60px,linear-gradient(rgba(120,160,220,.06) 1px,transparent 1px) 0 0/12px 12px,linear-gradient(90deg,rgba(120,160,220,.06) 1px,transparent 1px) 0 0/12px 12px",
    "c": {
      "bg": "#13171D",
      "surface": "#1B2129",
      "accent": "#FF7B6B",
      "ink": "#E6ECF4",
      "ink3": "#93A0B2"
    }
  }
] as const satisfies readonly Theme[];
export type ThemeId = (typeof themes)[number]['id'];
export const EUCLID_WORLDS: readonly ThemeId[] = ['euclid','euclid-night'];
