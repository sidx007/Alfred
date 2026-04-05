import handler from "../../backend-api/activity.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default handler;
