import { StatusBar } from "expo-status-bar";
import { StyleSheet, Button, View } from "react-native";
import { RTCView, mediaDevices } from "react-native-webrtc";

import React, { useRef, useState } from "react";

export default function App() {
  const [streamRef, setStreamRef] = useState(null);

  const startStream = async () => {
    const stream = await mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    console.log("started stream", stream);
    setStreamRef(stream);
    console.log("startStream streamRef", streamRef);
  };

  return (
    <View style={styles.container}>
      <RTCView
        streamURL={streamRef ? streamRef.toURL() : ""}
        style={styles.video}
      />
      <Button title="Start Stream" onPress={startStream} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "70%",
    backgroundColor: "black",
  },
});
