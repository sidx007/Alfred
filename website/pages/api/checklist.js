import handler from "../../backend-api/checklist.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default handler;