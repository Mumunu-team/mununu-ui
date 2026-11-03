import { Link } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import { Button } from "../common/Button";
import { KeyboardShortcutsHelp } from "../common/KeyboardShortcutsHelp";
import { LanguageSelector } from "../common/LanguageSelector";

export const Header = () => {
  const { theme, toggleTheme } = useAppStore();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center justify-between h-12 px-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span
              className="text-2xl font-extrabold tracking-tight"
              style={{
                background:
                  "linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0066ff, #4400cc, #8800ff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              MUNUNU
            </span>
            <span
              className="border-l border-gray-300 pl-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:border-gray-600 dark:text-gray-400"
              data-testid="header-caption"
            >
              Spec Playground
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSelector />
          <KeyboardShortcutsHelp />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </Button>
        </div>
      </div>
    </header>
  );
};
