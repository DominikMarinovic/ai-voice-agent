// Example using axios (you'd need to install and import it)
const axios = require("axios");

fastify.post("/outbound-call", async (request, reply) => {
  const { number /* other custom data if needed */ } = request.body;
  const infobipCallPayload = {
    endpoint: { type: "PHONE", phoneNumber: number },
    from: process.env.INFOBIP_PHONE_NUMBER,
    callsConfigurationId: process.env.INFOBIP_CALLS_CONFIG_ID,
    // Potentially add customData here if you need to pass info
    // that your webhook or media stream handler might use
    customData: { userPrompt: prompt /* or other identifiers */ },
  };

  try {
    const response = await axios.post(
      `${process.env.INFOBIP_BASE_URL}/calls/1/calls`,
      infobipCallPayload,
      { headers: { Authorization: `ApiKey ${process.env.INFOBIP_API_KEY}` } }
    );
    const callId = response.data.id;
    // IMPORTANT: You don't start the media stream here yet.
    // You'll wait for a CALL_ESTABLISHED event from Infobip's webhook.
    // You might store the callId and associated prompt/data temporarily
    // (e.g., in a Map keyed by callId) if your event webhook needs it.
    fastify.log.info(`Infobip call initiated: ${callId}`);
    reply.send({
      success: true,
      message: "Call initiated with Infobip",
      callId,
    });
  } catch (error) {
    console.error(
      "Error initiating Infobip call:",
      error.response?.data || error.message
    );
    reply
      .code(500)
      .send({ success: false, error: "Failed to initiate call with Infobip" });
  }
});

fastify.post("/infobip-call-events", async (request, reply) => {
  const event = request.body;
  fastify.log.info({ infobipEvent: event }, "Received Infobip Call Event");

  const callId = event.callId; // Or however callId is provided in the event

  if (event.type === "CALL_ESTABLISHED") {
    // Check the exact event name from Infobip docs
    fastify.log.info(`Call ${callId} established. Starting media stream.`);
    try {
      const temporaryCallData = yourInMemoryStore.get(callId); // Retrieve if you stored prompt etc.

      await axios.post(
        `${process.env.INFOBIP_BASE_URL}/calls/1/calls/${callId}/start-media-stream`,
        {
          mediaStream: {
            audioProperties: {
              mediaStreamConfigId: process.env.INFOBIP_MEDIA_STREAM_CONFIG_ID,
              replaceMedia: true,
              // Consider adding sampleRate here if Infobip API for start-media-stream allows
              // to ensure consistency, e.g., sampleRate: 8000 (for 8kHz)
            },
          },
        },
        { headers: { Authorization: `ApiKey ${process.env.INFOBIP_API_KEY}` } }
      );
      fastify.log.info(`Media stream started for call ${callId}`);
    } catch (error) {
      console.error(
        `Error starting media stream for ${callId}:`,
        error.response?.data || error.message
      );
      // Potentially try to hang up the call if media can't start
    }
  } else if (event.type === "CALL_FINISHED" || event.type === "CALL_FAILED") {
    fastify.log.info(`Call ${callId} finished or failed. Cleaning up.`);
    // Clean up any resources associated with this callId
    // e.g., close ElevenLabs WebSocket, remove from temporary store
    const elevenLabsWs = activeElevenLabsSessions.get(callId); // Example store
    if (elevenLabsWs?.readyState === WebSocket.OPEN) {
      elevenLabsWs.close();
    }
    activeElevenLabsSessions.delete(callId);
  }
  // ... handle other events as needed

  reply.code(200).send(); // Acknowledge receipt of the event
});

