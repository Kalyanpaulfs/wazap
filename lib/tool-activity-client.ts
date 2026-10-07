export type NewToolKey = "chatInsights" | "replyGenerator" | "messageScheduler";
export async function recordToolUse(tool: NewToolKey, action: string) {
  const key = `wazap_tool_${tool}_${new Date().toISOString().slice(0, 10)}`;
  const response = await fetch("/api/tools/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, action }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 429)
    throw new Error("You reached today’s plan limit. Upgrade to continue.");
  if (!response.ok)
    throw new Error(
      data.error || "This action could not be completed. Please try again.",
    );
  if (!data.authenticated) {
    const limits: Record<NewToolKey, number> = {
      chatInsights: 1,
      replyGenerator: 5,
      messageScheduler: 3,
    };
    const used = Number(localStorage.getItem(key) || 0);
    if (used >= limits[tool])
      throw new Error(
        "You reached today’s free limit. Create an account or upgrade to continue.",
      );
    localStorage.setItem(key, String(used + 1));
  }
  window.gtag?.("event", "tool_success", {
    tool_name: tool,
    tool_action: action,
  });
  return data;
}
