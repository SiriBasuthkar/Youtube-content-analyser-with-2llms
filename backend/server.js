// server.js
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- API Keys ---
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// --- Groq configuration ---
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// --- Helper: extract YouTube video ID ---
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// --- Helper: get video data ---
async function getYouTubeVideoData(videoId) {
  const response = await axios.get(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
  );
  if (!response.data.items || response.data.items.length === 0) throw new Error('Video not found');

  const snippet = response.data.items[0].snippet;
  return {
    title: snippet.title,
    description: snippet.description,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    thumbnail: snippet.thumbnails.default.url
  };
}

// --- Helper: get transcript or fallback to description ---
async function getTranscript(videoId) {
  try {
    const response = await axios.get(`https://youtube-transcriptor.vercel.app/transcript?videoId=${videoId}`);
    if (response.data && response.data.transcript) return response.data.transcript;
    throw new Error('Transcript not available');
  } catch {
    const videoData = await getYouTubeVideoData(videoId);
    return videoData.description || "No transcript available.";
  }
}

// --- Groq API call ---
async function callGroq(messages, max_tokens = 1000) {
  const response = await axios.post(
    GROQ_API_URL,
    { model: GROQ_MODEL, messages, max_tokens },
    { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content.trim();
}

// --- Gemini API call (fixed) ---
async function callGemini(messages) {
  try {
    // Combine all messages into a single prompt
    const prompt = messages.map(m => m.content).join('\n\n');
    
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY
        }
      }
    );

    // Access response for Gemini 1.5
    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const content = candidates[0]?.content;
    if (!content || !content.parts || content.parts.length === 0) {
      throw new Error("No content parts in Gemini response");
    }

    return content.parts[0].text.trim();
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    throw new Error(`Gemini API call failed: ${err.message}`);
  }
}

// --- Dispatcher ---
async function callLLM(provider, messages, max_tokens = 1000) {
  switch (provider.toLowerCase()) {
    case 'groq':
      return callGroq(messages, max_tokens);
    case 'gemini':
      return callGemini(messages);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// --- JSON extractor ---
function extractJson(responseText) {
  if (!responseText) return [];
  let cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return [];
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) try { return JSON.parse(match[0]); } catch { return []; }
    return [];
  }
}

// --- Analyze coverage ---
async function analyzeCoverage(transcript, subtopics, provider) {
  const truncatedTranscript = transcript.length > 10000
    ? transcript.substring(0, 10000) + "... [truncated]"
    : transcript;

  const prompt = `You are an educational content analyst.
For each subtopic, analyze the transcript and return ONLY valid JSON in this format:
[
  { "subtopic": "<name>", "coverageScore": <0-100>, "evidence": "<1-2 sentences>" }
]

Transcript: """${truncatedTranscript}"""
Subtopics: ${JSON.stringify(subtopics)}`;

  const messages = [
    { role: 'system', content: 'You are an educational content analyst. Only output valid JSON.' },
    { role: 'user', content: prompt }
  ];

  try {
    const responseText = await callLLM(provider, messages, 2000);
    const subtopicAnalysis = extractJson(responseText);

    const normalized = subtopicAnalysis.map(item => ({
      subtopic: item.subtopic,
      coverageScore: Math.min(Math.max(parseInt(item.coverageScore) || 0, 0), 100),
      covered: (parseInt(item.coverageScore) || 0) >= 50,
      evidence: item.evidence || "No evidence provided."
    }));

    const overallScore = Math.round(
      normalized.reduce((sum, s) => sum + s.coverageScore, 0) / normalized.length
    );

    return {
      overallScore,
      subtopicAnalysis: normalized,
      summary: `Overall coverage based on ${subtopics.length} subtopics using ${provider}.`
    };
  } catch (err) {
    console.error(`Coverage analysis error: ${err.message}`);
    return {
      overallScore: 0,
      subtopicAnalysis: subtopics.map(sub => ({
        subtopic: sub,
        coverageScore: 0,
        covered: false,
        evidence: "Failed to generate coverage analysis."
      })),
      summary: `Failed to generate coverage analysis using ${provider}.`
    };
  }
}

// --- API endpoint ---
app.post('/api/analyze', async (req, res) => {
  try {
    const { youtubeUrl, topic, customSubtopics, provider = 'groq' } = req.body;

    if (!youtubeUrl || !topic || !customSubtopics?.length) {
      return res.status(400).json({ error: 'YouTube URL, topic, and at least one subtopic are required.' });
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL.' });

    const videoData = await getYouTubeVideoData(videoId);
    const transcript = await getTranscript(videoId);

    const analysis = await analyzeCoverage(transcript, customSubtopics, provider);

    res.json({
      success: true,
      provider,
      videoInfo: {
        videoId,
        title: videoData.title,
        channelTitle: videoData.channelTitle,
        publishedAt: videoData.publishedAt,
        thumbnail: videoData.thumbnail,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`
      },
      transcript: transcript.substring(0, 500) + (transcript.length > 500 ? '...' : ''),
      subtopics: customSubtopics,
      analysis
    });
  } catch (err) {
    console.error('Full analysis error:', err);
    console.error('Error response:', err.response?.data);
    res.status(500).json({ 
      error: err.message, 
      details: 'Please check API keys and try again.',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server running',
    hasGroqKey: !!GROQ_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasYouTubeKey: !!YOUTUBE_API_KEY
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Groq key configured: ${!!GROQ_API_KEY}`);
  console.log(`Gemini key configured: ${!!GEMINI_API_KEY}`);
  console.log(`YouTube key configured: ${!!YOUTUBE_API_KEY}`);
});