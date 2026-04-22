module.exports = {
  default: {
    paths: ["src/core/tests/**/*.feature"],

    requireModule: ["ts-node/register", "dotenv/config"],
    require: [
      "src/core/tests/support/**/*.ts",
      "src/core/tests/**/step_definitions/**/*.ts",
    ],

    format: ["progress"],

    timeout: 300000,
    parallel: 1,
  },
};
