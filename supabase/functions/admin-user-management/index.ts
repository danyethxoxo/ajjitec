import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const siteUrl = (Deno.env.get("AJJITEC_SITE_URL") ?? "https://danyethxoxo.github.io/ajjitec").replace(/\/$/, "");
const allowedRoles = new Set(["admin", "sales", "inventory", "viewer"]);
const allowedOrigin = "https://danyethxoxo.github.io";

const resolvePublicKey = () => {
  const directKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (directKey) return directKey;

  try {
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    const defaultKeyName = publishableKeys.default;
    return defaultKeyName ? Deno.env.get(defaultKeyName) ?? "" : "";
  } catch {
    return "";
  }
};

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  const originIsAllowed = origin === allowedOrigin
    || origin.startsWith("http://localhost:")
    || origin.startsWith("http://127.0.0.1:");

  return {
    "Access-Control-Allow-Origin": originIsAllowed ? origin : allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const response = (request: Request, payload: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(payload),
  {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
    },
  },
);

const text = (value: unknown, maxLength = 160) => String(value ?? "").trim().slice(0, maxLength);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authErrorCode = (error: { code?: string; message?: string } | null) => {
  const value = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (value.includes("already") || value.includes("registered") || value.includes("exists")) {
    return "user_already_exists";
  }
  if (value.includes("rate limit")) return "email_rate_limited";
  return "auth_operation_failed";
};

const getAdminContext = async (request: Request) => {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: "not_authenticated" as const };
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "function_not_configured" as const };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const publicKey = resolvePublicKey();
  if (!publicKey) return { error: "function_not_configured" as const };

  const callerClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) return { error: "not_authenticated" as const };

  const { data: callerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,role,active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || callerProfile?.role !== "admin" || callerProfile.active !== true) {
    return { error: "not_authorized" as const };
  }

  return { serviceClient, caller: userData.user };
};

const inviteUser = async (request: Request, serviceClient: ReturnType<typeof createClient>, body: Record<string, unknown>) => {
  const email = text(body.email, 254).toLowerCase();
  const role = text(body.role, 32).toLowerCase();
  if (!emailPattern.test(email)) return response(request, { ok: false, error: "invalid_email" }, 400);
  if (!allowedRoles.has(role)) return response(request, { ok: false, error: "invalid_role" }, 400);

  const name = text(body.name, 120) || null;
  const company = text(body.company, 160) || null;
  const phone = text(body.phone, 50) || null;
  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/cuenta.html`,
    data: { name, company, phone },
  });
  if (error || !data.user) {
    return response(request, { ok: false, error: authErrorCode(error) }, 400);
  }

  const { error: profileError } = await serviceClient.from("profiles").upsert({
    id: data.user.id,
    email,
    name,
    company,
    phone,
    role,
    active: true,
  }, { onConflict: "id" });
  if (profileError) {
    await serviceClient.auth.admin.deleteUser(data.user.id);
    return response(request, { ok: false, error: "profile_creation_failed" }, 500);
  }

  return response(request, {
    ok: true,
    user: { id: data.user.id, email },
    role,
  });
};

const deleteUser = async (request: Request, serviceClient: ReturnType<typeof createClient>, callerId: string, body: Record<string, unknown>) => {
  const userId = text(body.userId, 80);
  if (!userId) return response(request, { ok: false, error: "invalid_user" }, 400);
  if (userId === callerId) return response(request, { ok: false, error: "cannot_delete_self" }, 400);

  const { data: target, error: targetError } = await serviceClient
    .from("profiles")
    .select("id,role,active")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) return response(request, { ok: false, error: "profile_lookup_failed" }, 500);

  if (target?.role === "admin" && target.active === true) {
    const { count, error: countError } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);
    if (countError) return response(request, { ok: false, error: "profile_lookup_failed" }, 500);
    if ((count ?? 0) <= 1) return response(request, { ok: false, error: "cannot_remove_last_admin" }, 400);
  }

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return response(request, { ok: false, error: "delete_failed" }, 400);
  return response(request, { ok: true, userId });
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, { ok: false, error: "method_not_allowed" }, 405);

  const context = await getAdminContext(request);
  if ("error" in context) {
    const status = context.error === "not_authenticated" ? 401 : context.error === "not_authorized" ? 403 : 500;
    return response(request, { ok: false, error: context.error }, status);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(request, { ok: false, error: "invalid_json" }, 400);
  }

  const action = text(body.action, 32).toLowerCase();
  if (action === "invite") return inviteUser(request, context.serviceClient, body);
  if (action === "delete") return deleteUser(request, context.serviceClient, context.caller.id, body);
  return response(request, { ok: false, error: "unknown_action" }, 400);
});
