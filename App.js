import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Button,
  StyleSheet,
  LogBox,
  PermissionsAndroid,
  Platform,
} from "react-native";

import {
  RTCView,
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  MediaStreamTrack,
} from "react-native-webrtc";

import io from "socket.io-client";

const SERVER_URL = "http://10.0.48.42:5000";
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

const requestPermissions = async () => {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      if (
        granted[PermissionsAndroid.PERMISSIONS.CAMERA] !==
          PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !==
          PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.error("Permissions not granted");
        return false;
      }
    } catch (error) {
      console.error("Error requesting permissions:", error);
      return false;
    }
  }
  return true;
};

export default function App() {
  const [socketId, setSocketId] = useState(null);
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const socket = useRef(null);
  const peerConnection = useRef(null);

  useEffect(() => {
    // Connect to the signaling server
    socket.current = io(SERVER_URL);

    socket.current.on("connect", () => {
      console.log("Connected to signaling server:", socket.current.id);
      setSocketId(socket.current.id);
    });

    socket.current.on("callAllUsers", (data) => {
      console.log("Received callAllUsers:", data);
      handleIncomingCall(data);
    });

    socket.current.on("callAccepted", (signal) => {
      console.log("Call accepted:", signal);
      handleCallAccepted(signal);
    });

    socket.current.on("receiveIceCandidate", (data) => {
      console.log("Received ICE candidate:", data);
      handleIceCandidate(data);
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  const startLocalStream = async () => {
    console.log("startLocalStream()");
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      console.error("Permissions not granted");
      return;
    }

    try {
      const localStream = await mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(localStream);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  const callAllUsers = () => {
    console.log("callAllUsers() start");
    try {
      if (!stream) {
        console.error("callAllUsers Local stream is not available");
        return;
      } else {
        console.log("callAllUsers Local stream is available");
      }

      // close peer connection before creating a new one
      if (peerConnection.current) {
        console.log("close peer connection before creating a new one");
        peerConnection.current.close();
      }
      peerConnection.current = new RTCPeerConnection(iceServers);
      console.log(
        "callAllUsers Created peer connection:",
        peerConnection.current
      );

      // Add local tracks to the connection
      stream.getTracks().forEach((track) => {
        console.log(
          "Is track instance of MediaStreamTrack: ",
          track instanceof MediaStreamTrack
        );
        try {
          peerConnection.current.addTrack(track, stream);
          console.log("Adding local track:", track);
        } catch (error) {
          console.error("Error adding track:", error);
        }
      });

      // Create offer
      peerConnection.current.createOffer().then((offer) => {
        console.log("Created offer:");

        try {
          peerConnection.current.setLocalDescription(offer);
          socket.current.emit("callAllUsers", {
            from: socketId,
            signalData: offer,
            name: "React Native User",
          });
          console.log("Offer sent:");
        } catch (error) {
          console.error("Error setting local description:", error);
        }
      });

      // Listen for ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        console.log("ICE candidate event:", event);
        if (event.candidate) {
          console.log("Sending ICE candidate:", event.candidate);

          socket.current.emit("sendIceCandidate", {
            to: socketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote stream
      peerConnection.current.ontrack = (event) => {
        try {
          console.log("Received remote stream:", event.streams[0]);
          setRemoteStream(event.streams[0]);
        } catch (error) {
          console.error("Error receiving remote stream:", error);
        }
      };
    } catch (error) {
      console.error("Error calling all users:", error);
    }
  };

  const handleIncomingCall = (data) => {
    console.log("handleIncomingCall() start");
    try {
      if (!stream) {
        console.error("handleIncomingCall: Local stream is not available");
        return;
      }

      if (peerConnection.current) {
        console.log("close peer connection before creating a new one");
        peerConnection.current.close();
      }

      peerConnection.current = new RTCPeerConnection(iceServers);
      console.log(
        "handleIncomingCall Created peer connection:",
        peerConnection.current
      );

      // Add local tracks
      stream.getTracks().forEach((track) => {
        try {
          peerConnection.current.addTrack(track, stream);
          console.log("handleIncomingCall Added local track:", track);
        } catch (error) {
          console.error("Error adding track:", error);
        }
      });

      console.log("Remote signal data:", data.signalData);

      // Set remote description
      peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(data.signalData)
      );

      // Create answer
      peerConnection.current.createAnswer().then((answer) => {
        try {
          peerConnection.current.setLocalDescription(answer);

          // Send answer back
          socket.current.emit("answerCall", {
            to: data.from,
            signal: answer,
          });
        } catch (error) {
          console.log("setLocalDescription", error);
        }
      });

      // Handle remote stream
      peerConnection.current.ontrack = (event) => {
        try {
          console.log("Received remote stream:", event.streams[0]);
          setRemoteStream(event.streams[0]);
        } catch (error) {
          console.error("Error receiving remote stream:", error);
        }
      };
    } catch (error) {
      console.error("Error handling incoming call:", error);
    }
  };

  const handleCallAccepted = (signal) => {
    peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(signal)
    );
  };

  const handleIceCandidate = ({ candidate, from }) => {
    if (candidate) {
      try {
        peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE candidate added:", candidate);
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }
  };
  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {stream && <RTCView streamURL={stream.toURL()} style={styles.video} />}
        {remoteStream && (
          <RTCView streamURL={remoteStream.toURL()} style={styles.video} />
        )}
      </View>
      <Button title="Start Local Stream" onPress={startLocalStream} />
      <Button title="Call All Users" onPress={callAllUsers} />
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
