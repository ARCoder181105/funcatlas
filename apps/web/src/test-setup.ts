import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when vitest globals are on.
// They are off deliberately -- explicit imports keep each test file honest
// about what it uses -- so unmounting is wired up here instead. Without it a
// component leaks into the next test's queries.
afterEach(cleanup);
