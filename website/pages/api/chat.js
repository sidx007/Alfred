import handler from "../../backend-api/chat.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default handler;