fastify.register(async (fastifyInstance) => {
  fastifyInstance.get(
    "/infobip-media-audio", // Your WebSocket URL for Infobip media config
    { websocket: true },
    (ws, req) => {
      // Optional: Implement Basic Auth here if you configured it in Infobip media-stream-config
      const authHeader = req.headers.authorization;
      if (
        !authHeader ||
        !checkBasicAuth(
          authHeader,
          process.env.INFOBIP_WS_USER,
          process.env.INFOBIP_WS_PASS
        )
      ) {
        ws.terminate();
        return;
      }

      let callDetails = null; // To store { callId, sampleRate }
      let elevenLabsWs = null;
      let elevenLabsConfigSent = false;

      console.info("[Server] Infobip WebSocket client connecting...");

      ws.on("message", async (message) => {
        try {
          if (!callDetails) {
            // First message from Infobip should be JSON configuration
            const configMsg = JSON.parse(message.toString());
            if (configMsg.callId && configMsg.sampleRate) {
              callDetails = {
                callId: configMsg.callId,
                sampleRate: parseInt(configMsg.sampleRate, 10),
              };
              console.info(
                `[Infobip WS] Connection established for call ${callDetails.callId}, sampleRate: ${callDetails.sampleRate}`
              );

              // Now setup ElevenLabs for this call
              const signedUrl = await getSignedUrl(); // Your existing function
              elevenLabsWs = new WebSocket(signedUrl);
              activeElevenLabsSessions.set(callDetails.callId, elevenLabsWs); // Manage sessions

              elevenLabsWs.on("open", () => {
                console.log(`[ElevenLabs ${callDetails.callId}] Connected`);
                // Send initial config to ElevenLabs (your existing logic)
                // Ensure your SYSTEM_MESSAGE and first_message are appropriate
                const initialConfig = {
                  /* ... your existing initialConfig ... */
                };
                // You might want to adjust the language or first_message based on call context
                elevenLabsWs.send(JSON.stringify(initialConfig));
                elevenLabsConfigSent = true;
              });

              elevenLabsWs.on("message", (elData) => {
                const elMessage = JSON.parse(elData);
                // Process ElevenLabs messages (your existing logic for agent_response, audio, booking)
                // ...
                if (
                  elMessage.agent_response?.audio?.chunk ||
                  elMessage.audio?.chunk /* etc. */
                ) {
                  const audioBase64 =
                    elMessage.agent_response?.audio?.chunk ||
                    elMessage.audio?.chunk; // Adjust as per EL actual payload
                  if (audioBase64 && ws.readyState === WebSocket.OPEN) {
                    console.log(
                      `[ElevenLabs ${callDetails.callId}] Sending AI audio to Infobip`
                    );
                    const rawPcmAudio = Buffer.from(audioBase64, "base64");

                    // !!! CRITICAL STEP: Transcode/Resample if necessary !!!
                    // Ensure rawPcmAudio is 16-bit signed PCM at callDetails.sampleRate
                    // For example, if ElevenLabs gives 16kHz and Infobip expects 8kHz, you MUST downsample.
                    // If ElevenLabs gives ulaw and Infobip expects 16-bit PCM, you MUST decode.
                    // This step might require an audio library.
                    // For now, assuming it's already compatible or you handle it:
                    const audioToSend = rawPcmAudio; // Placeholder for potentially processed audio

                    // Infobip expects raw binary audio packets.
                    // Chunking (e.g. 1920 bytes for 48kHz/20ms, 320 bytes for 8kHz/20ms (8000*0.020*2))
                    const packetSize = callDetails.sampleRate * (20 / 1000) * 2; // (20ms packetization time, 2 bytes per sample)
                    for (let i = 0; i < audioToSend.length; i += packetSize) {
                      const chunk = audioToSend.subarray(i, i + packetSize);
                      ws.send(chunk); // Send binary data
                    }
                  }
                }
                // ... handle booking intent from ElevenLabs as before
              });
              elevenLabsWs.on("close", () =>
                console.log(`[ElevenLabs ${callDetails.callId}] Disconnected`)
              );
              elevenLabsWs.on("error", (err) =>
                console.error(`[ElevenLabs ${callDetails.callId}] Error:`, err)
              );
            } else {
              console.error(
                "[Infobip WS] First message was not valid config:",
                message.toString()
              );
              ws.terminate();
            }
          } else if (
            elevenLabsWs?.readyState === WebSocket.OPEN &&
            elevenLabsConfigSent
          ) {
            // Subsequent messages are raw binary audio from Infobip (user's speech)
            // message is a Buffer
            console.log(
              `[Infobip WS ${callDetails.callId}] Received user audio chunk, size: ${message.length} bytes`
            );
            const audioBase64 = message.toString("base64");
            elevenLabsWs.send(
              JSON.stringify({ user_audio_chunk: audioBase64 })
            );
          }
        } catch (error) {
          console.error(
            `[Infobip WS ${
              callDetails?.callId || "Unknown"
            }] Error processing message:`,
            error
          );
        }
      });

      ws.on("close", () => {
        console.log(
          `[Infobip WS ${callDetails?.callId || "Unknown"}] Client disconnected`
        );
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
        if (callDetails) activeElevenLabsSessions.delete(callDetails.callId);
      });
      ws.on("error", (err) => {
        console.error(
          `[Infobip WS ${callDetails?.callId || "Unknown"}] Error:`,
          err
        );
        if (elevenLabsWs?.readyState === WebSocket.OPEN) elevenLabsWs.close();
        if (callDetails) activeElevenLabsSessions.delete(callDetails.callId);
      });
    }
  );
});
// Helper map to manage ElevenLabs sessions per callId
const activeElevenLabsSessions = new Map();
