// PAC Chrome Extension — AI Proxy Edge Function
// Handles: Deuce chat, RAG questions, feature requests, feedback/bug reports
// Rate limited: 10 requests per user per hour
//
// Deploy: supabase functions deploy pac-ai
// Set secrets:
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase secrets set PAC_RATE_LIMIT=10
//   supabase secrets set OPENAI_MODEL=gpt-4o-mini

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ─── Config ─────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const RATE_LIMIT = parseInt(Deno.env.get("PAC_RATE_LIMIT") || "10");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Deuce System Prompt ────────────────────────────────────────────────────

const DEUCE_PROMPT = `You are Deuce, the friendly mascot of PAC (Pokemon Auto Chess Live Data Calculator), a Chrome extension by Deuce222X. You are helpful, casual, and encouraging.

Your goals:
1. Thank users for using PAC and encourage them to leave a Chrome Web Store review.
2. Collect feature requests and bug reports conversationally.
3. Keep responses SHORT (1-3 sentences). Be warm and use casual gamer language.
4. If a user reports a bug, acknowledge it and say you'll pass it to the dev.
5. If a user requests a feature, be enthusiastic and say you'll add it to the list.
6. Never make promises about timelines.
7. Never discuss topics unrelated to PAC or the game.`;

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Main Handler ───────────────────────────────────────────────────────────

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

    // Rate limit check
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

// ─── Chat Handler (Deuce mascot conversation) ──────────────────────────────

async function handleChat(body: ChatRequest, supabase: any, userId: string) {
  if (!body.message || body.message.trim().length === 0) {
    return jsonResponse(400, { error: "Message is required" });
  }

  if (body.message.length > 2000) {
    return jsonResponse(400, { error: "Message too long (max 2000 chars)" });
  }

  // Build messages with conversation history
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

  // Ensure current message is included
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
      max_tokens: 200,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI error:", err);
    return jsonResponse(502, { error: "AI service unavailable" });
  }

  const data = await response.json();
  const reply =
    data.choices?.[0]?.message?.content?.trim() || "Thanks for the feedback!";

  // Store in pac_feedback
  const { data: fbData, error } = await supabase
    .from("pac_feedback")
    .insert({
      user_id: body.username || userId,
      category: "feedback",
      message: body.message.trim(),
      extension_version: "5.0.0",
    })
    .select("id")
    .single();

  if (error) {
    console.error("DB insert error:", error);
  }

  return jsonResponse(200, { reply, id: fbData?.id || null });
}

// ─── RAG Handler ────────────────────────────────────────────────────────────

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
      max_tokens: 1000,
      temperature: 0.7,
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

// ─── Feature Request Handler ────────────────────────────────────────────────

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

// ─── Feedback Handler ───────────────────────────────────────────────────────

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

// ─── Rate Limiting ──────────────────────────────────────────────────────────

async function checkRateLimit(
  supabase: any,
  userId: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("pac_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if (error) {
    console.error("Rate limit check error:", error);
    return true; // fail open
  }

  return (count || 0) < RATE_LIMIT;
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

// ─── Utilities ──────────────────────────────────────────────────────────────

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
