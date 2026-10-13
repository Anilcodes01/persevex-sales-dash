"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  COLOR_THEME_KEY,
  isColorTheme,
  type ColorTheme,
} from "../../shared/color-themes";
const CHANGE_EVENT = "persevex-color-theme-change";
let fallback: ColorTheme = "orange";
let memoryOnly = false;
function snapshot(): ColorTheme {
  if (memoryOnly) return fallback;
  try {
    const value = localStorage.getItem(COLOR_THEME_KEY);
    return isColorTheme(value) ? value : "orange";
  } catch {
    return fallback;
  }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === COLOR_THEME_KEY || event.key === null) {
      memoryOnly = false;
      if (event.newValue === null) fallback = "orange";
      listener();
    }
  };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
function setColorTheme(value: string) {
  if (!isColorTheme(value)) return;
  fallback = value;
  try {
    localStorage.setItem(COLOR_THEME_KEY, value);
    memoryOnly = false;
  } catch {
    memoryOnly = true; /* Still works for this session when storage is blocked. */
  }
  document.documentElement.dataset.colorTheme = value;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
const Context = createContext<{
  colorTheme: ColorTheme;
  setColorTheme: (value: string) => void;
} | null>(null);
export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const colorTheme = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "orange" as ColorTheme,
  );
  useEffect(() => {
    document.documentElement.dataset.colorTheme = snapshot();
  }, [colorTheme]);
  return (
    <Context.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </Context.Provider>
  );
}
export function useColorTheme() {
  const value = useContext(Context);
  if (!value) throw new Error("Colour theme provider missing");
  return value;
}
