import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("CHATGPT")!;
const OPENAI_MODEL = Deno.env.get("GPTMODEL") || "gpt-5-nano";
const RATE_LIMIT = parseInt(Deno.env.get("RATELIMIT") || "10");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEUCE_PROMPT = `You are Deuce, the mascot of PAC (Pokemon Auto Chess Live Data Calculator), a Chrome extension made by Deuce222X. You live inside the extension and chat with users who open your panel.

Personality:
- Casual, witty, warm. Talk like a chill gamer friend, not a customer service bot.
- Use short responses (1-3 sentences). No essays.
- You can joke around, react to what the user says, and have a real conversation.
- Match the user's energy — if they're hyped, be hyped. If they're frustrated, be empathetic.

How to handle different messages:
- General chat / greetings: Just be friendly and conversational. Ask them how their games are going, what comps they're running, etc.
- Bug reports: Take it seriously, say you'll flag it for the dev (Deuce222X). Ask for details if they're vague.
- Feature requests: Get excited about good ideas, say you'll add it to the list. Ask follow-up questions.
- Questions about PAC: Answer if you know, otherwise be honest that you're not sure.
- If someone mentions enjoying PAC, naturally suggest leaving a Chrome Web Store review — but don't force it into every message.
- Off-topic stuff: You can engage briefly but steer back to PAC/gaming naturally. Don't be a buzzkill.

IMPORTANT: Do NOT just say "thanks for the feedback" to everything. Actually read what the user said and respond to it specifically. Have a real conversation.

You MUST respond in JSON with exactly these fields:
{
  "reply": "your conversational response",
  "category": "chat" | "bug" | "feature" | "feedback"
}

Categories:
- "chat" — greetings, casual talk, questions, general convo. This is the default.
- "bug" — user is reporting a bug or issue with PAC.
- "feature" — user is requesting a new feature or improvement.
- "feedback" — user is giving specific feedback about PAC (positive or negative critique).

Be strict: only use bug/feature/feedback when the user is CLEARLY providing something actionable. "hello" is chat. "I love PAC" is chat. "the overlay glitches on mobile" is bug. "add dark mode" is feature.`;

interface ChatRequest {
  type: "chat";
  message: string;
  username?: string;
  history?: Array<{ role: string; content: string }>;
}

interface RagRequest {
  type: "rag";
  question: string;
  context?: string;
}

interface FeatureRequest {
  type: "feature";
  title: string;
  description: string;
}

interface FeedbackRequest {
  type: "feedback";
  category: "bug" | "feedback" | "other";
  message: string;
  extension_version?: string;
}

