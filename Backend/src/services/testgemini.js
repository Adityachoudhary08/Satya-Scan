const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function test() {
  try {
    console.log("Key loaded:", !!process.env.GEMINI_API_KEY);
    console.log("Key prefix:", process.env.GEMINI_API_KEY?.substring(0, 8));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash",
    });

    const result = await model.generateContent("Reply with only the word: Hello");

    console.log("SUCCESS:");
    console.log(result.response.text());

  } catch (err) {
    console.log("ERROR:");
    console.dir(err, { depth: null });
  }
}

test();
