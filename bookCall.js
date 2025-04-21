import axios from "axios";

const WEBHOOK_URL =
  "https://logically-trusting-rhino.ngrok-free.app/webhook-test/73477c4d-860a-46a6-a847-9a56b843912f";

const bookCall = async function (args) {
  try {
    // Send booking request to webhook with name, email, phone, and booking time
    const response = await axios.post(WEBHOOK_URL, {
      name: args.name,
      email: args.email,
      phone: args.phone,
      booking_time: args.booking_time,
    });

    // Parse the webhook response
    const data = response.data;
    const status = data.Status || "unknown";
    const bookingMessage = data.Booking || "Unable to process booking request";

    // Return formatted response
    return {
      status: status === "Successful" ? "success" : "failed",
      message:
        status === "Successful"
          ? `Successfully booked your service for ${args.booking_time}. ${bookingMessage}`
          : `Booking unsuccessful: ${bookingMessage}`,
    };
  } catch (error) {
    console.error("Error booking service:", error);
    return {
      status: "failed",
      message:
        "Sorry, there was an error processing your booking request. Please try again or call during business hours.",
    };
  }
};

export default bookCall;
