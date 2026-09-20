// Web stub for react-native-webrtc
// On web, we use the browser's built-in WebRTC APIs directly.
// This file prevents Metro from trying to bundle the native module on web.

module.exports = {
    RTCPeerConnection: undefined,
    RTCSessionDescription: undefined,
    RTCIceCandidate: undefined,
    RTCView: () => null,
    MediaStream: undefined,
    MediaStreamTrack: undefined,
    mediaDevices: undefined,
    registerGlobals: () => {},
};
