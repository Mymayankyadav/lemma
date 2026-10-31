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
