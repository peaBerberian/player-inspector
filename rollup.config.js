import typescript from "@rollup/plugin-typescript";

/**
 * Generate rollup config.
 * @param {Object} commandLineArgs
 * @returns {Object}
 */
export default (commandLineArgs) => {
  return {
    input: commandLineArgs.input,
    output: {
      file: commandLineArgs.configOutput,
      format: "iife",
    },
    plugins: [typescript()]
  };
};
