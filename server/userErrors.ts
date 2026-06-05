export function isOpenAIQuotaOrRateLimit(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("billing") ||
    normalized.includes("project limits") ||
    normalized.includes("insufficient_quota")
  );
}

export function toUserFacingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (isOpenAIQuotaOrRateLimit(message)) {
    return "AI 生成额度暂时不足，请联系管理员补充 OpenAI API 额度后再试。本次不会扣除 credits。";
  }

  if (message.includes("All OpenAI model candidates failed")) {
    return "AI 生成服务暂时不可用，请稍后重新生成。本次不会扣除 credits。";
  }

  return message || "生成失败，请稍后重试。";
}
