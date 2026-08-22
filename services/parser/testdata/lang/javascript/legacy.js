const { helper } = require("./util.js");
const path = require("node:path");

function describe(value) {
  return helper(value);
}

const registry = {
  register(value) {
    return describe(value);
  },
};

module.exports = { describe, registry };
