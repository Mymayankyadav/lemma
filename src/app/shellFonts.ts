const google =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,500&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=STIX+Two+Text:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap";
/** Distinct family names let retained stylesheets coexist without changing v6. */
export function loadShellFonts(v7: boolean) {
  const id = v7 ? "lemma-v7-fonts" : "lemma-google-fonts";
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = v7 ? "/lemma/fonts/v7/fonts.css" : google;
    document.head.append(link);
  }
  for (const name of [
    "newsreader-normal-500-latin",
    "instrument-sans-normal-400-latin",
  ]) {
    const id = "lemma-preload-" + name,
      existing = document.getElementById(id);
    if (!v7) {
      existing?.remove();
      continue;
    }
    if (existing) continue;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "preload";
    link.as = "font";
    link.type = "font/woff2";
    link.crossOrigin = "";
    link.href = "/lemma/fonts/v7/" + name + ".woff2";
    document.head.append(link);
  }
}
