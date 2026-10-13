export const COLOR_THEMES = [
  { value: "orange", label: "Orange", swatch: "#c84f18" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "green", label: "Green", swatch: "#15803d" },
  { value: "purple", label: "Purple", swatch: "#7c3aed" },
  { value: "rose", label: "Rose", swatch: "#be123c" },
  { value: "teal", label: "Teal", swatch: "#0f766e" },
] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number]["value"];
export const COLOR_THEME_KEY = "persevex-color-theme";
export function isColorTheme(value: unknown): value is ColorTheme {
  return COLOR_THEMES.some((theme) => theme.value === value);
}
// Run before first paint so a saved colour does not flash back to orange.
export const COLOR_THEME_INIT = `try{var c=localStorage.getItem(${JSON.stringify(COLOR_THEME_KEY)});document.documentElement.dataset.colorTheme=${JSON.stringify(COLOR_THEMES.map((t) => t.value))}.includes(c)?c:"orange"}catch{document.documentElement.dataset.colorTheme="orange"}`;
