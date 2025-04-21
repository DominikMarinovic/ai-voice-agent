const bookCall = require("./bookCall");

const tools = [
  {
    type: "function",
    function: {
      name: "bookCall",
      say: "Provjerit ću dostupne termine i poslat ću vam link za rezervaciju.",
      description: "Book an AI strategy call for the eCommerce customer.",
      parameters: {
        type: "object",
        properties: {
          booking_time: {
            type: "string",
            description: "The requested date and time for the strategy call",
          },
          name: {
            type: "string",
            description: "Name of the customer",
          },
          email: {
            type: "string",
            description: "Email address of the customer",
          },
          phone: {
            type: "string",
            description: "Phone number of the customer",
          },
        },
        required: ["name", "email", "phone", "booking_time"],
      },
      handler: bookCall,

      returns: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Whether the booking was successful or not",
          },
          message: {
            type: "string",
            description: "Details about the booking or error message",
          },
        },
      },
    },
  },
];

module.exports = tools;
