// webpack v4
const webpack = require('webpack')
const path = require('path');
module.exports = {
  entry: {
    main: './src/index.js',
  },
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      },
      {
        test: /\.(md)$/,
        loader: 'ignore-loader',
      },
    ]
  },
  // ignore nodejs modules that are not being used to avoid not found error
  plugins: [
    new webpack.IgnorePlugin(/abort-controller/),
    new webpack.IgnorePlugin(/form-data/),
    new webpack.IgnorePlugin(/nano/), // CouchDB Client
    new webpack.IgnorePlugin(/node-localstorage/),
    new webpack.IgnorePlugin(/node-fetch/),
    new webpack.IgnorePlugin(/\@polkadot\/util-crypto/),
    new webpack.IgnorePlugin(/\@polkadot\/util/),
  ],
}


