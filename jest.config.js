module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native)"
  ],
  modulePathIgnorePatterns: ["<rootDir>/.vercel/", "<rootDir>/dist/", "<rootDir>/backend/"],
  testPathIgnorePatterns: ["/node_modules/", "/.vercel/", "/dist/", "/backend/"]
};
