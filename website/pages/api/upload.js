import handler from "../../backend-api/upload.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default handler;