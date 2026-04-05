import handler from "../../backend-api/topics.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default handler;