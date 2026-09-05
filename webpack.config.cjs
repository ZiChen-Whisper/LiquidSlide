const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = async (_env, argv) => {
  const isDev = argv.mode !== "production";
  return {
    devtool: isDev ? "source-map" : false,
    entry: "./src/index.tsx",
    output: {
      clean: true,
      filename: "taskpane.js",
      path: path.resolve(__dirname, "dist")
    },
    resolve: { extensions: [".ts", ".tsx", ".js"] },
    module: {
      rules: [
        { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: "ts-loader", options: { transpileOnly: true } } },
        { test: /\.css$/, use: ["style-loader", "css-loader"] }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({ template: "./src/taskpane.html", filename: "taskpane.html" }),
      new CopyWebpackPlugin({ patterns: [{ from: "assets", to: "assets" }] })
    ],
    devServer: {
      hot: true,
      headers: { "Access-Control-Allow-Origin": "*" },
      port: 3000,
      static: { directory: path.join(__dirname, "assets"), publicPath: "/assets" }
    }
  };
};
