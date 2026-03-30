const { merge } = require('webpack-merge');
const commonConfig = require('./webpack.config.common');

module.exports = merge(commonConfig, {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    nodeEnv: 'production', // Replace process.env.NODE_ENV for minification/tree-shaking
  },
});
