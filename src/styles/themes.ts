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
      "bg": "#faf9f5",
      "card": "#ffffff",
      "card2": "#f0eee6",
      "line": "#e8e6dc",
      "ink": "#141413",
      "ink2": "#5e5d59",
      "ink3": "#73726c",
      "accent": "#a8476d",
      "on": "#ffffff",
      "warn": "#935f04",
      "bad": "#c54435",
      "good": "#597a3c",
      "track": "#e8e6dc",
      "tab": "#f5f4ed"
    },
    "radius": 6,
    "border": "1.5px solid #e8e6dc",
    "shadow": "3px 3px 0 #141413",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'Newsreader', Georgia, serif",
      "num": "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    },
    "background": "linear-gradient(#e8e6dc 1px,transparent 1px) 0 0/60px 60px,linear-gradient(90deg,#e8e6dc 1px,transparent 1px) 0 0/60px 60px,linear-gradient(#e8e6dc 1px,transparent 1px) 0 0/12px 12px,linear-gradient(90deg,#e8e6dc 1px,transparent 1px) 0 0/12px 12px",
    "c": {
      "bg": "#faf9f5",
      "surface": "#ffffff",
      "accent": "#a8476d",
      "ink": "#141413",
      "ink3": "#73726c"
    }
  },
  {
    "id": "graph-night",
    "name": "Graph paper at night",
    "mode": "dark",
    "t": {
      "bg": "#262624",
      "card": "#30302e",
      "card2": "#393937",
      "line": "#3d3d3a",
      "ink": "#faf9f5",
      "ink2": "#c2c0b6",
      "ink3": "#9c9a92",
      "accent": "#d885a2",
      "on": "#141413",
      "warn": "#e0a84f",
      "bad": "#f17059",
      "good": "#8baf78",
      "track": "#45453f",
      "tab": "#1f1e1d"
    },
    "radius": 6,
    "border": "1.5px solid #3d3d3a",
    "shadow": "3px 3px 0 #1f1e1d",
    "blur": "none",
    "fonts": {
      "ui": "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      "display": "'Newsreader', Georgia, serif",
      "num": "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    },
    "background": "linear-gradient(#3d3d3a 1px,transparent 1px) 0 0/60px 60px,linear-gradient(90deg,#3d3d3a 1px,transparent 1px) 0 0/60px 60px,linear-gradient(#3d3d3a 1px,transparent 1px) 0 0/12px 12px,linear-gradient(90deg,#3d3d3a 1px,transparent 1px) 0 0/12px 12px",
    "c": {
      "bg": "#262624",
      "surface": "#30302e",
      "accent": "#d885a2",
      "ink": "#faf9f5",
      "ink3": "#9c9a92"
    }
  }
] as const satisfies readonly Theme[];
export type ThemeId = (typeof themes)[number]['id'];
