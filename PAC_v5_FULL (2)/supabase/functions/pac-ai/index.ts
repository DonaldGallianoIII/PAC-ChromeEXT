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

const DEUCE_PROMPT = `You are Deuce, the mascot of PAC (Pokemon Auto Chess Live Data Calculator), a Chrome extension by Deuce222X.

Rules:
- 1-2 sentences MAX. Never more.
- Casual gamer tone. Not a customer service bot.
- Do NOT ask follow-up questions. Just acknowledge and move on.
- Bug reports: "Noted, the dev will see this." Done.
- Feature requests: "Cool idea, noted." Done.
- Feedback: Acknowledge it briefly. Done.
- Greetings: Be chill. One sentence.
- If they mention liking PAC, suggest a Chrome Web Store review. Once.
- NEVER claim you can tag, prioritize, track, create tickets, notify anyone, or follow up. You have no database, no memory, no Jira, no tools. You can ONLY acknowledge what the user said. The dev reads these later. Do not lie about capabilities you do not have.

Respond in JSON: {"reply": "your 1-2 sentence response"}
If JSON is too hard, just reply with plain text.`;

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
      max_completion_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI error:", err);
    return jsonResponse(502, { error: "AI service unavailable" });
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  // Extract reply from Nano (may be JSON or plain text)
  let reply = "Hey, something went wrong on my end. Try again?";
  try {
    const parsed = JSON.parse(raw);
    reply = parsed.reply || reply;
  } catch {
    reply = raw || reply;
  }

  // Classify message server-side — don't trust Nano for save decisions
  const classification = classifyMessage(body.message.trim());

  let feedbackId = null;
  if (classification.save) {
    const { data: fbData, error } = await supabase
      .from("pac_feedback")
      .insert({
        user_id: body.username || userId,
        category: classification.category,
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
    category: classification.category,
    saved: classification.save,
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
      max_completion_tokens: 4000,
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

// ─── Server-Side Message Classification (no AI dependency) ──────────────

function classifyMessage(msg: string): { save: boolean; category: string } {
  const lower = msg.toLowerCase().trim();

  // Skip short greetings and filler
  const skip = /^(hi|hey|hello|yo|sup|what'?s up|howdy|hola|lol|lmao|ok|okay|k|thanks|thx|ty|gm|gn|gg|nice|cool|wow|bruh|haha|nah|yep|yea|yes|no|nope|test|testing)[\.\!\?]*$/;
  if (lower.length < 20 && skip.test(lower)) {
    return { save: false, category: "chat" };
  }

  // Bug indicators
  if (/\b(bug|broken|crash|glitch|error|not working|doesn'?t work|won'?t|can'?t|issue|problem|fix|stuck|freeze|lag|wrong|fail)\b/i.test(msg)) {
    return { save: true, category: "bug" };
  }

  // Feature indicators
  if (/\b(add|feature|request|could you|can you|would be nice|should have|wish|want|need|suggestion|idea|implement|option|toggle|setting|mode)\b/i.test(msg)) {
    return { save: true, category: "feature" };
  }

  // Anything 25+ characters that isn't a greeting is worth saving
  if (lower.length >= 25) {
    return { save: true, category: "feedback" };
  }

  return { save: false, category: "chat" };
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
