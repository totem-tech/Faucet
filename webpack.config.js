// webpack v4
const webpack = require('webpack')
const path = require('path');
module.exports = {
	entry: {
		main: ['babel-polyfill', './src/index.js'],
	},
	module: {
		rules: [
			// {
			//   test: /\.(js)$/,
			//   exclude: /node_modules/,
			//   use: ['babel-loader']
			// },
			{
				test: /\.(js)$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [
							// Use the latest version of ECMAScript
							[
								'@babel/preset-env',
								{ targets: 'last 2 versions' },
							],
							// Use the React preset for JSX support
							'@babel/preset-react',
						],
					},
				},
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


