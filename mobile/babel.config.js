module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Transform import.meta.env → process.env for web compatibility (zustand v5)
            importMetaTransformPlugin,
            'react-native-reanimated/plugin',
        ],
    };
};

// Custom Babel plugin: replaces `import.meta.env.X` with `process.env.X`
// and `import.meta.env` with `process.env`
function importMetaTransformPlugin() {
    return {
        visitor: {
            MetaProperty(path) {
                // Match `import.meta`
                if (
                    path.node.meta.name === 'import' &&
                    path.node.property.name === 'meta'
                ) {
                    const parent = path.parentPath;
                    // `import.meta.env.X` → `process.env.X`
                    // `import.meta.env` → `process.env`
                    if (
                        parent.isMemberExpression() &&
                        parent.node.property.name === 'env'
                    ) {
                        parent.replaceWith(
                            require('@babel/types').memberExpression(
                                require('@babel/types').identifier('process'),
                                require('@babel/types').identifier('env')
                            )
                        );
                    }
                }
            },
        },
    };
}
