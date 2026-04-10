const path = require('path');

module.exports = {
  target: 'node',
  externalsPresets: { node: true },
  entry: './src/index.ts',
  output: {
    filename: 'main.cjs',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json', // Explicitly use project tsconfig
            transpileOnly: true, // Faster builds with isolatedModules (type checking via tsc)
          },
        },
        exclude: /node_modules/,
      },
      { // required for: ./node_modules/canvas/build/Release/canvas.node (error: Module parse failed: Unexpected character '' (1:0))
        test: /\.node$/,
        loader: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    alias: {
      '@': path.resolve(__dirname, 'src/'), // Absolute import path for cleaner src/ imports
    },
  },
  externals: {
    bufferutil: 'bufferutil',
    'utf-8-validate': 'utf-8-validate',
    playwright: 'commonjs playwright',
    'playwright-core': 'commonjs playwright-core',
  }
};
