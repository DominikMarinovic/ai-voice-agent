import WebSocket from "ws";
import Twilio from "twilio";

export function registerOutboundRoutes(fastify) {
  // Check for required environment variables
  const {
    ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
  } = process.env;

  if (
    !ELEVENLABS_API_KEY ||
    !ELEVENLABS_AGENT_ID ||
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_PHONE_NUMBER
  ) {
    console.error("Missing required environment variables");
    throw new Error("Missing required environment variables");
  }

  // Initialize Twilio client
  const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  // Helper function to get signed URL for authenticated conversations
  async function getSignedUrl() {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
        {
          method: "GET",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get signed URL: ${response.statusText}`);
      }

      const data = await response.json();
      return data.signed_url;
    } catch (error) {
      console.error("Error getting signed URL:", error);
      throw error;
    }
  }

  // Route to initiate outbound calls
  fastify.post("/outbound-call", async (request, reply) => {
    fastify.log.info(
      { bodyReceived: request.body },
      "Received body in /outbound-call"
    );

    const { number, prompt } = request.body;

    if (!number) {
      return reply.code(400).send({ error: "Phone number is required" });
    }

    try {
      const call = await twilioClient.calls.create({
        from: TWILIO_PHONE_NUMBER,
        to: number,
        url: `https://${
          request.headers.host
        }/outbound-call-twiml?prompt=${encodeURIComponent(prompt)}`,
      });

      reply.send({
        success: true,
        message: "Call initiated",
        callSid: call.sid,
      });
    } catch (error) {
      console.error("Error initiating outbound call:", error);
      reply.code(500).send({
        success: false,
        error: "Failed to initiate call",
      });
    }
  });

  // TwiML route for outbound calls
  fastify.all("/outbound-call-twiml", async (request, reply) => {
    const prompt = request.query.prompt || "";

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${prompt}" />
          </Stream>
        </Connect>
      </Response>`;

    reply.type("text/xml").send(twimlResponse);
  });

  // WebSocket route for handling media streams
  fastify.register(async (fastifyInstance) => {
    fastifyInstance.get(
      "/outbound-media-stream",
      { websocket: true },
      (ws, req) => {
        console.info("[Server] Twilio connected to outbound media stream");

        // Variables to track the call
        let streamSid = null;
        let callSid = null;
        let elevenLabsWs = null;
        let customParameters = null; // Add this to store parameters

        // Handle WebSocket errors
        ws.on("error", console.error);

        // Set up ElevenLabs connection
        const setupElevenLabs = async () => {
          try {
            const signedUrl = await getSignedUrl();
            elevenLabsWs = new WebSocket(signedUrl);

            elevenLabsWs.on("open", () => {
              console.log("[ElevenLabs] Connected to Conversational AI");

              // Send initial configuration with prompt and first message
              const initialConfig = {
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                  agent: {
                    prompt: {
                      prompt: `Ti si "Ivana", glasovni AI strateg koji razgovara na hrvatskom jeziku i pomaže vlasnicima eCommerce brendova razumjeti kako AI agenti mogu povećati prodaju. Tvoj cilj je pružiti iskustvo u stvarnom vremenu — simulaciju glasovnog poziva AI agenta koji automatski zove kupce koji su napustili košaricu.

Govoriš toplo, samouvjereno i prijateljski, bez agresivnog prodajnog tona.

❶ Kada korisnik primi poziv, započni s:

"Pozdrav, zovem jer vas zanima kako funkcionira AI agent koji poziva ljude koji su ostavili košaricu na web stranici, jesam li u pravu?"

Ako korisnik potvrdi, nastavi s:

"Super! Prije nego krenemo, možete li mi reći vaše ime?"

Kada korisnik kaže svoje ime, zapamti ga i reci:

"Drago mi je, [IME]. Evo možemo preći na roleplay. Vi ste ostavili košaricu na web stranici i ja vas zovem — može?"

Ako korisnik potvrdi, simuliraj pravi poziv napuštene košarice:

"Pozdrav [IME], zovem iz Torino trgovine, primijetili smo da ste ostavili [proizvod] u košarici. Samo želim provjeriti je li sve u redu i mogu li vam nekako pomoći dovršiti narudžbu?"

Pričekaj na odgovor korisnika i onda pređi na sljedeće.

Uključi još jednu ili dvije interakcije:

"Ako želite, mogu vam ponuditi dodatnih 10% popusta kako biste danas završili narudžbu. Zvuči dobro?"

Nakon roleplaya, objasni korisniku:

"Eto, upravo ste iskusili kako funkcionira naš AI agent koji ove pozive obavlja automatski — bez ljudske intervencije. Ovaj agent radi 24/7 i pomaže brendovima povećati prodaju za 20–30%."

❷ Zatim postavi 3 kvalifikacijska pitanja:

1. "Koji proizvodi se prodaju u vašem web shopu?"
2. "Imate li već Facebook ili TikTok oglase?"
3. "Što Vam trenutno predtsavlja najveći problme — privlačenje kupaca, zadržavanje kupaca, ili nešto drugo?"

❸ Na temelju odgovora, preporuči AI agente:

"Na temelju vaših odgovora, preporučio bih barem dva agenta: jednog za pozive napuštenih košarica i jednog za AI kreaciju oglasa."

Objasni:

"Ove agente možemo instalirati u vašu trgovinu bez dodatnog posla s vaše strane — sve radi automatski, u pozadini."

❹ Zatvori s pozivom na akciju:

"Želite da rezerviram poziv s našim timom koji će vam to sve demonstrirati? Samo potvrdite i poslat ću vam link za rezervaciju termina."

Ako korisnik kaže "da", aktiviraj webhook ili SMS/email za booking link.

Ako korisnik nije siguran, reci:

"Nema problema. Mogu vam također poslati primjer AI agenta na Vaš emaila ako želite kasnije pogledati. Želite li to?"

Uvijek vodi razgovor prirodno, kao pravi strateg koji želi pomoći eCommerce vlasniku da otključa rast kroz automatizaciju i AI.`,
                    },
                    first_message:
                      "Pozdrav, zovem jer vas zanima kako funkcionira AI agent koji poziva ljude koji su ostavili košaricu na web stranici, jesam li u pravu?",
                    language: "hr",
                  },
                },
              };

              console.log(
                "[ElevenLabs] Sending initial config with prompt:",
                initialConfig.conversation_config_override.agent.prompt.prompt
              );

              // Send the configuration to ElevenLabs
              elevenLabsWs.send(JSON.stringify(initialConfig));
            });

            elevenLabsWs.on("message", (data) => {
              try {
                const message = JSON.parse(data);

                switch (message.type) {
                  case "conversation_initiation_metadata":
                    console.log("[ElevenLabs] Received initiation metadata");
                    break;

                  // --- ADD THIS CASE ---
                  case "agent_response":
                    console.log("[ElevenLabs] Received agent_response"); // Log that we got here
                    if (streamSid) {
                      // Check if the response contains audio (adjust path if needed based on ElevenLabs API/logging)
                      const audioChunk =
                        message.agent_response?.audio?.chunk ||
                        message.agent_response?.audio_event?.audio_base_64;
                      if (audioChunk) {
                        console.log(
                          "[ElevenLabs] Sending agent audio chunk to Twilio"
                        );
                        const audioData = {
                          event: "media",
                          streamSid,
                          media: {
                            payload: audioChunk, // Use the extracted audio chunk
                          },
                        };
                        ws.send(JSON.stringify(audioData));
                      } else {
                        console.log(
                          "[ElevenLabs] agent_response received, but no audio chunk found in expected location."
                        );
                      }
                    } else {
                      console.log(
                        "[ElevenLabs] Received agent_response but no StreamSid yet"
                      );
                    }
                    break;
                  // --- END ADDED CASE ---

                  case "audio":
                    if (streamSid) {
                      if (message.audio?.chunk) {
                        const audioData = {
                          event: "media",
                          streamSid,
                          media: {
                            payload: message.audio.chunk,
                          },
                        };
                        ws.send(JSON.stringify(audioData));
                      } else if (message.audio_event?.audio_base_64) {
                        const audioData = {
                          event: "media",
                          streamSid,
                          media: {
                            payload: message.audio_event.audio_base_64,
                          },
                        };
                        ws.send(JSON.stringify(audioData));
                      }
                    } else {
                      console.log(
                        "[ElevenLabs] Received audio but no StreamSid yet"
                      );
                    }
                    break;

                  case "interruption":
                    if (streamSid) {
                      ws.send(
                        JSON.stringify({
                          event: "clear",
                          streamSid,
                        })
                      );
                    }
                    break;

                  case "ping":
                    if (message.ping_event?.event_id) {
                      elevenLabsWs.send(
                        JSON.stringify({
                          type: "pong",
                          event_id: message.ping_event.event_id,
                        })
                      );
                    }
                    break;

                  default:
                    console.log(
                      `[ElevenLabs] Unhandled message type: ${message.type}`
                    );
                }
              } catch (error) {
                console.error("[ElevenLabs] Error processing message:", error);
              }
            });

            elevenLabsWs.on("error", (error) => {
              console.error("[ElevenLabs] WebSocket error:", error);
            });

            elevenLabsWs.on("close", () => {
              console.log("[ElevenLabs] Disconnected");
            });
          } catch (error) {
            console.error("[ElevenLabs] Setup error:", error);
          }
        };

        // Set up ElevenLabs connection
        setupElevenLabs();

        // Handle messages from Twilio
        ws.on("message", (message) => {
          try {
            const msg = JSON.parse(message);
            console.log(`[Twilio] Received event: ${msg.event}`);

            switch (msg.event) {
              case "start":
                streamSid = msg.start.streamSid;
                callSid = msg.start.callSid;
                customParameters = msg.start.customParameters; // Store parameters
                console.log(
                  `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`
                );
                console.log("[Twilio] Start parameters:", customParameters);
                break;

              case "media":
                if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                  const audioMessage = {
                    user_audio_chunk: Buffer.from(
                      msg.media.payload,
                      "base64"
                    ).toString("base64"),
                  };
                  elevenLabsWs.send(JSON.stringify(audioMessage));
                }
                break;

              case "stop":
                console.log(`[Twilio] Stream ${streamSid} ended`);
                if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                  elevenLabsWs.close();
                }
                break;

              default:
                console.log(`[Twilio] Unhandled event: ${msg.event}`);
            }
          } catch (error) {
            console.error("[Twilio] Error processing message:", error);
          }
        });

        // Handle WebSocket closure
        ws.on("close", () => {
          console.log("[Twilio] Client disconnected");
          if (elevenLabsWs?.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
          }
        });
      }
    );
  });
}
