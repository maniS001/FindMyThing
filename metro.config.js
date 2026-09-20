// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude react-native-webrtc from web builds (it's native-only, web uses browser WebRTC)
const originalResolver = config.resolver;
config.resolver = {
    ...originalResolver,
    resolveRequest: (context, moduleName, platform) => {
        if (platform === 'web' && moduleName === 'react-native-webrtc') {
            // Return an empty module on web — web uses browser's native WebRTC
            return {
                filePath: require.resolve('./stubs/webrtc.web.js'),
                type: 'sourceFile',
            };
        }
        return context.resolveRequest(context, moduleName, platform);
    },
};

module.exports = config;
