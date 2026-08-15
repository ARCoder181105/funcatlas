import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import { Button } from "./ui/button";

/**
 * Switches the palette. Icon-only, and labelled for anyone who cannot see it.
 *
 * The label names the destination rather than the current state -- a control
 * says what it does, not what it is (UI_GUIDE §3.4).
 */
export function ThemeToggle() {
  const mode = useTheme((state) => state.mode);
  const toggle = useTheme((state) => state.toggle);
  const next = mode === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={`Switch to the ${next} theme`}
      title={`Switch to the ${next} theme`}
    >
      {mode === "dark" ? (
        <Sun strokeWidth={1.5} aria-hidden />
      ) : (
        <Moon strokeWidth={1.5} aria-hidden />
      )}
    </Button>
  );
}
