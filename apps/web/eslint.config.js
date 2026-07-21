import { config } from "@funcatlas/eslint-config/base";

export default [
  ...config,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