type PacRequest = ChatRequest | RagRequest | FeatureRequest | FeedbackRequest;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body: PacRequest & { user_id?: string } = await req.json();
    const userId = body.user_id || anonymousId(req);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const rateLimitOk = await checkRateLimit(supabase, userId);
    if (!rateLimitOk) {
      return jsonResponse(429, {
        error: "Rate limit exceeded. Try again later.",
        limit: RATE_LIMIT,
        window: "1 hour",
      });
    }

    await logRequest(supabase, userId, body.type);

    switch (body.type) {
      case "chat":
        return await handleChat(body, supabase, userId);
      case "rag":
        return await handleRag(body, supabase, userId);
      case "feature":
        return await handleFeature(body, supabase, userId);
      case "feedback":
        return await handleFeedback(body, supabase, userId);
      default:
        return jsonResponse(400, {
          error: "Invalid request type. Use: chat, rag, feature, or feedback",
        });
    }
  } catch (err) {
    console.error("PAC AI error:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});

async function handleChat(body: ChatRequest, supabase: any, userId: string) {
  if (!body.message || body.message.trim().length === 0) {
    return jsonResponse(400, { error: "Message is required" });
  }

  if (body.message.length > 2000) {
    return jsonResponse(400, { error: "Message too long (max 2000 chars)" });
  }

  const remaining = await getRemainingMessages(supabase, userId);

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: DEUCE_PROMPT },
  ];

  if (body.history && Array.isArray(body.history)) {
    for (const msg of body.history.slice(-20)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  const last = messages[messages.length - 1];
  if (!last || last.content !== body.message) {
    messages.push({ role: "user", content: body.message });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_completion_tokens: 300,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI error:", err);
    return jsonResponse(502, { error: "AI service unavailable" });
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  let reply = "Hey, something went wrong on my end. Try again?";
  let category = "chat";
  try {
    const parsed = JSON.parse(raw);
    reply = parsed.reply || reply;
    category = parsed.category || "chat";
  } catch {
    reply = raw || reply;
  }

  let feedbackId = null;
  if (category !== "chat") {
    const { data: fbData, error } = await supabase
      .from("pac_feedback")
      .insert({
        user_id: body.username || userId,
        category: category,
        message: body.message.trim(),
        extension_version: "5.0.0",
      })
      .select("id")
      .single();

    if (error) {
      console.error("DB insert error:", error);
    } else {
      feedbackId = fbData?.id || null;
    }
  }

  return jsonResponse(200, {
    reply,
    category,
    id: feedbackId,
    remaining: remaining - 1,
    limit: RATE_LIMIT,
  });
}

async function handleRag(body: RagRequest, supabase: any, userId: string) {
  if (!body.question || body.question.trim().length === 0) {
    return jsonResponse(400, { error: "Question is required" });
  }

  if (body.question.length > 2000) {
    return jsonResponse(400, { error: "Question too long (max 2000 chars)" });
  }

  const systemPrompt = `You are the PAC (Pokemon Auto Chess) assistant. You help users understand the game mechanics, strategies, and extension features.

Keep answers concise and helpful. If you don't know something, say so — don't make things up.

${body.context ? `\nRelevant context:\n${body.context}` : ""}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.question },
      ],
      max_completion_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI error:", err);
    return jsonResponse(502, { error: "AI service unavailable" });
  }

  const data = await response.json();
  const answer =
    data.choices?.[0]?.message?.content ||
    "Sorry, I couldn't generate a response.";

  return jsonResponse(200, {
    answer,
    model: OPENAI_MODEL,
    usage: data.usage,
  });
}

async function handleFeature(
  body: FeatureRequest,
  supabase: any,
  userId: string
) {
  if (!body.title || body.title.trim().length === 0) {
    return jsonResponse(400, { error: "Feature title is required" });
  }

  if (!body.description || body.description.trim().length === 0) {
    return jsonResponse(400, { error: "Feature description is required" });
  }

  if (body.title.length > 200) {
    return jsonResponse(400, { error: "Title too long (max 200 chars)" });
  }

  if (body.description.length > 5000) {
    return jsonResponse(400, {
      error: "Description too long (max 5000 chars)",
    });
  }

  const { error } = await supabase.from("pac_feature_requests").insert({
    user_id: userId,
    title: body.title.trim(),
    description: body.description.trim(),
    status: "new",
  });

  if (error) {
    console.error("Feature insert error:", error);
    return jsonResponse(500, { error: "Failed to save feature request" });
  }

  return jsonResponse(200, {
    success: true,
    message: "Feature request submitted!",
  });
}

async function handleFeedback(
  body: FeedbackRequest,
  supabase: any,
  userId: string
) {
  if (!body.message || body.message.trim().length === 0) {
    return jsonResponse(400, { error: "Feedback message is required" });
  }

  if (body.message.length > 5000) {
    return jsonResponse(400, { error: "Message too long (max 5000 chars)" });
  }

  const validCategories = ["bug", "feedback", "other"];
  const category = validCategories.includes(body.category)
    ? body.category
    : "other";

  const { error } = await supabase.from("pac_feedback").insert({
    user_id: userId,
    category,
    message: body.message.trim(),
    extension_version: body.extension_version || null,
  });

  if (error) {
    console.error("Feedback insert error:", error);
    return jsonResponse(500, { error: "Failed to save feedback" });
  }

  return jsonResponse(200, {
    success: true,
    message: "Feedback submitted — thanks!",
  });
}

async function getUsedMessages(
  supabase: any,
  userId: string
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("pac_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if (error) {
    console.error("Rate limit check error:", error);
    return 0;
  }

  return count || 0;
}

async function checkRateLimit(
  supabase: any,
  userId: string
): Promise<boolean> {
  const used = await getUsedMessages(supabase, userId);
  return used < RATE_LIMIT;
}

async function getRemainingMessages(
  supabase: any,
  userId: string
): Promise<number> {
  const used = await getUsedMessages(supabase, userId);
  return Math.max(0, RATE_LIMIT - used);
}

async function logRequest(
  supabase: any,
  userId: string,
  requestType: string
) {
  await supabase.from("pac_rate_limits").insert({
    user_id: userId,
    request_type: requestType,
  });
}

function anonymousId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return `anon_${simpleHash(forwarded + ua)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
