const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname, {
    isCSSEnabled: true,
});

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

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

module.exports = config;
