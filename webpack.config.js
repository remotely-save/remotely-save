const path = require("path");

module.exports = {
  entry: "./main.ts",
  target: "node",
  output: {
    filename: "main.js",
    path: __dirname,
    libraryTarget: "commonjs",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    mainFields: ["module", "main"],
  },
  externals: {
    obsidian: "commonjs2 obsidian",
  },
};
