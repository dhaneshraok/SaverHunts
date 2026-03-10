const { getDefaultConfig } = require('expo/metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname, {
    isCSSEnabled: true,
});

// Monorepo: resolve packages from root node_modules
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
];

// For Web compatibility with certain libraries
config.resolver.extraNodeModules = {
    'inline-style-prefixer': path.resolve(monorepoRoot, 'node_modules/inline-style-prefixer'),
    '@react-native-async-storage/async-storage': path.resolve(monorepoRoot, 'node_modules/@react-native-async-storage/async-storage'),
};

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

// Fix: Replace import.meta.env with process.env for web builds (zustand v5 compatibility)
config.transformer = {
    ...config.transformer,
    unstable_allowRequireContext: true,
    getTransformOptions: async () => ({
        transform: {
            experimentalImportSupport: false,
            inlineRequires: true,
        },
    }),
};

module.exports = withTamagui(config, {
    components: ['tamagui'],
    config: './tamagui.config.ts',
    outputCSS: './tamagui.css',
});
