require("dotenv").config();
const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

const DEFAULT_DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || "";
const DEFAULT_ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || "";
const DEFAULT_ONEDRIVE_AUTHORITY = process.env.ONEDRIVE_AUTHORITY || "";
const DEFAULT_REMOTELYSAVE_WEBSITE = process.env.REMOTELYSAVE_WEBSITE || "";
const DEFAULT_REMOTELYSAVE_CLIENT_ID = process.env.REMOTELYSAVE_CLIENT_ID || "";

module.exports = {
  entry: "./src/main.ts",
  target: "web",
  output: {
    filename: "main.js",
    path: __dirname,
    libraryTarget: "commonjs",
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.DEFAULT_DROPBOX_APP_KEY": `"${DEFAULT_DROPBOX_APP_KEY}"`,
      "process.env.DEFAULT_ONEDRIVE_CLIENT_ID": `"${DEFAULT_ONEDRIVE_CLIENT_ID}"`,
      "process.env.DEFAULT_ONEDRIVE_AUTHORITY": `"${DEFAULT_ONEDRIVE_AUTHORITY}"`,
      "process.env.DEFAULT_REMOTELYSAVE_WEBSITE": `"${DEFAULT_REMOTELYSAVE_WEBSITE}"`,
      "process.env.DEFAULT_REMOTELYSAVE_CLIENT_ID": `"${DEFAULT_REMOTELYSAVE_CLIENT_ID}"`,
    }),
    // Work around for Buffer is undefined:
    // https://github.com/webpack/changelog-v5/issues/10
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
  module: {
    rules: [
      {
        test: /\.worker\.ts$/,
        loader: "worker-loader",
        options: {
          inline: "no-fallback",
        },
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.svg?$/,
        type: "asset/source",
      },
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false, // process/browser returns some errors before
        },
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    mainFields: ["browser", "module", "main"],
    fallback: {
      // assert: require.resolve("assert"),
      // buffer: require.resolve("buffer/"),
      // console: require.resolve("console-browserify"),
      // constants: require.resolve("constants-browserify"),
      crypto: require.resolve("crypto-browserify"),
      // crypto: false,
      // domain: require.resolve("domain-browser"),
      // events: require.resolve("events"),
      fs: false,
      http: false,
      // http: require.resolve("stream-http"),
      https: false,
      // https: require.resolve("https-browserify"),
      net: false,
      // os: require.resolve("os-browserify/browser"),
      path: require.resolve("path-browserify"),
      // punycode: require.resolve("punycode"),
      process: require.resolve("process/browser"),
      // querystring: require.resolve("querystring-es3"),
      stream: require.resolve("stream-browserify"),
      // string_decoder: require.resolve("string_decoder"),
      // sys: require.resolve("util"),
      // timers: require.resolve("timers-browserify"),
      tls: false,
      // tty: require.resolve("tty-browserify"),
      url: require.resolve("url/"),
      // util: require.resolve("util"),
      // vm: require.resolve("vm-browserify"),
      vm: false,
      // zlib: require.resolve("browserify-zlib"),
    },
  },
  externals: {
    obsidian: "commonjs2 obsidian",
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({ extractComments: false })],
  },
};
