import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function testGroq() {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: "Hello Groq!" }],
        max_tokens: 50,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }
    );
    console.log("✅ Groq OK:", res.data.choices[0].message.content);
  } catch (err) {
    console.error("❌ Groq FAILED:", err.response?.status, err.response?.data || err.message);
  }
}

async function testGemini() {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: "Hello Gemini!" }] }] }
    );
    console.log("✅ Gemini OK:", res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error("❌ Gemini FAILED:", err.response?.status, err.response?.data || err.message);
  }
}

async function testDeepSeek() {
  try {
    const res = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: "Hello DeepSeek!" }],
        max_tokens: 50,
      },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );
    console.log("✅ DeepSeek OK:", res.data.choices[0].message.content);
  } catch (err) {
    console.error("❌ DeepSeek FAILED:", err.response?.status, err.response?.data || err.message);
  }
}

async function testYouTube() {
  try {
    const videoId = "dQw4w9WgXcQ"; // test video
    const res = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    );
    console.log("✅ YouTube OK:", res.data.items[0].snippet.title);
  } catch (err) {
    console.error("❌ YouTube FAILED:", err.response?.status, err.response?.data || err.message);
  }
}

async function runTests() {
  console.log("🔍 Testing Groq...");
  await testGroq();

  console.log("🔍 Testing Gemini...");
  await testGemini();

  console.log("🔍 Testing DeepSeek...");
  await testDeepSeek();

  console.log("🔍 Testing YouTube...");
  await testYouTube();
}

runTests();
