export default {
  paths: ["src/core/tests/**/*.feature"],

  requireModule: ["ts-node/register", "dotenv/config"],
  require: ["src/core/tests/**/step_definitions/**/*.ts"],

  format: ["progress"],
  publishQuiet: true,

  timeout: 180000,
};
