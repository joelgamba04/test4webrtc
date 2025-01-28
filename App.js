import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Button,
  StyleSheet,
  LogBox,
  PermissionsAndroid,
  Alert,
  Linking,
} from "react-native";

import {
  RTCView,
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  registerGlobals,
} from "react-native-webrtc";

import io from "socket.io-client";

const SERVER_URL = "http://10.0.48.32:5000";
const iceServers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302", // Google's free STUN server
    },
  ],
};

// Ignore warnings (use sparingly)
LogBox.ignoreLogs(["Warning: ..."]);

// Add global error handler
const globalErrorHandler = (e, isFatal) => {
  console.error("Global Error:", e, isFatal);
};
if (global.ErrorUtils) {
  global.ErrorUtils.setGlobalHandler(globalErrorHandler);
}

const checkAndRequestPermissions = async () => {
  const permissions = [
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ];

  try {
    // Log permissions being checked
    permissions.forEach((perm) => console.log("Checking permission:", perm));

    // Check each permission
    const statuses = await Promise.all(
      permissions.map((permission) => PermissionsAndroid.check(permission))
    );

    // If all permissions are granted
    if (statuses.every((status) => status)) {
      console.log("All permissions are granted.");
      return true;
    }

    console.log("Some permissions are not granted. Requesting...");
    const granted = await PermissionsAndroid.requestMultiple(permissions);

    // Verify if all requested permissions are granted
    const allGranted = Object.values(granted).every(
      (result) => result === PermissionsAndroid.RESULTS.GRANTED
    );

    if (allGranted) {
      console.log("Permissions granted after request.");
      return true;
    } else {
      console.error("Some permissions are still denied.");
      return false;
    }
  } catch (error) {
    console.error("Error requesting permissions:", error);
    return false;
  }
};

const openAppSettings = () => {
  console.log("Opening app settings...");
  Alert.alert(
    "Permissions Required",
    "You need to enable permissions from the app settings.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => Linking.openSettings(),
      },
    ]
  );
};

const socket = io(SERVER_URL);

export default function App() {
  const [localstream, setLocalStream] = useState(null);

  const [me, setMe] = useState("");
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [name, setName] = useState("Caller");

  const userVideo = useRef();
  const peerConnection = useRef();

  registerGlobals();

  useEffect(() => {
    // Set up socket listeners
    if (socket) {
      socket.on("me", (id) => setMe(id));

      socket.on("callAccepted", async (signal) => {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(signal)
        );
        // setCallAccepted(true);
      });

      socket.on("receiveIceCandidate", ({ candidate }) => {
        if (candidate) {
          peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      });

      socket.on("endCall", () => endCall());
    }
  }, [socket]);

  const startCall = async () => {
    if (!stream) {
      console.log("Local stream is null, cannot call");
      return;
    }

    peerConnection.current = new RTCPeerConnection(iceServers);

    // Handle incoming tracks from the remote peer
    peerConnection.current.ontrack = (event) => {
      console.log("ontrack() RemoteStream: ", event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("sendIceCandidate", {
          candidate: event.candidate,
          to: "all",
        });
      }
    };

    stream.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, stream);
    });

    //Create and send the offer
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit("callAllUsers", { signalData: offer, from: me, name });
  };

  const endCall = () => {
    setCallEnded(true);
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    socket.emit("endCall");
    if (remoteStream) {
      setRemoteStream(null);
    }
  };

  const startLocalStream = async () => {
    console.log("startLocalStream()");
    const hasPermissions = await checkAndRequestPermissions();
    console.log("Permissions check result:", hasPermissions);

    if (!hasPermissions) {
      Alert.alert(
        "Permissions Required",
        "Please grant permissions from Settings to use this feature."
      );
      console.error("Permissions not granted");

      openAppSettings();
      return;
    } else {
      console.log("Permissions granted. Proceeding with app initialization...");
    }

    try {
      const localStream = await mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Local stream created:");
      setLocalStream(localStream);
      setStream(localStream);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {localstream && (
          <RTCView streamURL={stream.toURL()} style={styles.video} />
        )}
        {remoteStream && (
          <RTCView streamURL={remoteStream.toURL()} style={styles.video} />
        )}
      </View>
      <Button title="Start Local Stream" onPress={startLocalStream} />
      <Button title="Call All Users" onPress={startCall} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  videoContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  video: { width: 150, height: 200, backgroundColor: "black" },
});
